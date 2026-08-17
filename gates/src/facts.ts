import type { GateRun } from "./types";

/**
 * What a gate run hands to the steps that come after it.
 *
 * The gates verify and stop there — nothing in `gates/` writes to a registry
 * index, a manifest or a remote. But the release step needs one thing the gates
 * learned, the digest of the image that was actually pushed, and there are only
 * bad ways to pass it: parse the rendered summary (couples a machine contract to
 * prose written for humans), or let the publishing gate write the manifest
 * itself (makes `make ci` on a laptop a command that can push a commit).
 *
 * So it goes through a file. A gate states facts, the run collects them, and
 * the promoter reads them. Neither side knows about the other beyond the key
 * names below, which is the entire contract.
 */

/** The pushed image as a fully qualified `repo@sha256:...` reference. */
export const IMAGE_FACT = "image";

/**
 * Collected from passed gates only.
 *
 * A skipped gate has nothing to say, and a failed one's findings are not
 * evidence of anything — a half-finished push that reported a digest is exactly
 * the value that must not reach a manifest.
 *
 * A key claimed twice with different values is an error rather than a
 * last-one-wins merge. Two gates disagreeing about the digest is a bug in the
 * gates, and silently picking one would surface as the wrong image running with
 * nothing anywhere reporting a problem.
 */
export function collectFacts(runs: GateRun[]): Record<string, string> {
  const facts: Record<string, string> = {};

  for (const run of runs) {
    if (run.outcome.status !== "passed") continue;

    for (const [key, value] of Object.entries(run.outcome.facts ?? {})) {
      const existing = facts[key];
      if (existing !== undefined && existing !== value) {
        throw new Error(
          `conflicting values for fact "${key}": ${existing} and ${value} (from ${run.gate.id})`,
        );
      }
      facts[key] = value;
    }
  }

  return facts;
}

/** Stable key order, so a diff of two runs shows what changed and nothing else. */
export function renderFacts(facts: Record<string, string>): string {
  const ordered = Object.fromEntries(Object.entries(facts).sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
