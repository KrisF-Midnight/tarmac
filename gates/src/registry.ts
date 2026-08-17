import { tail } from "./exec";
import { IMAGE_FACT } from "./facts";
import { type ImageName, digestFrom, imageNameFor } from "./image";
import type { Gate, GateContext, GateOutcome } from "./types";

/**
 * The gates, and the contract they imply.
 *
 * An application rides this road by providing three things and nothing else:
 * a `typecheck` script, a `test` script, and a Dockerfile at the repo root.
 * That is the entire integration surface. Anything the platform needs beyond
 * those belongs in the platform, not in a per-app config file — the moment
 * apps start configuring the road, it stops being paved.
 *
 * The order here is the order they run, and it is chosen so the cheapest thing
 * that can fail fails first.
 */

/** Wraps a command so a gate definition stays one readable object. */
async function runCommand(
  ctx: GateContext,
  cmd: string[],
  onFail: string,
): Promise<GateOutcome> {
  const { code, stdout, stderr } = await ctx.exec(cmd, { cwd: ctx.appDir });
  if (code === 0) return { status: "passed", summary: `\`${cmd.join(" ")}\`` };

  return {
    status: "failed",
    summary: onFail,
    details: tail(`${stdout}\n${stderr}`.trim()),
  };
}

/**
 * Installing is setup, not a check — except that `--frozen-lockfile` turns it
 * into one. It fails when the lockfile disagrees with package.json, which is
 * how an unreviewed dependency gets into a build. Running it as a gate rather
 * than as a workflow step also keeps the local and CI paths identical: without
 * it, CI would need a setup step the laptop does not have, and the parity claim
 * would be false at the very first step.
 */
const deps: Gate = {
  id: "deps",
  title: "Dependencies",
  severity: "blocking",
  rationale:
    "A lockfile that disagrees with package.json means the build resolved something nobody " +
    "reviewed. Installing frozen makes that a failure instead of a silent resolution.",
  run: (ctx) => runCommand(ctx, ["bun", "install", "--frozen-lockfile"], "lockfile is out of date"),
};

const typecheck: Gate = {
  id: "typecheck",
  title: "Types",
  severity: "blocking",
  rationale:
    "A type error is a defect the compiler already found. Letting it through would mean " +
    "the pipeline knowingly shipped a known bug, and the fix is always cheap.",
  run: (ctx) => runCommand(ctx, ["bun", "run", "typecheck"], "type errors"),
};

const unitTests: Gate = {
  id: "unit-tests",
  title: "Unit tests",
  severity: "blocking",
  rationale:
    "The app's own statement of what it must do. If the road does not enforce it, the road " +
    "is optional.",
  run: (ctx) => runCommand(ctx, ["bun", "test"], "failing tests"),
};

/** `ghcr.io/owner/app:sha` and a digest, recombined into something pullable. */
function referenceFor(image: ImageName, digest: string): string {
  return `${image.ref.split(":")[0]}@${digest}`;
}

/**
 * Has this exact commit already been built and published?
 *
 * This exists because `docker build` is not reproducible. Docker stamps a
 * wall-clock `created` into the image config on every build, so building the
 * same source twice yields two different digests — and since the digest is what
 * gets committed to the deployment repo, a re-run of an unchanged pipeline was
 * producing a fresh commit and rolling the pods for a byte-identical
 * application. Not a hypothetical: it was found by re-running a green pipeline
 * and diffing the result. See decision 38.
 *
 * The fix is not to make the build reproducible but to not build twice. Images
 * are already addressed by commit SHA, so that tag is the idempotency key and
 * it costs nothing to consult. Same commit, same digest, and `promote`'s
 * no-op-on-unchanged-digest path finally becomes reachable.
 *
 * Only on a push. A pull request must genuinely build, every time — the build
 * IS the gate there, and a PR's SHA is a merge commit that was never published
 * anyway. Every failure here returns null and falls through to a real build:
 * not logged in, no such tag, network trouble and a malformed digest are all
 * the same answer, "cannot prove it is already there", and the safe response to
 * that is to build.
 */
async function publishedDigest(ctx: GateContext, image: ImageName): Promise<string | null> {
  if (!image.publishable || ctx.event !== "push") return null;

  const pulled = await ctx.exec(["docker", "pull", "--quiet", image.ref], { cwd: ctx.appDir });
  if (pulled.code !== 0) return null;

  const inspect = await ctx.exec(
    ["docker", "inspect", "--format", "{{index .RepoDigests 0}}", image.ref],
    { cwd: ctx.appDir },
  );
  if (inspect.code !== 0) return null;

  try {
    return digestFrom(inspect.stdout);
  } catch {
    return null;
  }
}

const imageBuild: Gate = {
  id: "image-build",
  title: "Image build",
  severity: "blocking",
  rationale:
    "An app that does not build cannot deploy. Running it on every PR rather than only on " +
    "merge means the Dockerfile is covered by review like everything else.",
  run: async (ctx) => {
    const image = imageNameFor({ appName: appNameOf(ctx), env: ctx.env });

    // Skipped rather than passed, and the distinction is deliberate: this run
    // did not build anything, and a gate that says "passed" for work it did not
    // do is how a pipeline starts lying about what it checked. The commit it
    // reuses was built and gated on an earlier run of this same gate.
    const existing = await publishedDigest(ctx, image);
    if (existing) {
      return { status: "skipped", summary: `already built: ${referenceFor(image, existing)}` };
    }

    const outcome = await runCommand(
      ctx,
      ["docker", "build", "-t", image.ref, "."],
      "image build failed",
    );
    return outcome.status === "passed" ? { ...outcome, summary: image.ref } : outcome;
  },
};

/**
 * Publishing is the one gate that changes the outside world, so it is confined
 * to a merge. On a pull request the image is built and thrown away; nothing
 * reaches the registry until the change is on the default branch. Registry
 * login stays in the workflow — it is genuinely a GitHub-native concern and
 * pretending otherwise would mean handling credentials in here.
 */
const imagePublish: Gate = {
  id: "image-publish",
  title: "Image publish",
  severity: "blocking",
  rationale:
    "The digest committed to the deployment repo has to resolve on any machine. A push that " +
    "silently failed would surface as an ImagePullBackOff much later, far from the cause.",
  appliesTo: (ctx) => ctx.event === "push",
  run: async (ctx) => {
    const image = imageNameFor({ appName: appNameOf(ctx), env: ctx.env });
    if (!image.publishable) {
      return { status: "skipped", summary: "no registry context" };
    }

    // Already published for this commit. Passed rather than skipped, because
    // unlike the build gate this one's job is to state a digest, and it has
    // one — the same digest an earlier run of this commit published. Stating
    // the fact is the work, and the work is done.
    const existing = await publishedDigest(ctx, image);
    if (existing) {
      const reference = referenceFor(image, existing);
      return {
        status: "passed",
        summary: `${reference} (published by an earlier run)`,
        facts: { [IMAGE_FACT]: reference },
      };
    }

    const pushed = await runCommand(ctx, ["docker", "push", image.ref], "image push failed");
    if (pushed.status !== "passed") return pushed;

    // Resolve the digest immediately. The tag is a moving handle; the digest is
    // what the deployment repo will pin, and it only exists once pushed.
    const inspect = await ctx.exec(
      ["docker", "inspect", "--format", "{{index .RepoDigests 0}}", image.ref],
      { cwd: ctx.appDir },
    );
    if (inspect.code !== 0) {
      return { status: "failed", summary: "could not resolve pushed digest", details: tail(inspect.stderr) };
    }

    // A zero exit with output in an unexpected shape is caught here rather than
    // left to throw. Both are the same failure to the reader, and this one now
    // feeds a machine channel, so it is worth reporting as a gate result with
    // the offending output attached instead of as a stack trace.
    let digest: string;
    try {
      digest = digestFrom(inspect.stdout);
    } catch (err) {
      return {
        status: "failed",
        summary: "could not parse the pushed digest",
        details: err instanceof Error ? err.message : String(err),
      };
    }

    const reference = referenceFor(image, digest);
    return { status: "passed", summary: reference, facts: { [IMAGE_FACT]: reference } };
  },
};

function appNameOf(ctx: GateContext): string {
  return ctx.appDir.split("/").filter(Boolean).pop() ?? "app";
}

export const GATES: Gate[] = [deps, typecheck, unitTests, imageBuild, imagePublish];

export function gateById(id: string): Gate | undefined {
  return GATES.find((g) => g.id === id);
}

/**
 * A typo in `--only` must not quietly run nothing and report success. That
 * failure mode — a green pipeline that gated nothing — is worse than any gate
 * this file defines, so it is an error rather than an empty selection.
 */
export function selectGates(ids: string[], gates: Gate[] = GATES): Gate[] {
  if (ids.length === 0) return gates;

  const unknown = ids.filter((id) => !gates.some((g) => g.id === id));
  if (unknown.length > 0) {
    throw new Error(
      `unknown gate(s): ${unknown.join(", ")}. known: ${gates.map((g) => g.id).join(", ")}`,
    );
  }

  // Registry order, not argument order — the cheap-fails-first ordering is a
  // property of the road, not something a caller should be able to shuffle.
  return gates.filter((g) => ids.includes(g.id));
}
