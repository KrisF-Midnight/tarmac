import { describe, expect, test } from "bun:test";
import { UsageError, containerFor, manifestPathFor, parseArgs } from "../src/args";

const REQUIRED = ["--facts", "/tmp/facts.json", "--app", "greeter"];
const ACTIONS = { GITHUB_ACTIONS: "true" };

describe("parseArgs", () => {
  // The safety property the whole separation rests on: this command cannot be
  // talked into writing from a laptop, by any flag.
  test("writing needs GitHub Actions; anywhere else is a dry run", () => {
    expect(parseArgs(REQUIRED, {}).dryRun).toBe(true);
    expect(parseArgs(REQUIRED, { GITHUB_ACTIONS: "false" }).dryRun).toBe(true);
    expect(parseArgs(REQUIRED, ACTIONS).dryRun).toBe(false);
  });

  test("--dry-run overrides a live context, but nothing overrides the other way", () => {
    expect(parseArgs([...REQUIRED, "--dry-run"], ACTIONS).dryRun).toBe(true);
  });

  test("--facts and --app are required, because there is no sane default for either", () => {
    expect(() => parseArgs(["--app", "greeter"], {})).toThrow(/--facts is required/);
    expect(() => parseArgs(["--facts", "/tmp/f.json"], {})).toThrow(/--app is required/);
  });

  test("defaults to the current checkout and the default branch", () => {
    const options = parseArgs(REQUIRED, {});

    expect(options.repoDir).toBe(".");
    expect(options.branch).toBe("main");
    expect(options.remote).toBe("origin");
  });

  test("an unknown option is rejected rather than ignored", () => {
    expect(() => parseArgs([...REQUIRED, "--force"], {})).toThrow(UsageError);
  });

  test("a flag missing its value is an error, not a swallowed next flag", () => {
    expect(() => parseArgs(["--facts", "--app", "greeter"], {})).toThrow(/needs a value/);
  });
});

describe("conventions", () => {
  // By convention, not by configuration — a per-app setting here would be the
  // first line of the config file the design exists to avoid.
  test("the manifest path is derived from the application name", () => {
    expect(manifestPathFor(parseArgs(REQUIRED, {}))).toBe("gitops/greeter/deployment.yaml");
    expect(containerFor(parseArgs(REQUIRED, {}))).toBe("greeter");
  });

  test("both can still be overridden, for an app that does not fit the shape", () => {
    const options = parseArgs(
      [...REQUIRED, "--manifest", "gitops/other/deploy.yaml", "--container", "web"],
      {},
    );

    expect(manifestPathFor(options)).toBe("gitops/other/deploy.yaml");
    expect(containerFor(options)).toBe("web");
  });
});
