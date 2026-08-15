import { describe, expect, test } from "bun:test";
import { digestFrom, imageNameFor } from "../src/image";

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
