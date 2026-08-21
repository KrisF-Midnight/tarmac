/**
 * Image naming, kept pure and separate because it is quietly full of traps.
 *
 * GHCR rejects uppercase path segments, and GitHub repository names routinely
 * contain them — a build that works for `owner/greeter` fails for
 * `Owner/Greeter` at push time, which is the worst possible moment to find out.
 * Tagging by commit SHA rather than a floating tag keeps every build
 * addressable; the digest is what ends up in git, but a human still needs a
 * name to type.
 */

export type ImageName = {
  /** Fully qualified reference, ready for `docker build -t`. */
  ref: string;
  /** Whether this build is publishable, i.e. it is addressed at a registry. */
  publishable: boolean;
};

export type ImageNameInput = {
  /** Falls back to this when there is no GitHub context, i.e. on a laptop. */
  appName: string;
  env: Record<string, string | undefined>;
};

const REGISTRY = "ghcr.io";

export function imageNameFor({ appName, env }: ImageNameInput): ImageName {
  const repository = env.GITHUB_REPOSITORY;
  const sha = env.GITHUB_SHA;

  // No GitHub context means a laptop. Build something runnable and locally
  // addressable, but never something that looks like it belongs in a registry.
  if (!repository || !sha) {
    return { ref: `${appName}:local`, publishable: false };
  }

  return {
    ref: `${REGISTRY}/${repository.toLowerCase()}:${sha}`,
    publishable: true,
  };
}

/**
 * `docker inspect` reports repo digests as `repo@sha256:...`. The digest alone
 * is what belongs in a manifest, so strip the name — and be explicit when the
 * expected shape is not there rather than committing a malformed reference.
 */
export function digestFrom(repoDigest: string): string {
  const at = repoDigest.trim().lastIndexOf("@sha256:");
  if (at === -1) throw new Error(`not a repo digest: ${repoDigest}`);
  return repoDigest.trim().slice(at + 1);
}

/** `ghcr.io/owner/app:sha` without the tag. The part a digest is meaningful against. */
export function repositoryOf(ref: string): string {
  return ref.split(":")[0]!;
}

/**
 * The digest for one repository, picked out of everything `docker inspect` said.
 *
 * `{{index .RepoDigests 0}}` was here first, and it is wrong in a way that only
 * appears on a machine that knows the same image under more than one name.
 * RepoDigests holds one entry per repository the image ID has been pushed to or
 * pulled from, in no documented order, and a digest only means anything against
 * the repository it was published to. Taking entry zero and pairing it with
 * *our* repository name produces a reference that either does not resolve or,
 * worse, resolves to bytes nobody here published — and that reference is what
 * gets committed into gitops/ and run.
 *
 * A CI runner is a fresh machine and rarely hits this. The laptop that has
 * pulled a colleague's build of the same app is not, and neither is a runner
 * with a warm image cache, which is the direction the estate moves in.
 */
export function digestForRepository(repoDigests: string[], repository: string): string {
  const match = repoDigests.find((d) => d.trim().startsWith(`${repository}@`));
  if (!match) {
    throw new Error(
      `no digest for ${repository} in: ${repoDigests.map((d) => d.trim()).join(", ") || "<none>"}`,
    );
  }
  return digestFrom(match);
}

/**
 * One repo digest per line, as `{{range .RepoDigests}}{{println .}}{{end}}`
 * writes them. Blank lines dropped, because the template emits a trailing one
 * and an image with no digests emits nothing at all.
 */
export function repoDigestsIn(inspectOutput: string): string[] {
  return inspectOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
