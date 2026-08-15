import type { Gate, GateContext, GateRun } from "./types";

/**
 * Runs gates in order and never lets one take the process with it.
 *
 * Two behaviours matter here and both are tested. A gate that does not apply to
 * the event is skipped rather than passed, so the report cannot claim coverage
 * it does not have. A gate that throws is recorded as a failure rather than
 * crashing the run — a broken gate should be visible as a broken gate, not as
 * a stack trace where the verdict should be.
 *
 * Gates run sequentially on purpose: they contend for Docker and for the same
 * working tree, and interleaved output from a parallel run is harder to read
 * than a slower one that reads top to bottom.
 */
export async function runGates(gates: Gate[], ctx: GateContext): Promise<GateRun[]> {
  const runs: GateRun[] = [];

  for (const gate of gates) {
    if (gate.appliesTo && !gate.appliesTo(ctx)) {
      runs.push({
        gate,
        outcome: { status: "skipped", summary: `not run on ${ctx.event}` },
        durationMs: 0,
      });
      continue;
    }

    const started = Date.now();
    try {
      const outcome = await gate.run(ctx);
      runs.push({ gate, outcome, durationMs: Date.now() - started });
    } catch (err) {
      runs.push({
        gate,
        outcome: {
          status: "failed",
          summary: "the gate itself errored",
          details: err instanceof Error ? (err.stack ?? err.message) : String(err),
        },
        durationMs: Date.now() - started,
      });
    }
  }

  return runs;
}
