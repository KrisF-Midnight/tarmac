import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { tail } from "./exec";
import { IMAGE_FACT } from "./facts";
import {
  type ImageName,
  digestForRepository,
  imageNameFor,
  repoDigestsIn,
  repositoryOf,
} from "./image";
import type { Gate, GateContext, GateOutcome } from "./types";
import {
  type Vulnerability,
  describe,
  summarise,
  vulnerabilitiesIn,
} from "./vulnerabilities";

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
 * The Dockerfile's own base image, checked for the one thing every other copy
 * of the digest rule is blind to.
 *
 * The platform states "images are pinned by digest" twice — as Rego over
 * Kubernetes manifests and as a ValidatingAdmissionPolicy at admission — and
 * both of those read container images out of Kubernetes objects. The image they
 * judge is the one this pipeline published, and that one is pinned by
 * construction, because `promote` writes the digest the publish gate resolved.
 * Neither has ever read a Dockerfile. So a `FROM` swapped from a digest to a
 * mutable tag kept every gate green while making the pinned digest downstream a
 * precise reference to bytes nobody reviewed. This is that hole.
 *
 * Its own gate rather than a third entry in POLICY_TARGETS, for two reasons.
 * That list maps a directory to a policy set and this is a single file with a
 * different parser; and the severity, the ordering and the rationale of a check
 * are things this platform insists on stating per gate, in the matrix, where
 * they can be read and argued with.
 *
 * One file at the repository root, and no search for others. That is not
 * laziness about `build/Dockerfile`: the image-build gate runs `docker build .`
 * against exactly this path, so this is the only Dockerfile that becomes
 * anything. A gate that scanned files nothing builds would be enforcing a rule
 * on dead code, and would eventually be silenced for it.
 */
const DOCKERFILE = "Dockerfile";

const baseImage: Gate = {
  id: "base-image",
  title: "Base image",
  severity: "blocking",
  rationale:
    "The digest rule the manifests and the admission policy both enforce, applied to the one " +
    "image neither of them can see: the Dockerfile's own base. A mutable `FROM` tag makes every " +
    "digest downstream of it a precise pin on bytes nobody reviewed.",
  run: async (ctx) => {
    const dockerfile = join(ctx.appDir, DOCKERFILE);

    // Skipped, not failed. A repository with no Dockerfile has no base image to
    // pin — the platform gating itself is exactly that case — and the gate that
    // has an opinion about a missing Dockerfile is image-build, further down.
    if (!(await ctx.exists(dockerfile))) {
      return { status: "skipped", summary: `nothing to check: no ${DOCKERFILE}` };
    }

    if (!(await conftestAvailable(ctx))) return conftestMissing("base image");

    // `--parser` explicitly, though conftest would infer it from the filename.
    // Inference is a behaviour of somebody else's tool, and this gate blocks
    // merges; if that inference ever changed, the failure mode would be a gate
    // that parses a Dockerfile as something else and finds nothing in it.
    const { code, stdout, stderr } = await ctx.exec(
      [
        "conftest",
        "test",
        "--no-color",
        "--parser",
        "dockerfile",
        "--policy",
        join(ctx.platformDir, "policy", "dockerfile"),
        dockerfile,
      ],
      { cwd: ctx.appDir },
    );

    if (code !== 0) {
      return {
        status: "failed",
        summary: `unpinned base image in ${DOCKERFILE}`,
        details: tail(`${stdout}\n${stderr}`.trim()),
      };
    }

    return { status: "passed", summary: `${DOCKERFILE} base images pinned by digest` };
  },
};

/**
 * Policy, checked against the files rather than against the cluster.
 *
 * The rules live in `policy/` in this repository and are enforced twice, on
 * purpose. `policy/admission/` states them as ValidatingAdmissionPolicies that
 * the API server applies to every request it receives; `policy/kubernetes/` and
 * `policy/terraform/` state them in Rego, which is what this gate runs. Neither
 * copy makes the other redundant: admission cannot tell anybody about a problem
 * until somebody is already deploying it, and a pre-merge check cannot see a
 * `kubectl apply`. Keeping them in step is a real cost, paid deliberately, and
 * the policy unit tests are what stop them drifting silently.
 *
 * Note which directory each policy set finds here, because only one of them is
 * reachable from a given repository and that is the whole design rather than a
 * gap in it. An application repository has `infra/` and is judged by the
 * Terraform rules. It has no `gitops/` and never will: there is no separate
 * deployment repository, so an app's manifests live in *this* repository's
 * `gitops/<app>/`, written there by `promote` after the gates have passed. The
 * Kubernetes rules therefore fire when the platform gates itself — that is
 * `.github/workflows/self.yml`, which runs `--only base-image,policy,infra`
 * with `--app-dir .` on every pull request and every push to the default
 * branch, and it is the only place `policy/kubernetes/` is enforced before the
 * cluster sees a manifest. `secrets.rego` in particular is reached there and
 * nowhere else, and it has a standing finding to show for it.
 *
 * What that asymmetry costs is stated in `scopeNote` below: a run that judges
 * one of these trees must say which sets it did not run, or a green Policy row
 * reads as though every rule in `policy/` had an opinion about the change.
 *
 * Blocking, and the tool being missing is a failure rather than a skip. A gate
 * that quietly does nothing when its tool is absent produces a green run that
 * checked nothing, which is worse than a red one.
 */
const POLICY_TARGETS = [
  { dir: "infra", policies: "terraform" },
  { dir: "gitops", policies: "kubernetes" },
] as const;

type PolicyTarget = (typeof POLICY_TARGETS)[number];

/**
 * `.terraform` holds provider binaries and a copy of state, and `node_modules`
 * holds somebody else's YAML. Neither is authored here, and neither is present
 * in CI — so scanning them would mean the laptop and the pipeline disagree
 * about what was checked, which is the one thing this platform claims not to do.
 */
const IGNORED_PATHS = "(\\.terraform|node_modules)";

async function conftestAvailable(ctx: GateContext): Promise<boolean> {
  try {
    const { code } = await ctx.exec(["conftest", "--version"], { cwd: ctx.appDir });
    return code === 0;
  } catch {
    // Bun throws rather than returning 127 when the binary does not exist.
    return false;
  }
}

/** Shared by the two gates that shell out to conftest, so they cannot drift. */
function conftestMissing(gate: string): GateOutcome {
  return {
    status: "failed",
    summary: "conftest is not installed",
    details:
      `The ${gate} gate needs conftest on PATH: \`brew install conftest\`, or see ` +
      "https://www.conftest.dev/install/. It fails rather than skips because a gate " +
      "that skips when its tool is missing reports success for work it did not do.",
  };
}

/**
 * Warnings, counted off the output.
 *
 * conftest exits 0 on a `warn` and non-zero on a `deny`, which is exactly the
 * blocking/reporting split this platform already draws, one level further down.
 * So the gate passes — and still says how many findings it is carrying, because
 * a reported finding nobody sees is not reported.
 */
function warningsIn(stdout: string): string[] {
  return stdout.split("\n").filter((line) => line.startsWith("WARN"));
}

/**
 * The policy sets that had nothing to judge, named in the summary of the run
 * that did not run them.
 *
 * Without this the gate is accurate and still misleading. `infra/ clean` is a
 * true statement, and a reader seeing a green Policy row has no way to tell
 * from it that half of `policy/` never loaded — they would have to know this
 * file's target list by heart to notice the absence. The failure that behaviour
 * invites is not hypothetical: rename `gitops/` and the Kubernetes rules stop
 * running everywhere, including where they are the only enforcement there is,
 * and every pipeline stays green while it happens.
 *
 * Named rather than counted, and by policy set rather than by directory,
 * because "kubernetes rules not run" is the fact somebody needs; "1 target
 * skipped" would send them back to this file to find out which.
 */
function scopeNote(absent: PolicyTarget[]): string {
  if (absent.length === 0) return "";
  const missing = absent.map((t) => `${t.policies} rules not run: no ${t.dir}/`);
  return ` (${missing.join("; ")})`;
}

const policy: Gate = {
  id: "policy",
  title: "Policy",
  severity: "blocking",
  rationale:
    "The same rules the cluster enforces at admission, applied where they are still cheap to " +
    "fix. A violation caught here is a review comment; caught at admission it is a failed " +
    "deploy with the change already merged.",
  run: async (ctx) => {
    if (!(await conftestAvailable(ctx))) return conftestMissing("policy");

    const checked: string[] = [];
    const absent: PolicyTarget[] = [];
    const warnings: string[] = [];

    for (const target of POLICY_TARGETS) {
      const dir = join(ctx.appDir, target.dir);
      if (!(await ctx.exists(dir))) {
        absent.push(target);
        continue;
      }

      const { code, stdout, stderr } = await ctx.exec(
        [
          "conftest",
          "test",
          "--no-color",
          "--ignore",
          IGNORED_PATHS,
          "--policy",
          join(ctx.platformDir, "policy", target.policies),
          dir,
        ],
        { cwd: ctx.appDir },
      );

      if (code !== 0) {
        return {
          status: "failed",
          summary: `policy violations in ${target.dir}/`,
          details: tail(`${stdout}\n${stderr}`.trim()),
        };
      }

      checked.push(`${target.dir}/`);
      warnings.push(...warningsIn(stdout));
    }

    // Nothing to judge is not the same as judged and clean. An app with neither
    // directory has no infrastructure and no manifests of its own, and saying
    // "passed" would credit it for a check that never ran.
    if (checked.length === 0) {
      return { status: "skipped", summary: `nothing to check: no ${absent.map((t) => `${t.dir}/`).join(" or ")}` };
    }

    const where = checked.join(", ");
    const note = scopeNote(absent);
    if (warnings.length === 0) return { status: "passed", summary: `${where} clean${note}` };

    return {
      status: "passed",
      summary: `${where}: ${warnings.length} finding(s), reported not blocking${note}`,
      details: warnings.join("\n"),
    };
  },
};

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

/**
 * The Terraform, checked for the two things the policy gate cannot see.
 *
 * `policy` already reads these same files, so it is worth being precise about
 * what this adds. The Rego in `policy/terraform/` parses HCL as source and
 * judges it against rules this platform wrote — is the bucket encrypted, is
 * public access blocked. It has no idea what arguments the AWS provider
 * actually accepts, so a misspelled attribute or a reference to a resource that
 * does not exist sails straight through it and fails at `apply`, which is the
 * one place left where failing is expensive. `terraform validate` knows the
 * provider schema and catches exactly that class.
 *
 * `fmt -check` is here for a smaller reason and gets a free ride: formatting
 * arguments are the cheapest possible review comment to stop having.
 *
 * Placed after the unit tests rather than next to `policy`, where it reads more
 * naturally, because the order in this file is cost and not theme. `init` pulls
 * the AWS provider down over the network — this is the most expensive gate that
 * runs before the image is built, and everything above it can fail in seconds.
 *
 * Blocking, and terraform being absent fails rather than skips, for the reason
 * the policy gate gives at length.
 */
const INFRA_DIR = "infra";

async function terraformAvailable(ctx: GateContext): Promise<boolean> {
  try {
    const { code } = await ctx.exec(["terraform", "version"], { cwd: ctx.appDir });
    return code === 0;
  } catch {
    // Bun throws rather than returning 127 when the binary does not exist.
    return false;
  }
}

/**
 * The directories `validate` has to be pointed at, derived from where the `.tf`
 * files actually are.
 *
 * Not a fixed path, because the two repositories on this road disagree about
 * the shape: an application keeps one root module at `infra/`, while the
 * platform keeps a child module at `infra/modules/app-dependencies/` and
 * nothing at the top. Hardcoding either would silently validate nothing in the
 * other, and a gate that checks nothing is the failure mode this platform keeps
 * legislating against.
 *
 * Pure, and separate from the command that feeds it, so the test for "which
 * directories" does not need a filesystem.
 */
/**
 * Where this gate is allowed to keep Terraform's working directory.
 *
 * Not `.terraform/` next to the module, which is the default, and the reason is
 * a defect this gate hit on its first real run. A developer who has run
 * `make infra` has a `.terraform/` that already records the S3 backend, and
 * Terraform reads that record even under `-backend=false` — so `init` went
 * looking for AWS credentials and the gate failed on a laptop while passing on
 * a fresh CI checkout. The parity claim this platform makes would have been
 * false, and quietly.
 *
 * Pointing TF_DATA_DIR somewhere else fixes it in both directions: the gate
 * cannot be confused by a developer's working state, and cannot corrupt it
 * either. Derived from the module path rather than randomised, so the provider
 * cache survives between runs — the second run is fast — and so a test can
 * assert the exact value.
 */
export function dataDirFor(module: string): string {
  return join(tmpdir(), "tarmac-terraform", module.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+/, ""));
}

export function moduleDirsIn(findOutput: string): string[] {
  const dirs = findOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".tf"))
    .map((file) => dirname(file));

  return [...new Set(dirs)].sort();
}

const infra: Gate = {
  id: "infra",
  title: "Infrastructure",
  severity: "blocking",
  rationale:
    "The policy rules read the Terraform as text; only Terraform knows the provider schema. A " +
    "misspelled argument or a dangling reference passes every other gate here and fails at " +
    "apply, which is the last place where failing is still cheap.",
  run: async (ctx) => {
    const root = join(ctx.appDir, INFRA_DIR);
    if (!(await ctx.exists(root))) {
      return { status: "skipped", summary: `nothing to check: no ${INFRA_DIR}/` };
    }

    if (!(await terraformAvailable(ctx))) {
      return {
        status: "failed",
        summary: "terraform is not installed",
        details:
          "The infra gate needs terraform on PATH: `brew install terraform`, or see " +
          "https://developer.hashicorp.com/terraform/install. It fails rather than skips " +
          "because a gate that skips when its tool is missing reports success for work it " +
          "did not do.",
      };
    }

    // Formatting first: it needs no providers and no network, so the cheap half
    // of this gate still fails fast even though the gate as a whole is not cheap.
    const fmt = await ctx.exec(
      ["terraform", "fmt", "-check", "-recursive", "-diff", "-no-color", root],
      { cwd: ctx.appDir },
    );
    if (fmt.code !== 0) {
      return {
        status: "failed",
        summary: `${INFRA_DIR}/ is not formatted`,
        details: tail(`${fmt.stdout}\n${fmt.stderr}`.trim()),
      };
    }

    // `.terraform` is a previous init's provider cache, and any `.tf` inside it
    // is somebody else's module vendored by Terraform itself. Pruned for the
    // same reason the policy gate ignores it.
    const found = await ctx.exec(
      ["find", root, "-name", ".terraform", "-prune", "-o", "-name", "*.tf", "-print"],
      { cwd: ctx.appDir },
    );
    const modules = moduleDirsIn(found.stdout);

    if (modules.length === 0) {
      return { status: "skipped", summary: `nothing to check: no .tf files under ${INFRA_DIR}/` };
    }

    for (const module of modules) {
      const env = { TF_DATA_DIR: dataDirFor(module) };

      // `-backend=false` because validating does not need state, and asking for
      // it would mean this gate held a credential to the real backend. The
      // pipeline is not allowed one — that is decision 36, and it applies to
      // reads as much as to writes.
      const init = await ctx.exec(
        ["terraform", `-chdir=${module}`, "init", "-backend=false", "-input=false", "-no-color"],
        { cwd: ctx.appDir, env },
      );
      if (init.code !== 0) {
        return {
          status: "failed",
          summary: `terraform init failed in ${module}`,
          details: tail(`${init.stdout}\n${init.stderr}`.trim()),
        };
      }

      const validate = await ctx.exec(
        ["terraform", `-chdir=${module}`, "validate", "-no-color"],
        { cwd: ctx.appDir, env },
      );
      if (validate.code !== 0) {
        return {
          status: "failed",
          summary: `invalid Terraform in ${module}`,
          details: tail(`${validate.stdout}\n${validate.stderr}`.trim()),
        };
      }
    }

    return {
      status: "passed",
      summary: `${modules.length} module(s) formatted and valid`,
      details: modules.join("\n"),
    };
  },
};

/** `ghcr.io/owner/app:sha` and a digest, recombined into something pullable. */
function referenceFor(image: ImageName, digest: string): string {
  return `${repositoryOf(image.ref)}@${digest}`;
}

/**
 * Every repo digest the daemon holds for this tag, one per line.
 *
 * `range` rather than `index .RepoDigests 0`, because the caller has to see the
 * whole list to pick the entry belonging to the repository it is about to name
 * — see `digestForRepository`. It also removes a failure mode of `index`, which
 * errors on an empty list and so reported "docker inspect failed" for an image
 * that simply had never been pushed.
 */
const REPO_DIGESTS_FORMAT = "{{range .RepoDigests}}{{println .}}{{end}}";

/**
 * Has this exact commit already been built and published?
 *
 * This exists because `docker build` is not reproducible. Docker stamps a
 * wall-clock `created` into the image config on every build, so building the
 * same source twice yields two different digests — and since the digest is what
 * gets committed to this repository's own gitops/ tree, a re-run of an
 * unchanged pipeline was
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
    ["docker", "inspect", "--format", REPO_DIGESTS_FORMAT, image.ref],
    { cwd: ctx.appDir },
  );
  if (inspect.code !== 0) return null;

  try {
    return digestForRepository(repoDigestsIn(inspect.stdout), repositoryOf(image.ref));
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
 * The image, scanned — and the only gate here that does not block.
 *
 * That classification is the decision worth arguing about, so here is the
 * argument. A blocking vulnerability gate fails on a schedule rather than on a
 * diff: a CVE is published against a base-image package on a Tuesday and every
 * pipeline in the estate goes red on Wednesday, including the one carrying the
 * fix for an unrelated outage. Nothing about the change under review got worse.
 * Teams answer that with a blanket ignore file, and the scanner stops being a
 * signal at all — a worse outcome than not blocking, because it looks like a
 * control while enforcing nothing.
 *
 * What makes it defensible rather than merely convenient is the second half:
 * reporting is not silence. The finding lands in the run's GitHub step summary
 * with the fixable ones first, so ignoring one is a decision somebody made rather
 * than one nobody saw. And the parts of this that a change genuinely can cause
 * — credentials written into a Terraform provider, an image pulled from
 * somewhere other than `ghcr.io`, an unpinned tag — are blocking, in the policy
 * gate, because those fail on the diff.
 *
 * Two limits worth stating rather than hiding. Only HIGH and CRITICAL are
 * requested, because a list nobody reads is not a report. And only the
 * vulnerability scanner runs, not the secret scanner: a credential baked into
 * an image layer would not be caught here. The Rego rules see secrets in the
 * source, which is where ours would come from, and the image case is on the
 * omissions list.
 */
const SCANNED_SEVERITIES = "HIGH,CRITICAL";

async function trivyAvailable(ctx: GateContext): Promise<boolean> {
  try {
    const { code } = await ctx.exec(["trivy", "--version"], { cwd: ctx.appDir });
    return code === 0;
  } catch {
    return false;
  }
}

const security: Gate = {
  id: "security",
  title: "Security",
  severity: "reporting",
  rationale:
    "Known vulnerabilities arrive on a disclosure schedule, not in a diff — blocking on them " +
    "turns an unrelated CVE into an outage in the fix pipeline, and teams answer that with a " +
    "blanket ignore file. Reported instead, worst and most fixable first, so skipping one is a " +
    "decision somebody made.",
  run: async (ctx) => {
    if (!(await trivyAvailable(ctx))) {
      return {
        status: "failed",
        summary: "trivy is not installed",
        details:
          "The security gate needs trivy on PATH: `brew install trivy`, or see " +
          "https://trivy.dev/latest/getting-started/installation/. It reports a failure rather " +
          "than skipping because a gate that goes quiet when its tool is missing is " +
          "indistinguishable from one that found nothing.",
      };
    }

    const image = imageNameFor({ appName: appNameOf(ctx), env: ctx.env });

    const { code, stdout, stderr } = await ctx.exec(
      [
        "trivy",
        "image",
        "--quiet",
        "--format",
        "json",
        "--scanners",
        "vuln",
        "--severity",
        SCANNED_SEVERITIES,
        image.ref,
      ],
      { cwd: ctx.appDir },
    );

    // Trivy exits 0 whether or not it found anything — `--exit-code` would move
    // the blocking decision into a flag, and this platform keeps that decision
    // in the `severity` field where it can be listed and tested. So a non-zero
    // exit here means the scan itself did not happen: no such image locally, or
    // the vulnerability database could not be fetched.
    if (code !== 0) {
      return {
        status: "failed",
        summary: `could not scan ${image.ref}`,
        details: tail(`${stdout}\n${stderr}`.trim()),
      };
    }

    let vulns: Vulnerability[];
    try {
      vulns = vulnerabilitiesIn(stdout);
    } catch {
      return {
        status: "failed",
        summary: "could not read the scan report",
        details: tail(stdout),
      };
    }

    if (vulns.length === 0) {
      return { status: "passed", summary: `no ${SCANNED_SEVERITIES} findings in ${image.ref}` };
    }

    return { status: "failed", summary: summarise(vulns), details: describe(vulns) };
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
    "The digest committed to this repository's own gitops/ tree has to resolve on any machine. " +
    "A push that " +
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
    // what the gitops/ manifests will pin, and it only exists once pushed.
    const inspect = await ctx.exec(
      ["docker", "inspect", "--format", REPO_DIGESTS_FORMAT, image.ref],
      { cwd: ctx.appDir },
    );
    if (inspect.code !== 0) {
      return { status: "failed", summary: "could not resolve pushed digest", details: tail(inspect.stderr) };
    }

    // A zero exit with output in an unexpected shape is caught here rather than
    // left to throw. Both are the same failure to the reader, and this one now
    // feeds a machine channel, so it is worth reporting as a gate result with
    // the offending output attached instead of as a stack trace. A push that
    // reported success and left no digest for this repository lands here too,
    // which is the right place for it: the gate's job is to state a digest.
    let digest: string;
    try {
      digest = digestForRepository(repoDigestsIn(inspect.stdout), repositoryOf(image.ref));
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

// The two static-policy gates first: neither needs an install, a network or
// Docker, so they are the cheapest things in the list that can fail — and the
// ordering rule above is that the cheapest failure comes first. Base image
// ahead of policy between the two, because it parses one file where policy
// walks two directory trees, and because what it guards is the input to the
// most expensive gate here. Finding out that a base image is unpinned after
// spending a minute building an image on it is a minute spent to learn nothing.
//
// Security sits between building the image and publishing it, which is the
// only place it can sit: it scans an artefact, so the artefact has to exist,
// and a finding is worth more before the image is on a public registry than
// after. It does not block the publish — it is a reporting gate — but the
// ordering is what the run reads like, and reading like an afterthought is how
// a check becomes one.
export const GATES: Gate[] = [
  baseImage,
  policy,
  deps,
  typecheck,
  unitTests,
  infra,
  imageBuild,
  security,
  imagePublish,
];

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
