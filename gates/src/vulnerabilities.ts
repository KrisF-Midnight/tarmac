/**
 * Reading a scanner's report, kept apart from running the scanner.
 *
 * The judgement this platform is making about security is not "which scanner" —
 * it is what a finding means once you have it. That judgement is here, in
 * functions that take a string and return a verdict, so it can be tested against
 * a captured report rather than against whatever the vulnerability database
 * happens to say this morning. A gate whose expected result changes daily is a
 * gate nobody can write a test for.
 */

export type Vulnerability = {
  id: string;
  pkg: string;
  installed: string;
  /** Null when upstream has published no fix — see `fixable`. */
  fixedIn: string | null;
  severity: string;
};

/** Worst first. Anything unrecognised sorts last rather than crashing. */
const RANK = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];

function rankOf(severity: string): number {
  const at = RANK.indexOf(severity.toUpperCase());
  return at === -1 ? RANK.length : at;
}

/**
 * Findings, flattened out of a `trivy --format json` report.
 *
 * Trivy reports per target — the OS package database is one, each lockfile it
 * recognises is another — and a `Results` array that is absent, null or empty
 * all mean the same thing: it looked and found nothing. Every field is read
 * defensively because this is somebody else's schema across versions, and a
 * scanner upgrade should not be able to crash the pipeline.
 */
export function vulnerabilitiesIn(report: string): Vulnerability[] {
  const parsed = JSON.parse(report) as {
    Results?: {
      Vulnerabilities?: {
        VulnerabilityID?: string;
        PkgName?: string;
        InstalledVersion?: string;
        FixedVersion?: string;
        Severity?: string;
      }[] | null;
    }[] | null;
  };

  const found: Vulnerability[] = [];
  for (const result of parsed.Results ?? []) {
    for (const vuln of result.Vulnerabilities ?? []) {
      found.push({
        id: vuln.VulnerabilityID ?? "unknown",
        pkg: vuln.PkgName ?? "unknown",
        installed: vuln.InstalledVersion ?? "unknown",
        fixedIn: vuln.FixedVersion ? vuln.FixedVersion : null,
        severity: (vuln.Severity ?? "UNKNOWN").toUpperCase(),
      });
    }
  }

  // Worst first, and within a severity the ones somebody can act on today
  // before the ones they cannot. A list that opens with four unfixable
  // criticals teaches the reader to close it.
  return found.sort(
    (a, b) =>
      rankOf(a.severity) - rankOf(b.severity) ||
      Number(b.fixedIn !== null) - Number(a.fixedIn !== null) ||
      a.id.localeCompare(b.id),
  );
}

/** A finding with a published fix — the only kind this repository can act on. */
export function fixable(vulns: Vulnerability[]): Vulnerability[] {
  return vulns.filter((v) => v.fixedIn !== null);
}

/**
 * The one line that reaches the step summary table.
 *
 * It leads with the fixable count rather than the total, because the total is a
 * property of the base image and the calendar, and the fixable count is the
 * only part of it this change's author can do anything about.
 */
export function summarise(vulns: Vulnerability[]): string {
  const counts = RANK.map((severity) => ({
    severity,
    n: vulns.filter((v) => v.severity === severity).length,
  })).filter((c) => c.n > 0);

  const breakdown = counts.map((c) => `${c.n} ${c.severity}`).join(", ");
  return `${breakdown} — ${fixable(vulns).length} with a fix available`;
}

/** How many findings the detail block lists before it stops. */
const LISTED = 20;

export function describe(vulns: Vulnerability[]): string {
  const lines = vulns
    .slice(0, LISTED)
    .map(
      (v) =>
        `${v.severity.padEnd(8)} ${v.id.padEnd(20)} ${v.pkg} ${v.installed}` +
        (v.fixedIn ? ` -> ${v.fixedIn}` : " (no fix published)"),
    );

  if (vulns.length > LISTED) {
    lines.push(`... and ${vulns.length - LISTED} more, worst first`);
  }
  return lines.join("\n");
}
