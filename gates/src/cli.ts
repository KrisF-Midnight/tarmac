#!/usr/bin/env bun
import { resolve } from "node:path";
import { USAGE, UsageError, parseArgs } from "./args";
import { spawnExec } from "./exec";
import { GATES, selectGates } from "./registry";
import { renderMarkdown, renderTerminal } from "./report";
import { runGates } from "./runner";
import { exitCodeFor, verdictFrom } from "./verdict";

/**
 * The single entrypoint. `make ci` runs this and so does the reusable workflow,
 * with the same arguments — that identity is the whole reason the gate logic
 * lives in code rather than in workflow steps. Everything above this file is
 * pure enough to unit test; this is the thin shell that has a process to exit.
 */
async function main(argv: string[]): Promise<number> {
  const options = parseArgs(argv, Bun.env);
  const gates = selectGates(options.only);

  const runs = await runGates(gates, {
    appDir: resolve(options.appDir),
    event: options.event,
    exec: spawnExec,
    env: Bun.env,
  });

  const verdict = verdictFrom(runs);
  console.log(renderTerminal(runs, verdict, options.colour));

  if (options.markdownPath) {
    await Bun.write(options.markdownPath, renderMarkdown(runs, verdict));
  }

  return exitCodeFor(verdict);
}

if (import.meta.main) {
  try {
    process.exit(await main(Bun.argv.slice(2)));
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`${err.message}\n\n${USAGE}`);
      process.exit(2);
    }
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}

export { main, GATES };
