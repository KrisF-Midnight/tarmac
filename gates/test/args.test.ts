import { describe, expect, test } from "bun:test";
import { UsageError, eventFrom, parseArgs } from "../src/args";

describe("eventFrom", () => {
  test("uses the GitHub event when it is one we gate on", () => {
    expect(eventFrom({ GITHUB_EVENT_NAME: "pull_request" })).toBe("pull_request");
    expect(eventFrom({ GITHUB_EVENT_NAME: "push" })).toBe("push");
  });

  test("no GitHub environment means a laptop", () => {
    expect(eventFrom({})).toBe("local");
  });

  // Resolving an unknown trigger to `local` runs the safe subset. Resolving it
  // to `push` would publish an image from, say, a schedule or a comment event.
  test("an unrecognised event falls back to local rather than assuming a merge", () => {
    expect(eventFrom({ GITHUB_EVENT_NAME: "issue_comment" })).toBe("local");
    expect(eventFrom({ GITHUB_EVENT_NAME: "workflow_dispatch" })).toBe("local");
  });
});

describe("parseArgs", () => {
  test("defaults to the current directory and the ambient event", () => {
    const options = parseArgs([], {});

    expect(options.appDir).toBe(".");
    expect(options.event).toBe("local");
    expect(options.only).toEqual([]);
  });

  test("an explicit --event overrides the environment", () => {
    const options = parseArgs(["--event", "push"], { GITHUB_EVENT_NAME: "pull_request" });

    expect(options.event).toBe("push");
  });

  test("--only splits and trims", () => {
    expect(parseArgs(["--only", "typecheck, unit-tests"], {}).only).toEqual([
      "typecheck",
      "unit-tests",
    ]);
  });

  test("colour is off under CI, where it is only ever escape noise in a log", () => {
    expect(parseArgs([], {}).colour).toBe(true);
    expect(parseArgs([], { CI: "true" }).colour).toBe(false);
    expect(parseArgs(["--no-colour"], {}).colour).toBe(false);
  });

  // Absent by default: a run that was not asked for a facts file must not
  // leave one behind for a later step to read as this run's result.
  test("--facts-out is off unless asked for", () => {
    expect(parseArgs([], {}).factsPath).toBeUndefined();
    expect(parseArgs(["--facts-out", "/tmp/facts.json"], {}).factsPath).toBe("/tmp/facts.json");
  });

  test("an unknown event is rejected", () => {
    expect(() => parseArgs(["--event", "merge"], {})).toThrow(UsageError);
  });

  test("an unknown option is rejected rather than ignored", () => {
    expect(() => parseArgs(["--deploy"], {})).toThrow(UsageError);
  });

  // Otherwise `--app-dir --event push` silently gates a directory called
  // "--event" and the run means nothing.
  test("a flag missing its value is an error, not a swallowed next flag", () => {
    expect(() => parseArgs(["--app-dir", "--event", "push"], {})).toThrow(/needs a value/);
    expect(() => parseArgs(["--only"], {})).toThrow(/needs a value/);
    expect(() => parseArgs(["--facts-out"], {})).toThrow(/needs a value/);
  });
});
