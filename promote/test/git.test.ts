import { describe, expect, test } from "bun:test";
import type { Exec, ExecResult } from "../../gates/src/types";
import { type CommitInput, commitAndPush, commitMessage } from "../src/git";

/**
 * Replies are matched on a substring of the command line, and each key may be
 * given a queue of results so a push can fail once and then succeed — which is
 * the case the retry exists for and the only way to reach it without a remote.
 */
function fakeGit(replies: Record<string, Partial<ExecResult>[]> = {}) {
  const calls: string[][] = [];
  const exec: Exec = async (cmd) => {
    calls.push(cmd);
    const line = cmd.join(" ");
    const key = Object.keys(replies).find((k) => line.includes(k));
    const queue = key ? replies[key]! : undefined;
    const reply = queue && queue.length > 1 ? queue.shift() : queue?.[0];
    return { code: 0, stdout: "", stderr: "", ...reply };
  };
  return { exec, calls };
}

function input(exec: Exec, over: Partial<CommitInput> = {}): CommitInput {
  return {
    repoDir: "/repos/tarmac",
    paths: ["gitops/greeter/deployment.yaml"],
    message: "deploy(greeter): sha256:aaa",
    authorName: "tarmac",
    authorEmail: "tarmac@users.noreply.github.com",
    branch: "main",
    remote: "origin",
    exec,
    ...over,
  };
}

/** `diff --cached --quiet` exits non-zero when something is staged. */
const STAGED = { diff: [{ code: 1 }] };

function gitArgs(calls: string[][], verb: string): string[] | undefined {
  return calls.find((c) => c.includes(verb));
}

describe("commitAndPush", () => {
  test("stages only the paths it was given", async () => {
    const { exec, calls } = fakeGit(STAGED);

    await commitAndPush(input(exec));

    expect(gitArgs(calls, "add")).toContain("gitops/greeter/deployment.yaml");
  });

  // Identity per invocation, so the commit's author is visible where the commit
  // is made rather than in a setup step somewhere else.
  test("commits under an explicit identity rather than the machine's", async () => {
    const { exec, calls } = fakeGit(STAGED);

    await commitAndPush(input(exec));

    const commit = gitArgs(calls, "commit")!;
    expect(commit).toContain("user.name=tarmac");
    expect(commit).toContain("user.email=tarmac@users.noreply.github.com");
  });

  test("pushes to an explicit ref, never to whatever the default is", async () => {
    const { exec, calls } = fakeGit(STAGED);

    await commitAndPush(input(exec));

    expect(gitArgs(calls, "push")).toEqual(["git", "push", "origin", "HEAD:refs/heads/main"]);
  });

  // An empty commit would sync, appear in the deployment history, and change
  // nothing that is running.
  test("refuses to commit when nothing is staged", async () => {
    const { exec } = fakeGit({ diff: [{ code: 0 }] });

    expect(commitAndPush(input(exec))).rejects.toThrow(/nothing staged/);
  });

  test("a push that loses a race rebases and tries again", async () => {
    const { exec, calls } = fakeGit({
      ...STAGED,
      push: [{ code: 1, stderr: "non-fast-forward" }, { code: 0 }],
      "rev-parse": [{ stdout: "abc123def456\n" }],
    });

    const result = await commitAndPush(input(exec));

    expect(result.attempts).toBe(2);
    expect(result.sha).toBe("abc123def456");
    expect(gitArgs(calls, "fetch")!.slice(-3)).toEqual(["fetch", "origin", "main"]);
    expect(gitArgs(calls, "rebase")).toEqual(["git", "rebase", "origin/main"]);
  });

  // Two runs promoting the same application disagree about what should be
  // running, and only the later pipeline knows which is right. Resolving that
  // here would be guessing.
  test("a conflicting rebase is aborted rather than resolved", async () => {
    const { exec, calls } = fakeGit({
      ...STAGED,
      push: [{ code: 1 }],
      rebase: [{ code: 1, stderr: "CONFLICT" }],
    });

    expect(commitAndPush(input(exec))).rejects.toThrow(/conflicted/);
    await Bun.sleep(0);

    expect(calls.some((c) => c.includes("--abort"))).toBe(true);
  });

  test("gives up after the configured number of attempts", async () => {
    const { exec, calls } = fakeGit({ ...STAGED, push: [{ code: 1 }] });

    expect(commitAndPush(input(exec, { attempts: 2 }))).rejects.toThrow(/after 2 attempts/);
    await Bun.sleep(0);

    expect(calls.filter((c) => c.includes("push"))).toHaveLength(2);
  });

  test("a failing git command reports what git said", async () => {
    const { exec } = fakeGit({ add: [{ code: 128, stderr: "pathspec did not match" }] });

    expect(commitAndPush(input(exec))).rejects.toThrow(/pathspec did not match/);
  });
});

describe("commitMessage", () => {
  const image = `ghcr.io/owner/greeter@sha256:${"a".repeat(64)}`;

  test("the subject names the app and the digest, short enough to read in a log", () => {
    const subject = commitMessage({ app: "greeter", image }).split("\n")[0]!;

    expect(subject.startsWith("deploy(greeter): sha256:")).toBe(true);
    expect(subject.length).toBeLessThan(52);
  });

  // The question anyone reading the gitops/ history has is "what caused
  // this", and the answer is in the application's repository.
  test("the body points back at the change and the run that made it", () => {
    const message = commitMessage({
      app: "greeter",
      image,
      sourceRepo: "owner/greeter",
      sourceSha: "abc123",
      runUrl: "https://github.com/owner/greeter/actions/runs/42",
    });

    expect(message).toContain("Source: owner/greeter@abc123");
    expect(message).toContain("Run: https://github.com/owner/greeter/actions/runs/42");
    expect(message).toContain(`Image: ${image}`);
  });

  test("omits the provenance lines rather than writing empty ones", () => {
    const message = commitMessage({ app: "greeter", image });

    expect(message).not.toContain("Source:");
    expect(message).not.toContain("Run:");
  });
});
