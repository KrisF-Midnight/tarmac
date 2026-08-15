import type { GateRun, Severity, Status } from "./types";

/**
 * The decision layer, deliberately kept pure.
 *
 * Everything here is a function from gate results to a verdict — no I/O, no
 * clock, no environment. That is the whole point: "does this pipeline fail?"
 * is the single most consequential piece of logic in the platform, and it is
 * the one thing a `run:` block makes impossible to test.
 */

export type Verdict = {
  /** False only when a blocking gate failed. Reporting failures never flip it. */
  passed: boolean;
  blockingFailures: GateRun[];
  reportingFailures: GateRun[];
  skipped: GateRun[];
  counts: Record<Status, number>;
};

function failuresOf(runs: GateRun[], severity: Severity): GateRun[] {
  return runs.filter((r) => r.outcome.status === "failed" && r.gate.severity === severity);
}

export function verdictFrom(runs: GateRun[]): Verdict {
  const blockingFailures = failuresOf(runs, "blocking");
  const reportingFailures = failuresOf(runs, "reporting");

  const counts: Record<Status, number> = { passed: 0, failed: 0, skipped: 0 };
  for (const run of runs) counts[run.outcome.status] += 1;

  return {
    passed: blockingFailures.length === 0,
    blockingFailures,
    reportingFailures,
    skipped: runs.filter((r) => r.outcome.status === "skipped"),
    counts,
  };
}

/**
 * A skipped gate is not a passed gate, but it is not a failure either — a gate
 * that does not apply to the event should not be able to fail the run. An empty
 * run passes: refusing to merge because nobody configured a gate would be the
 * platform failing, not the change.
 */
export function exitCodeFor(verdict: Verdict): number {
  return verdict.passed ? 0 : 1;
}
