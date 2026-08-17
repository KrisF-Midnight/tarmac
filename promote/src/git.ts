import type { Exec } from "../../gates/src/types";

/**
 * The only code in the platform that writes to a remote.
 *
 * It takes an injected `Exec` for the same reason the gates do: every branch
 * here — the push that races and has to rebase, the rebase that conflicts, the
 * commit with nothing staged — is a case that has to be tested, and none of
 * them are reachable if the tests need a real remote to reach them.
 *
 * Identity is passed per-invocation with `-c` rather than written into the
 * repository's config. A runner is a fresh machine every time and configuring
 * it would be harmless; doing it this way means the commit's author is visible
 * at the call site instead of in a setup step three files away.
 */

export type CommitInput = {
  repoDir: string;
  /** Paths to stage, relative to the repository root. */
  paths: string[];
  message: string;
  authorName: string;
  authorEmail: string;
  branch: string;
  remote: string;
  exec: Exec;
  /** How many times to rebase and try again when the remote has moved on. */
  attempts?: number;
};

export type PushResult = {
  /** The commit that was pushed. */
  sha: string;
  /** How many pushes it took — more than one means the branch had moved. */
  attempts: number;
};

async function git(input: CommitInput, args: string[]): Promise<string> {
  const cmd = [
    "git",
    "-c",
    `user.name=${input.authorName}`,
    "-c",
    `user.email=${input.authorEmail}`,
    ...args,
  ];
  const { code, stdout, stderr } = await input.exec(cmd, { cwd: input.repoDir });
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${code}): ${(stderr || stdout).trim()}`);
  }
  return stdout.trim();
}

async function tryGit(input: CommitInput, args: string[]): Promise<boolean> {
  const { code } = await input.exec(["git", ...args], { cwd: input.repoDir });
  return code === 0;
}

/**
 * Stages, commits and pushes, rebasing onto the remote when the branch has
 * moved underneath us.
 *
 * The race is real and mundane: two applications finishing their builds within
 * a few seconds of each other, both committing into the same deployment
 * directory. A rebase resolves it because the two commits touch different
 * files. When it does not — two runs promoting the same application — the
 * rebase is aborted rather than resolved, because the two commits disagree
 * about which image should be running and only the pipeline that produced the
 * later one knows which that is.
 */
export async function commitAndPush(input: CommitInput): Promise<PushResult> {
  const attempts = input.attempts ?? 3;

  await git(input, ["add", "--", ...input.paths]);

  // Nothing staged means someone called this without checking `changed` first.
  // Committing anyway would produce an empty commit, and Argo would sync it and
  // report a deployment that deployed nothing.
  // `--quiet` exits zero when there is no difference, so a zero here means the
  // index matches HEAD: nothing to commit.
  const clean = await tryGit(input, ["diff", "--cached", "--quiet"]);
  if (clean) throw new Error("nothing staged to commit");

  await git(input, ["commit", "--message", input.message]);

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const pushed = await tryGit(input, [
      "push",
      input.remote,
      `HEAD:refs/heads/${input.branch}`,
    ]);
    if (pushed) {
      return { sha: await git(input, ["rev-parse", "HEAD"]), attempts: attempt };
    }

    if (attempt === attempts) break;

    await git(input, ["fetch", input.remote, input.branch]);
    const rebased = await tryGit(input, ["rebase", `${input.remote}/${input.branch}`]);
    if (!rebased) {
      await tryGit(input, ["rebase", "--abort"]);
      throw new Error(
        `rebase onto ${input.remote}/${input.branch} conflicted — another run changed the same ` +
          `manifest. Re-run this job; it will read the current state and decide again.`,
      );
    }
  }

  throw new Error(`could not push to ${input.remote}/${input.branch} after ${attempts} attempts`);
}

/**
 * The commit message. Short subject, and a body that answers the question
 * anyone reading `git log` in the deployment directory actually has: which
 * change in which repository caused this, and where is the run that made it.
 */
export function commitMessage(input: {
  app: string;
  image: string;
  sourceRepo?: string;
  sourceSha?: string;
  runUrl?: string;
}): string {
  const digest = input.image.split("@")[1] ?? input.image;
  const lines = [`deploy(${input.app}): ${digest.slice(0, 19)}`, ""];

  if (input.sourceRepo && input.sourceSha) {
    lines.push(`Source: ${input.sourceRepo}@${input.sourceSha}`);
  }
  if (input.runUrl) lines.push(`Run: ${input.runUrl}`);
  lines.push(`Image: ${input.image}`);

  return `${lines.join("\n")}\n`;
}
