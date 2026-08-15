import { tail } from "./exec";
import { digestFrom, imageNameFor } from "./image";
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

const imageBuild: Gate = {
  id: "image-build",
  title: "Image build",
  severity: "blocking",
  rationale:
    "An app that does not build cannot deploy. Running it on every PR rather than only on " +
    "merge means the Dockerfile is covered by review like everything else.",
  run: async (ctx) => {
    const image = imageNameFor({ appName: appNameOf(ctx), env: ctx.env });
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

    return { status: "passed", summary: `${image.ref.split(":")[0]}@${digestFrom(inspect.stdout)}` };
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
