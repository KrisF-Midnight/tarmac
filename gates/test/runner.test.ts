import { describe, expect, test } from "bun:test";
import { runGates } from "../src/runner";
import type { Exec, Gate, GateContext } from "../src/types";

const neverRuns: Exec = async () => {
  throw new Error("a gate shelled out when it should not have");
};

function context(overrides: Partial<GateContext> = {}): GateContext {
  return {
    appDir: "/tmp/app",
    platformDir: "/tmp/tarmac",
    event: "local",
    exec: neverRuns,
    exists: async () => true,
    env: {},
    ...overrides,
  };
}

function gate(id: string, over: Partial<Gate> = {}): Gate {
  return {
    id,
    title: id,
    severity: "blocking",
    rationale: "test fixture",
    run: async () => ({ status: "passed", summary: "ok" }),
    ...over,
  };
}

describe("runGates", () => {
  test("runs gates in the order given", async () => {
    const seen: string[] = [];
    const record = (id: string) =>
      gate(id, {
        run: async () => {
          seen.push(id);
          return { status: "passed", summary: "ok" };
        },
      });

    await runGates([record("first"), record("second"), record("third")], context());

    expect(seen).toEqual(["first", "second", "third"]);
  });

  test("a gate that does not apply is skipped, not passed", async () => {
    const publish = gate("publish", { appliesTo: (ctx) => ctx.event === "push" });

    const [run] = await runGates([publish], context({ event: "pull_request" }));

    expect(run!.outcome.status).toBe("skipped");
    expect(run!.outcome.summary).toContain("pull_request");
  });

  test("the same gate runs when the event matches", async () => {
    const publish = gate("publish", { appliesTo: (ctx) => ctx.event === "push" });

    const [run] = await runGates([publish], context({ event: "push" }));

    expect(run!.outcome.status).toBe("passed");
  });

  // A broken gate must look like a failure, not like an outage. Without this,
  // one bad gate takes down the reporting for every gate after it.
  test("a gate that throws becomes a failure and the run continues", async () => {
    const exploding = gate("exploding", {
      run: async () => {
        throw new Error("kaboom");
      },
    });

    const runs = await runGates([exploding, gate("after")], context());

    expect(runs).toHaveLength(2);
    expect(runs[0]!.outcome.status).toBe("failed");
    expect(runs[0]!.outcome.details).toContain("kaboom");
    expect(runs[1]!.outcome.status).toBe("passed");
  });

  test("a gate that throws a non-Error is still reported", async () => {
    const odd = gate("odd", {
      run: async () => {
        throw "just a string";
      },
    });

    const [run] = await runGates([odd], context());

    expect(run!.outcome.status).toBe("failed");
    expect(run!.outcome.details).toContain("just a string");
  });
});
