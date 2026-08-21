import { describe, expect, test } from "bun:test";
import { GATES, dataDirFor, gateById, moduleDirsIn, selectGates } from "../src/registry";
import type { Exec, ExecResult, GateContext } from "../src/types";
import { verdictFrom } from "../src/verdict";

/** Records what was run and replies with whatever the test dictates. */
function fakeExec(replies: Record<string, Partial<ExecResult>> = {}) {
  const calls: string[][] = [];
  const exec: Exec = async (cmd) => {
    calls.push(cmd);
    const key = Object.keys(replies).find((k) => cmd.join(" ").includes(k));
    return { code: 0, stdout: "", stderr: "", ...(key ? replies[key] : {}) };
  };
  return { exec, calls };
}

function context(exec: Exec, over: Partial<GateContext> = {}): GateContext {
  return {
    appDir: "/repos/greeter",
    platformDir: "/repos/tarmac",
    event: "pull_request",
    exec,
    exists: async () => true,
    env: {},
    ...over,
  };
}

/** Only the named directories exist, for the gate that branches on that. */
function only(...dirs: string[]) {
  return async (path: string) => dirs.some((dir) => path.endsWith(dir));
}

describe("the gate registry", () => {
  test("every gate has a rationale, because the matrix is generated from it", () => {
    for (const gate of GATES) {
      expect(gate.rationale.length).toBeGreaterThan(20);
      expect(["blocking", "reporting"]).toContain(gate.severity);
    }
  });

  test("gate ids are unique", () => {
    expect(new Set(GATES.map((g) => g.id)).size).toBe(GATES.length);
  });

  test("cheap gates run before expensive ones", () => {
    const order = GATES.map((g) => g.id);

    // The two static-policy gates first: no install, no network, no Docker.
    // Base image ahead of policy because it parses one file where policy walks
    // two directory trees.
    expect(order.indexOf("base-image")).toBe(0);
    expect(order.indexOf("policy")).toBe(1);
    expect(order.indexOf("deps")).toBeLessThan(order.indexOf("typecheck"));
    expect(order.indexOf("typecheck")).toBeLessThan(order.indexOf("image-build"));
    expect(order.indexOf("unit-tests")).toBeLessThan(order.indexOf("image-build"));
    expect(order.indexOf("image-build")).toBeLessThan(order.indexOf("image-publish"));

    // The base image is what the image is built ON. Learning it was unpinned
    // after spending a minute building on it is a minute spent to learn nothing.
    expect(order.indexOf("base-image")).toBeLessThan(order.indexOf("image-build"));

    // Scanning needs the artefact to exist, and a finding is worth more before
    // the image is on a public registry than after.
    expect(order.indexOf("image-build")).toBeLessThan(order.indexOf("security"));
    expect(order.indexOf("security")).toBeLessThan(order.indexOf("image-publish"));

    // The infra gate pulls providers over the network, so it is not cheap — but
    // it is still cheaper than building an image, and a broken module should not
    // wait behind one.
    expect(order.indexOf("unit-tests")).toBeLessThan(order.indexOf("infra"));
    expect(order.indexOf("infra")).toBeLessThan(order.indexOf("image-build"));
  });
});

describe("selectGates", () => {
  test("no ids means every gate", () => {
    expect(selectGates([])).toEqual(GATES);
  });

  test("selects the named subset in registry order, not argument order", () => {
    const selected = selectGates(["image-build", "typecheck"]);

    expect(selected.map((g) => g.id)).toEqual(["typecheck", "image-build"]);
  });

  // A typo must not produce a green run that gated nothing.
  test("an unknown id is an error, not an empty selection", () => {
    expect(() => selectGates(["typechek"])).toThrow(/unknown gate/);
  });
});

describe("the base image gate", () => {
  const baseImage = () => gateById("base-image")!;

  test("checks the repository-root Dockerfile against the platform's own policy set", async () => {
    const { exec, calls } = fakeExec();

    const outcome = await baseImage().run(context(exec));

    const command = calls.at(-1)!.join(" ");
    expect(command).toContain("--policy /repos/tarmac/policy/dockerfile");
    expect(command).toContain("/repos/greeter/Dockerfile");
    expect(outcome.status).toBe("passed");
  });

  // conftest would infer the parser from the filename, but inference is a
  // behaviour of somebody else's tool and this gate blocks merges. If it ever
  // changed, the failure mode is a gate that parses the file as something else
  // and finds nothing wrong with it.
  test("names the dockerfile parser rather than relying on inference", async () => {
    const { exec, calls } = fakeExec();

    await baseImage().run(context(exec));

    const command = calls.at(-1)!;
    expect(command[command.indexOf("--parser") + 1]).toBe("dockerfile");
  });

  // Same rule as the policy gate, for the same reason: a repository that
  // supplied the policy it is judged against could edit it to pass.
  test("never reads the policy from the repository being gated", async () => {
    const { exec, calls } = fakeExec();

    await baseImage().run(context(exec));

    for (const call of calls) {
      const at = call.indexOf("--policy");
      if (at === -1) continue;
      expect(call[at + 1]!.startsWith("/repos/tarmac/")).toBe(true);
    }
  });

  test("a mutable base fails the gate and keeps conftest's own words", async () => {
    const { exec } = fakeExec({
      "policy/dockerfile": {
        code: 1,
        stdout:
          "FAIL - /repos/greeter/Dockerfile - main - stage \"runtime\" builds `FROM oven/bun:1.3.14-alpine`" +
          " — base images must be pinned by digest, not by tag",
      },
    });

    const outcome = await baseImage().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("Dockerfile");
    expect(outcome.details).toContain("pinned by digest");
  });

  // The severity is the whole point of the gate: a mutable base image is
  // exactly the thing this platform claims to prevent, so it stops the merge
  // rather than appearing in a comment.
  test("blocks rather than reports", () => {
    expect(baseImage().severity).toBe("blocking");
  });

  // The platform gating itself is this case. A repository with no Dockerfile
  // has no base image to pin, and image-build is the gate that has an opinion
  // about a missing one.
  test("a repository with no Dockerfile is skipped, not failed", async () => {
    const { exec, calls } = fakeExec();

    const outcome = await baseImage().run(context(exec, { exists: only("nothing") }));

    expect(outcome.status).toBe("skipped");
    expect(calls).toHaveLength(0);
  });

  test("a missing conftest fails the gate rather than skipping it", async () => {
    const exec: Exec = async () => {
      throw new Error("spawn conftest ENOENT");
    };

    const outcome = await baseImage().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("conftest");
    expect(outcome.details).toContain("brew install conftest");
  });
});

describe("the policy gate", () => {
  const conftest = () => gateById("policy")!;

  test("judges each tree against the matching policy set, from the platform repo", async () => {
    const { exec, calls } = fakeExec();

    const outcome = await conftest().run(context(exec));

    const [terraform, kubernetes] = calls.slice(1).map((c) => c.join(" "));
    expect(terraform).toContain("--policy /repos/tarmac/policy/terraform");
    expect(terraform).toContain("/repos/greeter/infra");
    expect(kubernetes).toContain("--policy /repos/tarmac/policy/kubernetes");
    expect(kubernetes).toContain("/repos/greeter/gitops");
    expect(outcome.status).toBe("passed");
  });

  // The policies come from the platform, never from the repository under test.
  // An app that supplied its own copy could edit it, and a rule you can edit to
  // make yourself pass is not a rule.
  test("never reads policies from the repository being gated", async () => {
    const { exec, calls } = fakeExec();

    await conftest().run(context(exec));

    for (const call of calls) {
      const at = call.indexOf("--policy");
      if (at === -1) continue;
      expect(call[at + 1]!.startsWith("/repos/tarmac/")).toBe(true);
    }
  });

  test("a directory the app does not have is not checked", async () => {
    const { exec, calls } = fakeExec();

    const outcome = await conftest().run(context(exec, { exists: only("/infra") }));

    expect(calls.filter((c) => c.join(" ").includes("gitops"))).toHaveLength(0);
    expect(outcome.summary).toContain("infra/");
  });

  // Nothing to judge is not the same as judged and found clean. Reporting
  // "passed" here would credit the app for a check that never ran.
  test("an app with neither tree is skipped, not passed", async () => {
    const { exec } = fakeExec();

    const outcome = await conftest().run(context(exec, { exists: only("nothing") }));

    expect(outcome.status).toBe("skipped");
  });

  /**
   * The honesty property, and the one this gate is easiest to get wrong.
   *
   * An application repository has `infra/` and no `gitops/` — its manifests
   * live in the platform's own `gitops/<app>/`, written there by `promote` —
   * so the Kubernetes rules genuinely have nothing to judge in an app pipeline.
   * That is the topology, not a bug. What would be a bug is a green Policy row
   * that reads as though every rule in `policy/` had looked at the change: the
   * reader would have to know the target list by heart to spot the absence, and
   * a renamed `gitops/` would silence the Kubernetes set everywhere while every
   * pipeline stayed green.
   */
  test("names the policy sets it did not run, not only the ones it did", async () => {
    const { exec } = fakeExec();

    const outcome = await conftest().run(context(exec, { exists: only("/infra") }));

    expect(outcome.status).toBe("passed");
    expect(outcome.summary).toContain("infra/");
    expect(outcome.summary).toContain("kubernetes rules not run: no gitops/");
  });

  test("a warning does not crowd out the note about what was skipped", async () => {
    const { exec } = fakeExec({
      "policy/terraform": { stdout: "WARN - infra/main.tf - main - module is not pinned" },
    });

    const outcome = await conftest().run(context(exec, { exists: only("/infra") }));

    expect(outcome.summary).toContain("1 finding");
    expect(outcome.summary).toContain("kubernetes rules not run");
  });

  // The platform gating itself is the run that has both trees, and it is the
  // only place `policy/kubernetes/` is enforced before the cluster sees a
  // manifest. Nothing was skipped there, so nothing is claimed to have been.
  test("a repository with both trees carries no such note", async () => {
    const { exec } = fakeExec();

    const outcome = await conftest().run(context(exec));

    expect(outcome.status).toBe("passed");
    expect(outcome.summary).toContain("gitops/");
    expect(outcome.summary).not.toContain("not run");
  });

  test("a violation fails the gate and keeps conftest's own words", async () => {
    const { exec } = fakeExec({
      "policy/terraform": {
        code: 1,
        stdout: "FAIL - infra/main.tf - main - aws_s3_bucket.config is not encrypted at rest",
      },
    });

    const outcome = await conftest().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("infra/");
    expect(outcome.details).toContain("not encrypted at rest");
  });

  // conftest exits 0 on a `warn` and non-zero on a `deny` — the same
  // blocking/reporting split the gate registry draws, one level down. The gate
  // passes and still says what it is carrying, because a reported finding
  // nobody sees has not been reported.
  test("a warning passes the gate but is counted and shown", async () => {
    const { exec } = fakeExec({
      "policy/kubernetes": {
        stdout:
          "WARN - gitops/local-aws/credentials.yaml - main - Secret/aws-credentials carries literal values in git\n" +
          "1 test, 0 passed, 1 warning, 0 failures",
      },
    });

    const outcome = await conftest().run(context(exec));

    expect(outcome.status).toBe("passed");
    expect(outcome.summary).toContain("1 finding");
    expect(outcome.details).toContain("carries literal values in git");
  });

  // A gate that skips when its tool is missing reports success for work it did
  // not do, which is the failure mode this whole registry exists to prevent.
  test("a missing conftest fails the gate rather than skipping it", async () => {
    const exec: Exec = async () => {
      throw new Error("spawn conftest ENOENT");
    };

    const outcome = await conftest().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("conftest");
    expect(outcome.details).toContain("brew install conftest");
  });

  test("a conftest that is present but broken fails the same way", async () => {
    const { exec } = fakeExec({ "--version": { code: 127 } });

    const outcome = await conftest().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("conftest");
  });

  test("the checked-in provider cache and dependencies are excluded, so CI and a laptop agree", async () => {
    const { exec, calls } = fakeExec();

    await conftest().run(context(exec));

    const ignore = calls[1]![calls[1]!.indexOf("--ignore") + 1]!;
    expect(new RegExp(ignore).test("infra/.terraform/providers/x")).toBe(true);
    expect(new RegExp(ignore).test("node_modules/a/b.yaml")).toBe(true);
    expect(new RegExp(ignore).test("infra/main.tf")).toBe(false);
  });
});

describe("command gates", () => {
  // Frozen, not a plain install: the point of the gate is to reject a lockfile
  // that no longer matches package.json, not to make the build work anyway.
  test("deps installs frozen, so an out-of-date lockfile fails rather than resolves", async () => {
    const { exec, calls } = fakeExec();

    await gateById("deps")!.run(context(exec));

    expect(calls[0]).toEqual(["bun", "install", "--frozen-lockfile"]);
  });

  test("typecheck runs the app's own script in the app directory", async () => {
    const { exec, calls } = fakeExec();

    const outcome = await gateById("typecheck")!.run(context(exec));

    expect(calls[0]).toEqual(["bun", "run", "typecheck"]);
    expect(outcome.status).toBe("passed");
  });

  test("a non-zero exit fails the gate and keeps the output", async () => {
    const { exec } = fakeExec({ typecheck: { code: 2, stdout: "src/a.ts(1,1): error TS2304" } });

    const outcome = await gateById("typecheck")!.run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.details).toContain("TS2304");
  });

  test("image-build tags with the resolved image name", async () => {
    const { exec, calls } = fakeExec();
    const env = { GITHUB_REPOSITORY: "Owner/Greeter", GITHUB_SHA: "abc123" };

    const outcome = await gateById("image-build")!.run(context(exec, { env }));

    expect(calls[0]).toEqual(["docker", "build", "-t", "ghcr.io/owner/greeter:abc123", "."]);
    expect(outcome.summary).toBe("ghcr.io/owner/greeter:abc123");
  });
});

/**
 * The infra gate. What these cover is mostly the two ways it could quietly
 * check nothing — no terraform on PATH, and pointing `validate` at a directory
 * that holds no `.tf` — plus the fact that it never asks for backend state.
 */
describe("the infra gate", () => {
  const infra = () => gateById("infra")!;

  /** `find` output for a tree, in the order find emits it. */
  const found = (...files: string[]) => ({ find: { stdout: files.join("\n") } });

  test("blocks, because an invalid module fails at apply and nowhere earlier", () => {
    expect(infra().severity).toBe("blocking");
  });

  test("skips when the app has no infra/ at all", async () => {
    const { exec, calls } = fakeExec();

    const outcome = await infra().run(context(exec, { exists: only("gitops") }));

    expect(outcome.status).toBe("skipped");
    expect(calls).toEqual([]);
  });

  test("fails rather than skips when terraform is missing", async () => {
    const { exec } = fakeExec({ "terraform version": { code: 127 } });

    const outcome = await infra().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toBe("terraform is not installed");
  });

  test("fails rather than skips when terraform is missing and bun throws", async () => {
    const exec: Exec = async (cmd) => {
      if (cmd[0] === "terraform") throw new Error("ENOENT");
      return { code: 0, stdout: "", stderr: "" };
    };

    const outcome = await infra().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toBe("terraform is not installed");
  });

  test("checks formatting before pulling any provider down", async () => {
    const { exec, calls } = fakeExec({
      "fmt -check": { code: 3, stdout: "-  bucket = var.b\n+  bucket = var.b" },
    });

    const outcome = await infra().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toBe("infra/ is not formatted");
    expect(outcome.details).toContain("bucket");
    // Nothing after fmt ran, which is the point of ordering it first.
    expect(calls.flat()).not.toContain("init");
  });

  test("validates every directory holding .tf, not a hardcoded path", async () => {
    const { exec, calls } = fakeExec(
      found("/repos/greeter/infra/modules/a/main.tf", "/repos/greeter/infra/modules/b/main.tf"),
    );

    const outcome = await infra().run(context(exec));

    expect(outcome.status).toBe("passed");
    const chdirs = calls.flat().filter((arg) => arg.startsWith("-chdir="));
    expect(chdirs).toEqual([
      "-chdir=/repos/greeter/infra/modules/a",
      "-chdir=/repos/greeter/infra/modules/a",
      "-chdir=/repos/greeter/infra/modules/b",
      "-chdir=/repos/greeter/infra/modules/b",
    ]);
  });

  // Decision 36: the pipeline holds no credential that reaches real state, and
  // that applies to reading it as much as to writing it.
  test("never initialises the backend", async () => {
    const { exec, calls } = fakeExec(found("/repos/greeter/infra/main.tf"));

    await infra().run(context(exec));

    expect(calls.flat()).toContain("-backend=false");
  });

  /**
   * The defect this gate hit on its first real run. A developer with a previous
   * `make infra` behind them has a `.terraform/` recording the S3 backend, and
   * Terraform honours that record even under `-backend=false` — so the gate went
   * looking for AWS credentials on a laptop and passed on a fresh CI checkout.
   * Isolating the data directory is what keeps the two paths the same.
   */
  test("never touches the developer's own .terraform directory", async () => {
    const envs: (Record<string, string> | undefined)[] = [];
    const exec: Exec = async (cmd, opts) => {
      envs.push(opts?.env);
      return { code: 0, stdout: cmd[0] === "find" ? "/repos/greeter/infra/main.tf" : "", stderr: "" };
    };

    await infra().run(context(exec));

    const dataDirs = envs.filter(Boolean).map((e) => e!.TF_DATA_DIR);
    expect(dataDirs.length).toBe(2); // init and validate
    for (const dir of dataDirs) {
      expect(dir).toBe(dataDirFor("/repos/greeter/infra"));
      expect(dir).not.toContain("/repos/greeter/infra/.terraform");
    }
  });

  test("skips when infra/ exists but holds no .tf files", async () => {
    const { exec, calls } = fakeExec(found(""));

    const outcome = await infra().run(context(exec));

    expect(outcome.status).toBe("skipped");
    expect(calls.flat()).not.toContain("validate");
  });

  test("a provider that cannot be fetched fails as init, not as invalid HCL", async () => {
    const { exec } = fakeExec({
      ...found("/repos/greeter/infra/main.tf"),
      init: { code: 1, stderr: "Failed to query available provider packages" },
    });

    const outcome = await infra().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("terraform init failed");
  });

  test("reports the module a validation error came from", async () => {
    const { exec } = fakeExec({
      ...found("/repos/greeter/infra/main.tf"),
      validate: { code: 1, stderr: 'An argument named "bucketz" is not expected here.' },
    });

    const outcome = await infra().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toBe("invalid Terraform in /repos/greeter/infra");
    expect(outcome.details).toContain("bucketz");
  });
});

describe("dataDirFor", () => {
  test("is outside the module, so the gate cannot read or write its working state", () => {
    const module = "/repos/greeter/infra";

    expect(dataDirFor(module).startsWith(module)).toBe(false);
  });

  test("is stable for a module, so the provider cache survives between runs", () => {
    expect(dataDirFor("/repos/greeter/infra")).toBe(dataDirFor("/repos/greeter/infra"));
  });

  test("two modules never share one", () => {
    expect(dataDirFor("/repos/a/infra")).not.toBe(dataDirFor("/repos/b/infra"));
  });
});

describe("moduleDirsIn", () => {
  test("one directory per module, deduplicated and sorted", () => {
    expect(moduleDirsIn("/i/b/main.tf\n/i/a/main.tf\n/i/a/variables.tf\n")).toEqual([
      "/i/a",
      "/i/b",
    ]);
  });

  test("no .tf files means no directories, not the current one", () => {
    expect(moduleDirsIn("")).toEqual([]);
    expect(moduleDirsIn("\n  \n")).toEqual([]);
  });

  test("ignores lines that are not .tf files", () => {
    expect(moduleDirsIn("/i/a/main.tf\n/i/a/README.md\n/i/a/terraform.tfvars")).toEqual(["/i/a"]);
  });
});

/**
 * The security gate is the first reporting gate the platform has, so half of
 * what these cover is not "does it find CVEs" — it is that a finding is loud
 * without being fatal, and that the ways scanning can go wrong are all louder
 * than a clean scan rather than quieter.
 */
describe("the security gate", () => {
  const security = () => gateById("security")!;

  /** Trivy replies with a report; `--version` succeeds by default. */
  function scanning(findings: unknown[] = [], over: Partial<ExecResult> = {}) {
    return {
      "trivy image": {
        stdout: JSON.stringify({ Results: [{ Target: "greeter", Vulnerabilities: findings }] }),
        ...over,
      },
    };
  }

  const critical = {
    VulnerabilityID: "CVE-2024-9999",
    PkgName: "openssl",
    InstalledVersion: "3.0.1",
    FixedVersion: "3.0.2",
    Severity: "CRITICAL",
  };

  test("scans the image this commit built, not a tag it might resolve to later", async () => {
    const { exec, calls } = fakeExec(scanning());
    const env = { GITHUB_REPOSITORY: "Owner/Greeter", GITHUB_SHA: "abc123" };

    await security().run(context(exec, { env }));

    const scan = calls.find((c) => c[0] === "trivy" && c[1] === "image")!;
    expect(scan).toContain("ghcr.io/owner/greeter:abc123");
  });

  // Only what somebody would act on, and only vulnerabilities: the flags are
  // the scope of the report, so they are part of what the gate promises rather
  // than an invocation detail.
  test("asks for HIGH and CRITICAL vulnerabilities in machine-readable form", async () => {
    const { exec, calls } = fakeExec(scanning());

    await security().run(context(exec));

    const scan = calls.find((c) => c[0] === "trivy" && c[1] === "image")!;
    expect(scan).toEqual([
      "trivy",
      "image",
      "--quiet",
      "--format",
      "json",
      "--scanners",
      "vuln",
      "--severity",
      "HIGH,CRITICAL",
      "greeter:local",
    ]);
  });

  // Not `--exit-code`. Whether a finding stops the pipeline is this platform's
  // decision, held in `severity` where the matrix can list it and these tests
  // can check it — not a flag on somebody else's CLI.
  test("does not delegate the blocking decision to trivy", async () => {
    const { exec, calls } = fakeExec(scanning());

    await security().run(context(exec));

    expect(calls.flat()).not.toContain("--exit-code");
    expect(security().severity).toBe("reporting");
  });

  test("a clean image passes and names what was looked for", async () => {
    const { exec } = fakeExec(scanning());

    const outcome = await security().run(context(exec));

    expect(outcome.status).toBe("passed");
    expect(outcome.summary).toContain("HIGH,CRITICAL");
    expect(outcome.summary).toContain("greeter:local");
  });

  test("findings fail the gate, with the counts in the summary and the list in the details", async () => {
    const { exec } = fakeExec(scanning([critical]));

    const outcome = await security().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toBe("1 CRITICAL — 1 with a fix available");
    expect(outcome.details).toContain("CVE-2024-9999");
    expect(outcome.details).toContain("-> 3.0.2");
  });

  // The classification, stated as a property of the pipeline rather than of the
  // gate: a critical finding is reported and the run still merges. Everything
  // else here is detail; this is the decision.
  test("a critical finding does not fail the run", async () => {
    const { exec } = fakeExec(scanning([critical]));
    const gate = security();

    const outcome = await gate.run(context(exec));
    const verdict = verdictFrom([{ gate, outcome, durationMs: 0 }]);

    expect(verdict.passed).toBe(true);
    expect(verdict.reportingFailures).toHaveLength(1);
    expect(verdict.blockingFailures).toHaveLength(0);
  });

  // Trivy exits zero whether or not it found anything, so a non-zero exit means
  // the scan did not happen — no such image, or no vulnerability database. That
  // is the opposite of a clean result and must not read like one.
  test("a scan that could not run says so rather than reporting nothing found", async () => {
    const { exec } = fakeExec({
      "trivy image": { code: 1, stderr: "unable to find the specified image" },
    });

    const outcome = await security().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("could not scan");
    expect(outcome.details).toContain("unable to find the specified image");
  });

  test("a report it cannot read fails with the output attached, not an exception", async () => {
    const { exec } = fakeExec({ "trivy image": { stdout: "Total: 0 (HIGH: 0)" } });

    const outcome = await security().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("could not read");
    expect(outcome.details).toContain("Total: 0");
  });

  // A gate that goes quiet when its tool is missing is indistinguishable from
  // one that found nothing — and this is the gate whose whole job is to be a
  // report, so the missing-tool case is exactly where silence would be worst.
  test("a missing trivy is a failure, not a skip", async () => {
    const { exec, calls } = fakeExec({ "trivy --version": { code: 127 } });

    const outcome = await security().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("not installed");
    expect(outcome.details).toContain("brew install trivy");
    expect(calls.some((c) => c[1] === "image")).toBe(false);
  });

  test("an exec that throws is the same missing tool, not a broken gate", async () => {
    const exec: Exec = async () => {
      throw new Error("spawn trivy ENOENT");
    };

    const outcome = await security().run(context(exec));

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("not installed");
  });

  // Every other gate runs on every event; this one has no `appliesTo` because a
  // pull request is the run where a finding is still cheap to act on.
  test("runs on pull requests, where the finding is still cheap to act on", () => {
    expect(security().appliesTo).toBeUndefined();
  });
});

describe("image-publish", () => {
  const pushEnv = { GITHUB_REPOSITORY: "owner/greeter", GITHUB_SHA: "abc123" };

  // Every test below that expects an actual push has to say so: a pull that
  // succeeds means the commit is already published, which is now a different
  // code path. `fakeExec` defaults to success, so silence would mean the
  // opposite of what these tests are about.
  const notYetPublished = { pull: { code: 1, stderr: "manifest unknown" } };

  test("only applies on a push", () => {
    const { exec } = fakeExec();
    const publish = gateById("image-publish")!;

    expect(publish.appliesTo!(context(exec, { event: "pull_request" }))).toBe(false);
    expect(publish.appliesTo!(context(exec, { event: "local" }))).toBe(false);
    expect(publish.appliesTo!(context(exec, { event: "push" }))).toBe(true);
  });

  test("reports the digest it pushed, not the tag it pushed under", async () => {
    const { exec, calls } = fakeExec({
      ...notYetPublished,
      inspect: { stdout: "ghcr.io/owner/greeter@sha256:" + "d".repeat(64) + "\n" },
    });

    const outcome = await gateById("image-publish")!.run(
      context(exec, { event: "push", env: pushEnv }),
    );

    // Not `calls[0]` — the reuse probe runs first now. What matters is that a
    // push happened at all, and that the summary names the digest rather than
    // the tag it was pushed under.
    expect(calls).toContainEqual(["docker", "push", "ghcr.io/owner/greeter:abc123"]);
    expect(outcome.status).toBe("passed");
    expect(outcome.summary).toBe("ghcr.io/owner/greeter@sha256:" + "d".repeat(64));
  });

  // The digest has to reach the release step as data. Asserting it here as well
  // as in the summary is the point: the summary is prose and may be reworded,
  // the fact is the contract and may not.
  test("states the digest as a fact, not only in the summary", async () => {
    const { exec } = fakeExec({
      ...notYetPublished,
      inspect: { stdout: "ghcr.io/owner/greeter@sha256:" + "d".repeat(64) + "\n" },
    });

    const outcome = await gateById("image-publish")!.run(
      context(exec, { event: "push", env: pushEnv }),
    );

    expect(outcome.facts).toEqual({ image: "ghcr.io/owner/greeter@sha256:" + "d".repeat(64) });
  });

  // Without a registry there is nothing to push to; skipping is honest, and
  // failing would make `make ci --event push` impossible to run on a laptop.
  test("skips when there is no registry context", async () => {
    const { exec, calls } = fakeExec();

    const outcome = await gateById("image-publish")!.run(context(exec, { event: "push" }));

    expect(outcome.status).toBe("skipped");
    expect(calls).toHaveLength(0);
  });

  test("a push that fails does not go on to report a digest", async () => {
    const { exec } = fakeExec({ ...notYetPublished, push: { code: 1, stderr: "denied" } });

    const outcome = await gateById("image-publish")!.run(
      context(exec, { event: "push", env: pushEnv }),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.details).toContain("denied");
  });

  test("a push that succeeds but yields no digest fails rather than inventing one", async () => {
    const { exec } = fakeExec({ ...notYetPublished, inspect: { code: 1, stderr: "no such object" } });

    const outcome = await gateById("image-publish")!.run(
      context(exec, { event: "push", env: pushEnv }),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("digest");
    expect(outcome.facts).toBeUndefined();
  });

  // A daemon that knows this image under more than one name reports one entry
  // per repository, in no documented order. Reading entry zero and pairing it
  // with *our* repository name is how a reference to bytes nobody here
  // published gets stated as a fact and committed into gitops/.
  test("picks the digest for the repository it pushed to, whatever the order", async () => {
    const ours = `sha256:${"d".repeat(64)}`;
    const { exec } = fakeExec({
      ...notYetPublished,
      inspect: {
        stdout: `registry.local/greeter@sha256:${"e".repeat(64)}\nghcr.io/owner/greeter@${ours}\n`,
      },
    });

    const outcome = await gateById("image-publish")!.run(
      context(exec, { event: "push", env: pushEnv }),
    );

    expect(outcome.summary).toBe(`ghcr.io/owner/greeter@${ours}`);
    expect(outcome.facts).toEqual({ image: `ghcr.io/owner/greeter@${ours}` });
  });

  test("a digest for somebody else's repository is not ours to report", async () => {
    const { exec } = fakeExec({
      ...notYetPublished,
      inspect: { stdout: `registry.local/greeter@sha256:${"e".repeat(64)}\n` },
    });

    const outcome = await gateById("image-publish")!.run(
      context(exec, { event: "push", env: pushEnv }),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.facts).toBeUndefined();
  });

  // Docker exiting zero with output in an unexpected shape is a gate failure
  // with the output attached, not an exception the runner reports as a broken
  // gate — the two read identically to whoever has to fix it, and one of them
  // says what it saw.
  test("output that is not a repo digest fails the gate rather than throwing", async () => {
    const { exec } = fakeExec({ ...notYetPublished, inspect: { stdout: "<no value>\n" } });

    const outcome = await gateById("image-publish")!.run(
      context(exec, { event: "push", env: pushEnv }),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("parse");
    expect(outcome.details).toContain("<no value>");
    expect(outcome.facts).toBeUndefined();
  });
});

/**
 * The defect these cover was found by re-running a green pipeline, not by
 * reading it: `docker build` stamps a wall-clock into the image config, so the
 * same commit built twice produced two digests and therefore two deployment
 * commits for an application that had not changed. Decision 38.
 *
 * The property being protected is one sentence — the same commit resolves to
 * the same digest — and every test here is a way that could stop being true.
 */
describe("reusing the image already published for this commit", () => {
  const pushEnv = { GITHUB_REPOSITORY: "owner/greeter", GITHUB_SHA: "abc123" };
  const digest = "sha256:" + "d".repeat(64);
  const reference = `ghcr.io/owner/greeter@${digest}`;
  const alreadyPublished = { inspect: { stdout: `${reference}\n` } };

  const ran = (calls: string[][], verb: string) =>
    calls.some((cmd) => cmd[0] === "docker" && cmd[1] === verb);

  test("a re-run of the same commit does not build it again", async () => {
    const { exec, calls } = fakeExec(alreadyPublished);

    const outcome = await gateById("image-build")!.run(
      context(exec, { event: "push", env: pushEnv }),
    );

    expect(outcome.status).toBe("skipped");
    expect(ran(calls, "build")).toBe(false);
    expect(outcome.summary).toContain("already built");
  });

  test("a re-run of the same commit does not push it again", async () => {
    const { exec, calls } = fakeExec(alreadyPublished);

    const outcome = await gateById("image-publish")!.run(
      context(exec, { event: "push", env: pushEnv }),
    );

    expect(outcome.status).toBe("passed");
    expect(ran(calls, "push")).toBe(false);
    expect(outcome.facts).toEqual({ image: reference });
  });

  // The whole point, stated as one assertion: whether the image was built by
  // this run or by an earlier one, the fact handed to `promote` is the same
  // string. When it is, promote's no-op path fires and no deployment commit is
  // produced. When it is not, an unchanged application gets redeployed.
  test("reuse and a fresh push report the identical digest", async () => {
    const fresh = fakeExec({ pull: { code: 1 }, ...alreadyPublished });
    const reused = fakeExec(alreadyPublished);
    const publish = gateById("image-publish")!;
    const ctx = { event: "push" as const, env: pushEnv };

    const first = await publish.run(context(fresh.exec, ctx));
    const second = await publish.run(context(reused.exec, ctx));

    expect(ran(fresh.calls, "push")).toBe(true);
    expect(ran(reused.calls, "push")).toBe(false);
    expect(second.facts).toEqual(first.facts!);
  });

  // A pull request must genuinely build. Its SHA is a merge commit that was
  // never published, so the lookup would always miss anyway — but the reason
  // to skip it is that on a PR the build IS the gate, and a gate that can be
  // satisfied by something already in a registry is not gating this change.
  test("a pull request builds every time and never consults the registry", async () => {
    const { exec, calls } = fakeExec(alreadyPublished);

    const outcome = await gateById("image-build")!.run(
      context(exec, { event: "pull_request", env: pushEnv }),
    );

    expect(outcome.status).toBe("passed");
    expect(ran(calls, "build")).toBe(true);
    expect(ran(calls, "pull")).toBe(false);
  });

  // Every way of failing to prove the image is there means building it. The
  // costly outcome is a redundant build; the alternative is deploying a digest
  // nobody confirmed exists.
  test("a registry it cannot reach means build, not assume", async () => {
    const { exec, calls } = fakeExec({ pull: { code: 1, stderr: "unauthorized" } });

    await gateById("image-build")!.run(context(exec, { event: "push", env: pushEnv }));

    expect(ran(calls, "build")).toBe(true);
  });

  test("a pull that succeeds but inspects to junk means build, not throw", async () => {
    const { exec, calls } = fakeExec({ inspect: { stdout: "<no value>\n" } });

    const outcome = await gateById("image-build")!.run(
      context(exec, { event: "push", env: pushEnv }),
    );

    expect(outcome.status).toBe("passed");
    expect(ran(calls, "build")).toBe(true);
  });

  // On a laptop there is no registry to consult and nothing addressable to
  // reuse; the local path must not start making network calls.
  test("a local run consults no registry", async () => {
    const { exec, calls } = fakeExec(alreadyPublished);

    await gateById("image-build")!.run(context(exec, { event: "local" }));

    expect(ran(calls, "pull")).toBe(false);
    expect(ran(calls, "build")).toBe(true);
  });
});
