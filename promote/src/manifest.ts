/**
 * Setting one image reference in a deployment manifest, without disturbing
 * anything else in the file.
 *
 * The obvious implementation is a substitution on the first `image:` line, and
 * it is wrong in a way that only shows up later: add an initContainer, or a
 * sidecar, and the first `image:` line is no longer the application's. The
 * result is a green pipeline that promoted the wrong container, which is worse
 * than a failure because nothing reports it.
 *
 * The obvious fix — parse the YAML, set the field, serialise it back — is also
 * wrong here. These manifests carry the reasoning for the values in them as
 * comments, a round trip drops every one of those, and the diff of a promotion
 * would be the whole file instead of the line that changed.
 *
 * So: locate structurally, edit textually, then verify structurally. The parse
 * says which container and which value; the edit replaces exactly that line;
 * the re-parse asserts the file now says what the edit intended. An edit that
 * lands somewhere unexpected fails here rather than in the cluster.
 */

export type ImageEdit = {
  /** The manifest after the edit — identical to the input when unchanged. */
  content: string;
  /** The reference that was there before. */
  from: string;
  /** The reference now in the file. */
  to: string;
  changed: boolean;
  /** 1-indexed line the image reference lives on, for the diff. */
  line: number;
  /** That line, before and after, so the diff shows the file's own text. */
  before: string;
  after: string;
};

type Container = { name?: unknown; image?: unknown };

/** Reads the manifest well enough to know what it is and what it says. */
function containersOf(yaml: string): Container[] {
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(yaml);
  } catch (err) {
    throw new Error(`manifest is not valid YAML: ${err instanceof Error ? err.message : err}`);
  }

  if (!parsed || typeof parsed !== "object") throw new Error("manifest is empty");

  const doc = parsed as Record<string, unknown>;
  if (doc.kind !== "Deployment") {
    throw new Error(`expected a Deployment, found ${JSON.stringify(doc.kind ?? null)}`);
  }

  const spec = doc.spec as Record<string, unknown> | undefined;
  const template = spec?.template as Record<string, unknown> | undefined;
  const podSpec = template?.spec as Record<string, unknown> | undefined;
  const containers = podSpec?.containers;

  if (!Array.isArray(containers)) {
    throw new Error("spec.template.spec.containers is missing or not a list");
  }
  return containers as Container[];
}

function locate(yaml: string, container: string): { image: string; index: number } {
  const containers = containersOf(yaml);
  const index = containers.findIndex((c) => c.name === container);

  if (index === -1) {
    const names = containers.map((c) => String(c.name ?? "<unnamed>")).join(", ");
    throw new Error(`no container named "${container}" — the manifest has: ${names}`);
  }

  const image = containers[index]!.image;
  if (typeof image !== "string" || image.length === 0) {
    throw new Error(`container "${container}" has no image field to replace`);
  }
  return { image, index };
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isSignificant(line: string): boolean {
  return line.trim().length > 0 && !line.trimStart().startsWith("#");
}

/**
 * Finds the line holding the image of the container at position `index`.
 *
 * The position comes from the parser, not from reading names out of the text —
 * the parser already knows which container is which, and asking the scanner to
 * work that out again would be a second implementation of YAML to keep in step
 * with the first. The scanner's only job is the part a parser cannot do:
 * say which *line* holds the value.
 *
 * It is anchored to the `containers:` key rather than to the first list in the
 * file, because a pod spec has several lists — `imagePullSecrets`,
 * `tolerations`, `volumes` — and any of them could come first. `initContainers:`
 * does not match, which is the distinction this whole function exists to make.
 * Inside the block, only dashes at the item indent are items; the deeper dashes
 * under `env:` and `volumeMounts:` belong to the item, not beside it.
 */
function imageLineOf(yaml: string, index: number): number {
  const lines = yaml.split("\n");

  const blocks = lines
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => /^containers:\s*(#.*)?$/.test(line.trimStart()));

  if (blocks.length === 0) throw new Error("no `containers:` block in the manifest");
  if (blocks.length > 1) {
    throw new Error(`ambiguous: ${blocks.length} \`containers:\` blocks in one manifest`);
  }

  const start = blocks[0]!.i;
  const blockIndent = indentOf(lines[start]!);

  let itemIndent = -1;
  let seen = -1;

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!isSignificant(line)) continue;

    const indent = indentOf(line);
    if (indent <= blockIndent) break; // dedented out of the containers block

    if (/^-\s/.test(line.trimStart())) {
      if (itemIndent === -1) itemIndent = indent;
      if (indent === itemIndent) seen++;
      if (seen > index) break;
      // `- image: ...` puts the item's first key on the dash line itself.
      if (seen === index && /^-\s+image:\s/.test(line.trimStart())) return i + 1;
      continue;
    }

    if (seen === index && indent === itemIndent + 2 && /^image:\s/.test(line.trimStart())) {
      return i + 1;
    }
  }

  throw new Error(`could not locate the image line for container ${index}`);
}

/**
 * Replaces the value and nothing else. Indentation, the `- ` of an item whose
 * first key is the image, and any trailing comment all survive: the comment is
 * somebody's note about the value, and while the value is ours to change, their
 * words are not ours to delete.
 */
function rewrite(line: string, image: string): string {
  const parts = /^(\s*(?:-\s+)?image:\s*)(.*)$/.exec(line);
  if (!parts) throw new Error(`not an image line: ${line}`);

  const comment = /\s+(#.*)$/.exec(parts[2]!);
  return `${parts[1]}${image}${comment ? ` ${comment[1]}` : ""}`;
}

export function setContainerImage(yaml: string, container: string, image: string): ImageEdit {
  if (!image.includes("@sha256:")) {
    // The whole point of the promotion is to pin bytes. A tag would deploy, and
    // would quietly reintroduce the moving reference the digest exists to
    // replace, so it is refused rather than written.
    throw new Error(`refusing to promote a reference that is not digest-pinned: ${image}`);
  }

  const { image: from, index } = locate(yaml, container);
  const line = imageLineOf(yaml, index);
  const lines = yaml.split("\n");
  const before = lines[line - 1]!;

  if (from === image) {
    return { content: yaml, from, to: image, changed: false, line, before, after: before };
  }

  const after = rewrite(before, image);
  lines[line - 1] = after;
  const content = lines.join("\n");

  // The edit was located by one mechanism and applied by another. This is where
  // the two are made to agree — and it is the check that would catch a scanner
  // that walked to the wrong line for a manifest shape nobody anticipated.
  const reread = locate(content, container).image;
  if (reread !== image) {
    throw new Error(`edit did not take: container "${container}" still reads ${reread}`);
  }

  return { content, from, to: image, changed: true, line, before, after };
}

/** The one changed line, in the shape a reviewer expects to see it. */
export function renderDiff(path: string, edit: ImageEdit): string {
  if (!edit.changed) return `${path}: already at ${edit.to}`;
  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${edit.line} +${edit.line} @@`,
    `-${edit.before}`,
    `+${edit.after}`,
  ].join("\n");
}
