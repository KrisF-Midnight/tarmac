import { describe, expect, test } from "bun:test";
import { IMAGE_FACT, collectFacts, renderFacts } from "../src/facts";
import type { Gate, GateOutcome, GateRun, Status } from "../src/types";

function run(id: string, status: Status, facts?: Record<string, string>): GateRun {
  const gate: Gate = {
    id,
    title: id,
    severity: "blocking",
    rationale: "never exercised — collectFacts reads outcomes, it does not run gates",
    run: async () => ({ status: "passed", summary: id }),
  };
  const outcome: GateOutcome = { status, summary: id, ...(facts ? { facts } : {}) };
  return { gate, outcome, durationMs: 1 };
}

const DIGEST = `ghcr.io/owner/greeter@sha256:${"d".repeat(64)}`;

describe("collectFacts", () => {
  test("collects what a passing gate stated", () => {
    const facts = collectFacts([
      run("typecheck", "passed"),
      run("image-publish", "passed", { [IMAGE_FACT]: DIGEST }),
    ]);

    expect(facts).toEqual({ [IMAGE_FACT]: DIGEST });
  });

  test("a run with nothing to say produces an empty object, not a missing one", () => {
    expect(collectFacts([run("typecheck", "passed")])).toEqual({});
  });

  // The case that matters locally: `make ci --event push` on a laptop skips the
  // publish gate, so there is no digest, and the file must say so rather than
  // carrying a stale one from a previous run.
  test("a skipped gate contributes nothing", () => {
    const facts = collectFacts([run("image-publish", "skipped", { [IMAGE_FACT]: DIGEST })]);

    expect(facts).toEqual({});
  });

  // A push that got far enough to name a digest and then failed has named an
  // image that must never reach a manifest.
  test("a failed gate contributes nothing, even when it stated a fact first", () => {
    const facts = collectFacts([run("image-publish", "failed", { [IMAGE_FACT]: DIGEST })]);

    expect(facts).toEqual({});
  });

  test("the same key with the same value twice is not a conflict", () => {
    const facts = collectFacts([
      run("a", "passed", { [IMAGE_FACT]: DIGEST }),
      run("b", "passed", { [IMAGE_FACT]: DIGEST }),
    ]);

    expect(facts).toEqual({ [IMAGE_FACT]: DIGEST });
  });

  // Last-one-wins here would deploy an image nothing reported as chosen.
  test("two gates disagreeing about a key is an error, not a silent overwrite", () => {
    expect(() =>
      collectFacts([
        run("a", "passed", { [IMAGE_FACT]: DIGEST }),
        run("b", "passed", { [IMAGE_FACT]: "ghcr.io/owner/greeter@sha256:other" }),
      ]),
    ).toThrow(/conflicting values for fact "image"/);
  });
});

describe("renderFacts", () => {
  test("keys are sorted and the file ends with a newline", () => {
    expect(renderFacts({ b: "2", a: "1" })).toBe('{\n  "a": "1",\n  "b": "2"\n}\n');
  });

  test("no facts still round-trips as JSON", () => {
    expect(JSON.parse(renderFacts({}))).toEqual({});
  });
});
