#!/usr/bin/env bun
import { join, resolve } from "node:path";
import { spawnExec } from "../../gates/src/exec";
import { IMAGE_FACT } from "../../gates/src/facts";
import { USAGE, UsageError, containerFor, manifestPathFor, parseArgs } from "./args";
import { commitAndPush, commitMessage } from "./git";
import { renderDiff, setContainerImage } from "./manifest";

/**
 * Promotion: take the digest the gates published and make it the digest the
 * cluster is asked to run.
 *
 * This is deliberately not a gate. Gates read the working tree and return a
 * verdict; this one changes a file and pushes a commit, and running the whole
 * gate suite on a laptop must not be able to do that. Keeping it as a separate
 * program with a separate entrypoint is what makes that true by construction
 * rather than by an `if` somewhere inside a shared runner.
 *
 * Everything it does is decided by two things it is handed: a facts file, and
 * a manifest. It talks to no registry and no cluster.
 */

async function readFacts(path: string): Promise<Record<string, string>> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`no facts file at ${path} — did the gate run get --facts-out?`);
  }

  const parsed: unknown = JSON.parse(await file.text());
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} is not a JSON object of facts`);
  }
  return parsed as Record<string, string>;
}

async function main(argv: string[], env: Record<string, string | undefined>): Promise<number> {
  const options = parseArgs(argv, env);
  const repoDir = resolve(options.repoDir);
  const relative = manifestPathFor(options);
  const manifestPath = join(repoDir, relative);

  const facts = await readFacts(resolve(options.factsPath));
  const image = facts[IMAGE_FACT];
  if (!image) {
    // Two very different situations produce an empty facts file, and the
    // difference is not visible from here — only from where the command is
    // running. On a laptop the publish gate skipped because there is no
    // registry to push to, which is expected; in CI it means the publish
    // failed. Both are refusals rather than a quiet success, because the
    // alternative is re-promoting whatever digest is already in the manifest
    // and calling that a deployment.
    throw new Error(
      `no "${IMAGE_FACT}" in the facts — nothing was published to promote` +
        (options.dryRun
          ? "\n(expected outside CI: the publish gate skips when there is no registry to push to)"
          : ""),
    );
  }

  const manifest = Bun.file(manifestPath);
  if (!(await manifest.exists())) {
    throw new Error(`no manifest at ${relative} — the convention is gitops/<app>/deployment.yaml`);
  }

  const edit = setContainerImage(await manifest.text(), containerFor(options), image);
  console.log(renderDiff(relative, edit));

  // Re-running a pipeline on the same commit is a normal thing to do, and it
  // must not produce a commit that changes nothing: Argo would sync it, the
  // deployment history would gain an entry, and nothing would have happened.
  if (!edit.changed) return 0;

  if (options.dryRun) {
    console.log("\ndry run — nothing written, nothing pushed");
    return 0;
  }

  await Bun.write(manifestPath, edit.content);

  const server = env.GITHUB_SERVER_URL ?? "https://github.com";
  const result = await commitAndPush({
    repoDir,
    paths: [relative],
    message: commitMessage({
      app: options.app,
      image,
      sourceRepo: env.GITHUB_REPOSITORY,
      sourceSha: env.GITHUB_SHA,
      runUrl:
        env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
          ? `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
          : undefined,
    }),
    // Named for what it is. A commit that says it came from a person who did
    // not write it is worse than one that says it came from a machine.
    authorName: env.PROMOTE_AUTHOR_NAME ?? "tarmac",
    authorEmail: env.PROMOTE_AUTHOR_EMAIL ?? "tarmac@users.noreply.github.com",
    branch: options.branch,
    remote: options.remote,
    exec: spawnExec,
  });

  console.log(
    `\npushed ${result.sha.slice(0, 12)} to ${options.remote}/${options.branch}` +
      (result.attempts > 1 ? ` (after ${result.attempts} attempts)` : ""),
  );
  return 0;
}

if (import.meta.main) {
  try {
    process.exit(await main(Bun.argv.slice(2), Bun.env));
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`${err.message}\n\n${USAGE}`);
      process.exit(2);
    }
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export { main };
