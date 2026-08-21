import { describe, expect, test } from "bun:test";
import {
  digestForRepository,
  digestFrom,
  imageNameFor,
  repoDigestsIn,
  repositoryOf,
} from "../src/image";

describe("imageNameFor", () => {
  test("builds a GHCR reference from the GitHub context", () => {
    const image = imageNameFor({
      appName: "greeter",
      env: { GITHUB_REPOSITORY: "owner/greeter", GITHUB_SHA: "abc123" },
    });

    expect(image.ref).toBe("ghcr.io/owner/greeter:abc123");
    expect(image.publishable).toBe(true);
  });

  // GHCR rejects uppercase path segments and GitHub repository names often have
  // them. Finding this out at push time, after a successful build, is the worst
  // place in the pipeline to discover it.
  test("lowercases the repository, because GHCR rejects uppercase paths", () => {
    const image = imageNameFor({
      appName: "greeter",
      env: { GITHUB_REPOSITORY: "KrisF-Midnight/Greeter", GITHUB_SHA: "abc123" },
    });

    expect(image.ref).toBe("ghcr.io/krisf-midnight/greeter:abc123");
  });

  test("falls back to a local tag with no GitHub context", () => {
    const image = imageNameFor({ appName: "greeter", env: {} });

    expect(image.ref).toBe("greeter:local");
    expect(image.publishable).toBe(false);
  });

  test("a half-populated environment is treated as local, not as a registry", () => {
    const image = imageNameFor({ appName: "greeter", env: { GITHUB_REPOSITORY: "owner/greeter" } });

    expect(image.publishable).toBe(false);
  });
});

describe("digestFrom", () => {
  const digest = `sha256:${"a".repeat(64)}`;

  test("strips the repository, keeping only the digest", () => {
    expect(digestFrom(`ghcr.io/owner/greeter@${digest}`)).toBe(digest);
  });

  test("tolerates the trailing newline docker inspect emits", () => {
    expect(digestFrom(`ghcr.io/owner/greeter@${digest}\n`)).toBe(digest);
  });

  test("throws rather than returning something unusable", () => {
    expect(() => digestFrom("ghcr.io/owner/greeter:v1")).toThrow(/not a repo digest/);
  });
});

describe("repositoryOf", () => {
  test("drops the tag, keeping what a digest is meaningful against", () => {
    expect(repositoryOf("ghcr.io/owner/greeter:abc123")).toBe("ghcr.io/owner/greeter");
  });

  test("leaves an untagged reference alone", () => {
    expect(repositoryOf("ghcr.io/owner/greeter")).toBe("ghcr.io/owner/greeter");
  });
});

describe("repoDigestsIn", () => {
  test("one per line, and the template's trailing blank line is not one of them", () => {
    const output = "ghcr.io/owner/greeter@sha256:a\nregistry.local/greeter@sha256:b\n";

    expect(repoDigestsIn(output)).toEqual([
      "ghcr.io/owner/greeter@sha256:a",
      "registry.local/greeter@sha256:b",
    ]);
  });

  // An image that has never been pushed anywhere emits nothing at all. That is
  // an empty list, not a list with one empty entry.
  test("an image with no repo digests yields nothing", () => {
    expect(repoDigestsIn("\n")).toEqual([]);
  });
});

/**
 * The hole this closes: RepoDigests holds one entry per repository the daemon
 * knows the image ID in, in no documented order, and the digest is only valid
 * against the repository it came from. Taking entry zero and pairing it with
 * our own repository name is how a reference to somebody else's bytes gets
 * committed into gitops/.
 */
describe("digestForRepository", () => {
  const ours = `sha256:${"a".repeat(64)}`;
  const theirs = `sha256:${"b".repeat(64)}`;

  test("picks the entry belonging to the repository being named", () => {
    const digests = [`registry.local/greeter@${theirs}`, `ghcr.io/owner/greeter@${ours}`];

    expect(digestForRepository(digests, "ghcr.io/owner/greeter")).toBe(ours);
  });

  test("order carries no meaning, so neither does position", () => {
    const digests = [`ghcr.io/owner/greeter@${ours}`, `registry.local/greeter@${theirs}`];

    expect(digestForRepository(digests, "ghcr.io/owner/greeter")).toBe(ours);
  });

  // A repository whose name is a prefix of ours must not match. `@` is the
  // separator, so it is part of what is compared.
  test("a repository that merely starts the same is not ours", () => {
    const digests = [`ghcr.io/owner/greeter-staging@${theirs}`];

    expect(() => digestForRepository(digests, "ghcr.io/owner/greeter")).toThrow(/no digest for/);
  });

  test("no entry for our repository throws rather than substituting one", () => {
    expect(() => digestForRepository([`registry.local/greeter@${theirs}`], "ghcr.io/owner/greeter"))
      .toThrow(/no digest for ghcr.io\/owner\/greeter/);
  });

  test("nothing at all throws too, and says so", () => {
    expect(() => digestForRepository([], "ghcr.io/owner/greeter")).toThrow(/<none>/);
  });
});
