import type { Exec, ExecResult } from "./types";

/**
 * The one place the platform actually shells out. Everything else takes an
 * `Exec` and is therefore testable without a subprocess.
 *
 * Output is captured rather than inherited so a failing gate can attach the
 * command's own words to its result — a gate that says "failed" and makes you
 * go read a log elsewhere has wasted the developer's time.
 */
export const spawnExec: Exec = async (cmd, opts = {}): Promise<ExecResult> => {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { code, stdout, stderr };
};

/** Last few lines of command output, for the details block of a failure. */
export function tail(text: string, lines = 20): string {
  return text.trimEnd().split("\n").slice(-lines).join("\n");
}
