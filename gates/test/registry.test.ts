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
  return { appDir: "/repos/greeter", event: "pull_request", exec, env: {}, ...over };
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

    expect(order.indexOf("deps")).toBe(0);
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

  test("only applies on a push", () => {
    const { exec } = fakeExec();
    const publish = gateById("image-publish")!;

    expect(publish.appliesTo!(context(exec, { event: "pull_request" }))).toBe(false);
    expect(publish.appliesTo!(context(exec, { event: "local" }))).toBe(false);
    expect(publish.appliesTo!(context(exec, { event: "push" }))).toBe(true);
  });

  test("reports the digest it pushed, not the tag it pushed under", async () => {
    const { exec, calls } = fakeExec({
      inspect: { stdout: "ghcr.io/owner/greeter@sha256:" + "d".repeat(64) + "\n" },
    });

    const outcome = await gateById("image-publish")!.run(
      context(exec, { event: "push", env: pushEnv }),
    );

    expect(calls[0]![0]).toBe("docker");
    expect(calls[0]![1]).toBe("push");
    expect(outcome.status).toBe("passed");
    expect(outcome.summary).toBe("ghcr.io/owner/greeter@sha256:" + "d".repeat(64));
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
    const { exec } = fakeExec({ push: { code: 1, stderr: "denied" } });

    const outcome = await gateById("image-publish")!.run(
      context(exec, { event: "push", env: pushEnv }),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.details).toContain("denied");
  });

  test("a push that succeeds but yields no digest fails rather than inventing one", async () => {
    const { exec } = fakeExec({ inspect: { code: 1, stderr: "no such object" } });

    const outcome = await gateById("image-publish")!.run(
      context(exec, { event: "push", env: pushEnv }),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("digest");
  });
});
