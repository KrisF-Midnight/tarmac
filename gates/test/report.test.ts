import { describe, expect, test } from "bun:test";
import { GATES } from "../src/registry";
import { renderGateMatrix, renderMarkdown, renderTerminal } from "../src/report";
import type { Gate, GateRun, Severity, Status } from "../src/types";
import { verdictFrom } from "../src/verdict";

function run(id: string, severity: Severity, status: Status, details?: string): GateRun {
  const gate: Gate = {
    id,
    title: id,
    severity,
    rationale: "a rationale long enough to be meaningful in the matrix",
    run: async () => ({ status, summary: "" }),
  };
  return { gate, outcome: { status, summary: `${id} summary`, details }, durationMs: 1200 };
}

describe("renderTerminal", () => {
  test("marks a reporting failure as non-blocking where a reader will see it", () => {
    const runs = [run("scan", "reporting", "failed")];

    const out = renderTerminal(runs, verdictFrom(runs), false);

    expect(out).toContain("reporting only");
    expect(out).toContain("PASSED");
  });

  test("names the blocking gates that failed, so the next step is obvious", () => {
    const runs = [run("typecheck", "blocking", "failed"), run("unit-tests", "blocking", "passed")];

    const out = renderTerminal(runs, verdictFrom(runs), false);

    expect(out).toContain("FAILED");
    expect(out).toContain("1 blocking");
    expect(out).toContain("typecheck");
  });

  test("failure output is included, so the log is enough to act on", () => {
    const runs = [run("typecheck", "blocking", "failed", "error TS2304: cannot find name")];

    expect(renderTerminal(runs, verdictFrom(runs), false)).toContain("TS2304");
  });

  test("emits no escape codes when colour is off", () => {
    const runs = [run("a", "blocking", "passed")];

    expect(renderTerminal(runs, verdictFrom(runs), false)).not.toContain("\x1b[");
    expect(renderTerminal(runs, verdictFrom(runs), true)).toContain("\x1b[");
  });
});

describe("renderMarkdown", () => {
  test("is one comment covering every gate, not one per gate", () => {
    const runs = [
      run("typecheck", "blocking", "passed"),
      run("scan", "reporting", "failed"),
      run("image-publish", "blocking", "skipped"),
    ];

    const out = renderMarkdown(runs, verdictFrom(runs));

    expect(out.match(/^### /gm)).toHaveLength(1);
    for (const id of ["typecheck", "scan", "image-publish"]) expect(out).toContain(id);
  });

  test("says the run passed when only reporting gates failed", () => {
    const runs = [run("scan", "reporting", "failed")];

    const out = renderMarkdown(runs, verdictFrom(runs));

    expect(out).toContain("All blocking gates passed");
    expect(out).toContain("do not block the merge");
  });

  test("collapses failure output rather than flooding the pull request", () => {
    const runs = [run("typecheck", "blocking", "failed", "a".repeat(500))];

    const out = renderMarkdown(runs, verdictFrom(runs));

    expect(out).toContain("<details>");
    expect(out).toContain("Blocking gates failed");
  });
});

describe("renderGateMatrix", () => {
  test("documents every registered gate with its severity and reason", () => {
    const matrix = renderGateMatrix(GATES);

    for (const gate of GATES) {
      expect(matrix).toContain(gate.title);
      expect(matrix).toContain(gate.rationale);
    }
  });

  test("says it is generated, so nobody hand-edits it", () => {
    expect(renderGateMatrix(GATES)).toContain("registry.ts");
  });
});
