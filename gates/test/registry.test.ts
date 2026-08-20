import { describe, expect, test } from "bun:test";
import { GATES, gateById, selectGates } from "../src/registry";
import type { Exec, ExecResult, GateContext } from "../src/types";

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

    // Policy first: no install, no network, no Docker.
    expect(order.indexOf("policy")).toBe(0);
    expect(order.indexOf("deps")).toBeLessThan(order.indexOf("typecheck"));
    expect(order.indexOf("typecheck")).toBeLessThan(order.indexOf("image-build"));
    expect(order.indexOf("unit-tests")).toBeLessThan(order.indexOf("image-build"));
    expect(order.indexOf("image-build")).toBeLessThan(order.indexOf("image-publish"));
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
