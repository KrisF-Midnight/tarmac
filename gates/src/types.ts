/**
 * The vocabulary the whole gate system is built from.
 *
 * A gate is a check with a verdict attached. The important field is `severity`:
 * it is the difference between "this stops the merge" and "this is worth
 * knowing". Encoding it here rather than in workflow `if:` expressions is what
 * makes the blocking/reporting split a property of the platform that can be
 * listed, tested and argued with, instead of an emergent behaviour of YAML.
 */

/** Whether a failure stops the pipeline or is merely reported on the PR. */
export type Severity = "blocking" | "reporting";

export type Status = "passed" | "failed" | "skipped";

/** What triggered this run. Some gates only make sense on one of them. */
export type Event = "local" | "pull_request" | "push";

export type ExecResult = {
  code: number;
  stdout: string;
  stderr: string;
};

/**
 * Every shell-out goes through this. Gates never call `Bun.spawn` directly, so
 * the test suite can hand them a fake and assert on what a gate does with an
 * exit code without needing Docker, a network, or the app repo on disk.
 */
export type Exec = (cmd: string[], opts?: { cwd?: string }) => Promise<ExecResult>;

/**
 * Does this path exist? Injected for the same reason `exec` is: a gate that
 * decides what to check based on what is on disk should be testable without
 * building the disk first.
 */
export type PathExists = (path: string) => Promise<boolean>;

export type GateContext = {
  /** Absolute path to the application repository being gated. */
  appDir: string;
  /**
   * Absolute path to the platform repository — this one — supplying the gates.
   *
   * Only the policy gate needs it, and it needs it because the rules it
   * enforces are the platform's, not the application's. An app cannot be asked
   * to carry a copy of the policies it is judged against: it would be free to
   * edit them, which is the same as having no policy at all.
   */
  platformDir: string;
  event: Event;
  exec: Exec;
  exists: PathExists;
  env: Record<string, string | undefined>;
};

export type GateOutcome = {
  status: Status;
  /** One line, shown in the terminal and in the PR comment's table. */
  summary: string;
  /** Optional long form — command output, kept out of the summary line. */
  details?: string;
  /**
   * Machine-readable findings, for the steps that run after the gates.
   *
   * Deliberately separate from `summary`: the summary is written for a human
   * reading a PR comment, and the moment something parses it, its wording is a
   * contract. A gate that discovers a fact worth acting on — the digest it just
   * pushed, say — states it here instead.
   */
  facts?: Record<string, string>;
};

export type Gate = {
  id: string;
  title: string;
  severity: Severity;
  /**
   * Why this gate has the severity it has. Rendered directly into the gate
   * matrix, so the justification lives next to the code it justifies and
   * cannot drift away from it.
   */
  rationale: string;
  /** Gates that do not apply to an event are skipped, not failed. */
  appliesTo?: (ctx: GateContext) => boolean;
  run: (ctx: GateContext) => Promise<GateOutcome>;
};

export type GateRun = {
  gate: Gate;
  outcome: GateOutcome;
  durationMs: number;
};
