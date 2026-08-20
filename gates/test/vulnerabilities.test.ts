import { describe, expect, test } from "bun:test";
import {
  type Vulnerability,
  describe as describeVulns,
  fixable,
  summarise,
  vulnerabilitiesIn,
} from "../src/vulnerabilities";

/** A trivy finding with everything filled in, overridable field by field. */
function finding(over: Record<string, unknown> = {}) {
  return {
    VulnerabilityID: "CVE-2024-0001",
    PkgName: "openssl",
    InstalledVersion: "3.0.1",
    FixedVersion: "3.0.2",
    Severity: "HIGH",
    ...over,
  };
}

function report(...results: unknown[]): string {
  return JSON.stringify({ Results: results });
}

/** Findings as this module's own shape, for the functions downstream of parsing. */
function vuln(over: Partial<Vulnerability> = {}): Vulnerability {
  return {
    id: "CVE-2024-0001",
    pkg: "openssl",
    installed: "3.0.1",
    fixedIn: "3.0.2",
    severity: "HIGH",
    ...over,
  };
}

describe("reading a trivy report", () => {
  test("flattens findings across targets, because one image has several", () => {
    const parsed = vulnerabilitiesIn(
      report(
        { Target: "greeter (debian 12)", Vulnerabilities: [finding({ VulnerabilityID: "CVE-1" })] },
        { Target: "app/bun.lock", Vulnerabilities: [finding({ VulnerabilityID: "CVE-2" })] },
      ),
    );

    expect(parsed.map((v) => v.id)).toEqual(["CVE-1", "CVE-2"]);
  });

  // Absent, null and empty all mean trivy looked and found nothing. Any of the
  // three throwing would turn a clean scan into a broken gate, which is the
  // failure mode most likely to get the whole check switched off.
  test("a report with nothing in it is empty, however it says so", () => {
    expect(vulnerabilitiesIn("{}")).toEqual([]);
    expect(vulnerabilitiesIn(JSON.stringify({ Results: null }))).toEqual([]);
    expect(vulnerabilitiesIn(report())).toEqual([]);
    expect(vulnerabilitiesIn(report({ Target: "greeter" }))).toEqual([]);
    expect(vulnerabilitiesIn(report({ Target: "greeter", Vulnerabilities: null }))).toEqual([]);
  });

  // Someone else's schema, read across scanner versions: a missing field should
  // cost the reader one column, not the whole report.
  test("a finding missing fields is kept, marked unknown", () => {
    const [only] = vulnerabilitiesIn(report({ Vulnerabilities: [{}] }));

    expect(only).toEqual({
      id: "unknown",
      pkg: "unknown",
      installed: "unknown",
      fixedIn: null,
      severity: "UNKNOWN",
    });
  });

  // Trivy states "no fix published" as an empty string, and `""` is a value
  // that reads as present. Left alone it would make an unactionable finding
  // sort and count as an actionable one.
  test("an empty FixedVersion means no fix, not a fix called nothing", () => {
    const parsed = vulnerabilitiesIn(report({ Vulnerabilities: [finding({ FixedVersion: "" })] }));

    expect(parsed[0]?.fixedIn).toBeNull();
  });

  test("severity is normalised, so ranking does not depend on the scanner's casing", () => {
    const parsed = vulnerabilitiesIn(report({ Vulnerabilities: [finding({ Severity: "critical" })] }));

    expect(parsed[0]?.severity).toBe("CRITICAL");
  });

  test("malformed output throws, for the gate to catch and report", () => {
    expect(() => vulnerabilitiesIn("not json")).toThrow();
  });
});

describe("the order findings are listed in", () => {
  test("worst severity first", () => {
    const parsed = vulnerabilitiesIn(
      report({
        Vulnerabilities: [
          finding({ VulnerabilityID: "CVE-LOW", Severity: "LOW" }),
          finding({ VulnerabilityID: "CVE-CRIT", Severity: "CRITICAL" }),
          finding({ VulnerabilityID: "CVE-HIGH", Severity: "HIGH" }),
        ],
      }),
    );

    expect(parsed.map((v) => v.id)).toEqual(["CVE-CRIT", "CVE-HIGH", "CVE-LOW"]);
  });

  // The point of the whole ordering: what the reader sees first is what they
  // can do something about today. A list that opens with unfixable criticals
  // trains people to close it.
  test("within a severity, the ones with a fix come first", () => {
    const parsed = vulnerabilitiesIn(
      report({
        Vulnerabilities: [
          finding({ VulnerabilityID: "CVE-A", Severity: "CRITICAL", FixedVersion: "" }),
          finding({ VulnerabilityID: "CVE-B", Severity: "CRITICAL", FixedVersion: "3.0.2" }),
        ],
      }),
    );

    expect(parsed.map((v) => v.id)).toEqual(["CVE-B", "CVE-A"]);
  });

  // Same severity, same fixability, arbitrary input order — the output still
  // has to be one list, or the pull request comment churns between runs of the
  // same commit and stops being readable as a diff.
  test("ties break on the id, so the same report renders the same way twice", () => {
    const ids = ["CVE-3", "CVE-1", "CVE-2"];
    const parsed = vulnerabilitiesIn(
      report({ Vulnerabilities: ids.map((id) => finding({ VulnerabilityID: id })) }),
    );

    expect(parsed.map((v) => v.id)).toEqual(["CVE-1", "CVE-2", "CVE-3"]);
  });

  test("an unrecognised severity sorts last rather than crashing", () => {
    const parsed = vulnerabilitiesIn(
      report({
        Vulnerabilities: [
          finding({ VulnerabilityID: "CVE-ODD", Severity: "SEVERE" }),
          finding({ VulnerabilityID: "CVE-LOW", Severity: "LOW" }),
        ],
      }),
    );

    expect(parsed.map((v) => v.id)).toEqual(["CVE-LOW", "CVE-ODD"]);
  });
});

describe("fixable", () => {
  test("keeps only the findings with a published fix", () => {
    const all = [vuln({ id: "CVE-1" }), vuln({ id: "CVE-2", fixedIn: null })];

    expect(fixable(all).map((v) => v.id)).toEqual(["CVE-1"]);
  });
});

describe("the one-line summary", () => {
  test("counts by severity, worst first, and names how many are actionable", () => {
    const summary = summarise([
      vuln({ severity: "CRITICAL" }),
      vuln({ severity: "HIGH" }),
      vuln({ severity: "HIGH", fixedIn: null }),
    ]);

    expect(summary).toBe("1 CRITICAL, 2 HIGH — 2 with a fix available");
  });

  test("severities with nothing in them are left out", () => {
    expect(summarise([vuln({ severity: "HIGH" })])).toBe("1 HIGH — 1 with a fix available");
  });

  // Zero fixable is the case the author is being told they cannot act on this
  // one — it has to survive into the summary rather than reading as an absence.
  test("says so when none of them can be fixed", () => {
    expect(summarise([vuln({ severity: "CRITICAL", fixedIn: null })])).toBe(
      "1 CRITICAL — 0 with a fix available",
    );
  });
});

describe("the detail block", () => {
  test("names the package, what is installed and what to move to", () => {
    const lines = describeVulns([vuln()]);

    expect(lines).toContain("CVE-2024-0001");
    expect(lines).toContain("openssl");
    expect(lines).toContain("3.0.1");
    expect(lines).toContain("-> 3.0.2");
  });

  test("an unfixable finding says so instead of trailing off", () => {
    expect(describeVulns([vuln({ fixedIn: null })])).toContain("(no fix published)");
  });

  // A base image can carry hundreds. The cap is what keeps the pull request
  // comment readable; the count is what keeps it honest about being capped.
  test("stops at twenty and says how many it did not list", () => {
    const many = Array.from({ length: 25 }, (_, i) => vuln({ id: `CVE-${i}` }));

    const lines = describeVulns(many).split("\n");

    expect(lines).toHaveLength(21);
    expect(lines[20]).toBe("... and 5 more, worst first");
  });

  test("no findings, no lines", () => {
    expect(describeVulns([])).toBe("");
  });
});
