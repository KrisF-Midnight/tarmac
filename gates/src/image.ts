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
