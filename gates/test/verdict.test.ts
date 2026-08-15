import { describe, expect, test } from "bun:test";
import type { Gate, GateRun, Severity, Status } from "../src/types";
import { exitCodeFor, verdictFrom } from "../src/verdict";

function gate(id: string, severity: Severity): Gate {
  return {
    id,
    title: id,
    severity,
    rationale: "test fixture",
    run: async () => ({ status: "passed", summary: "" }),
  };
}

function run(id: string, severity: Severity, status: Status): GateRun {
  return { gate: gate(id, severity), outcome: { status, summary: "" }, durationMs: 1 };
}

describe("verdict", () => {
  test("passes when every gate passes", () => {
    const verdict = verdictFrom([
      run("a", "blocking", "passed"),
      run("b", "reporting", "passed"),
    ]);

    expect(verdict.passed).toBe(true);
    expect(exitCodeFor(verdict)).toBe(0);
  });

  test("a failing blocking gate fails the run", () => {
    const verdict = verdictFrom([run("a", "blocking", "failed")]);

    expect(verdict.passed).toBe(false);
    expect(exitCodeFor(verdict)).toBe(1);
    expect(verdict.blockingFailures.map((r) => r.gate.id)).toEqual(["a"]);
  });

  // The entire point of the severity split. If this test ever goes green by
  // being deleted, the platform has quietly become all-or-nothing.
  test("a failing reporting gate is surfaced but does not fail the run", () => {
    const verdict = verdictFrom([run("scan", "reporting", "failed")]);

    expect(verdict.passed).toBe(true);
    expect(exitCodeFor(verdict)).toBe(0);
    expect(verdict.reportingFailures.map((r) => r.gate.id)).toEqual(["scan"]);
    expect(verdict.blockingFailures).toHaveLength(0);
  });

  test("one blocking failure outweighs any number of passes", () => {
    const verdict = verdictFrom([
      run("a", "blocking", "passed"),
      run("b", "blocking", "passed"),
      run("c", "blocking", "failed"),
      run("d", "reporting", "failed"),
    ]);

    expect(verdict.passed).toBe(false);
    expect(verdict.counts).toEqual({ passed: 2, failed: 2, skipped: 0 });
  });

  test("a skipped blocking gate does not fail the run", () => {
    const verdict = verdictFrom([run("publish", "blocking", "skipped")]);

    expect(verdict.passed).toBe(true);
    expect(verdict.skipped.map((r) => r.gate.id)).toEqual(["publish"]);
  });

  // Defensive: an empty run means nobody was gated, but refusing the merge for
  // it would be the platform blaming the change for its own misconfiguration.
  test("an empty run passes", () => {
    const verdict = verdictFrom([]);

    expect(verdict.passed).toBe(true);
    expect(verdict.counts).toEqual({ passed: 0, failed: 0, skipped: 0 });
  });
});
