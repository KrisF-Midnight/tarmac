import { describe, expect, test } from "bun:test";
import { renderDiff, setContainerImage } from "../src/manifest";

const DIGEST = `ghcr.io/owner/greeter@sha256:${"a".repeat(64)}`;
const OTHER = `ghcr.io/owner/greeter@sha256:${"b".repeat(64)}`;

/** The shape the real manifest has, cut down to what the editor looks at. */
function deployment(containers: string): string {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: greeter
spec:
  template:
    spec:
${containers}
      volumes:
        - name: tmp
          emptyDir: {}
`;
}

const single = deployment(`      containers:
        - name: greeter
          image: greeter:local
          imagePullPolicy: IfNotPresent
`);

describe("setContainerImage", () => {
  test("replaces the named container's image", () => {
    const edit = setContainerImage(single, "greeter", DIGEST);

    expect(edit.changed).toBe(true);
    expect(edit.from).toBe("greeter:local");
    expect(edit.content).toContain(`image: ${DIGEST}`);
  });

  test("changes one line and leaves the rest of the file byte-identical", () => {
    const edit = setContainerImage(single, "greeter", DIGEST);

    const before = single.split("\n");
    const after = edit.content.split("\n");
    const differing = before.map((l, i) => (l === after[i] ? null : i)).filter((i) => i !== null);

    expect(differing).toEqual([edit.line - 1]);
  });

  // The reason this is not a substitution on the first `image:` line.
  test("an initContainer earlier in the file is not the one that gets promoted", () => {
    const withInit = deployment(`      initContainers:
        - name: wait-for-aws
          image: busybox:1.36
      containers:
        - name: greeter
          image: greeter:local
`);

    const edit = setContainerImage(withInit, "greeter", DIGEST);

    expect(edit.content).toContain("image: busybox:1.36");
    expect(edit.from).toBe("greeter:local");
  });

  test("a sidecar is not the one that gets promoted either", () => {
    const withSidecar = deployment(`      containers:
        - name: metrics
          image: metrics:1.0
        - name: greeter
          image: greeter:local
`);

    const edit = setContainerImage(withSidecar, "greeter", DIGEST);

    expect(edit.content).toContain("image: metrics:1.0");
    expect(edit.content).toContain(`image: ${DIGEST}`);
  });

  // `env:` and `volumeMounts:` are lists inside the container, and their dashes
  // are deeper than the container's. Mistaking one for a container boundary
  // would put the edit in the wrong item.
  test("nested lists inside a container do not shift the item boundaries", () => {
    const nested = deployment(`      containers:
        - name: greeter
          env:
            - name: CONFIG_BUCKET
              value: greeter-local-config
          image: greeter:local
        - name: metrics
          image: metrics:1.0
`);

    const edit = setContainerImage(nested, "greeter", DIGEST);

    expect(edit.from).toBe("greeter:local");
    expect(edit.content).toContain("image: metrics:1.0");
  });

  test("an image on the item's dash line is found too", () => {
    const dashFirst = deployment(`      containers:
        - image: greeter:local
          name: greeter
`);

    const edit = setContainerImage(dashFirst, "greeter", DIGEST);

    expect(edit.content).toContain(`- image: ${DIGEST}`);
    expect(edit.content).toContain("name: greeter");
  });

  test("a comment on the image line is carried across, not deleted", () => {
    const commented = deployment(`      containers:
        - name: greeter
          image: greeter:local # replaced by CI
`);

    const edit = setContainerImage(commented, "greeter", DIGEST);

    expect(edit.content).toContain(`image: ${DIGEST} # replaced by CI`);
  });

  // Re-running a pipeline on the same commit must not produce a commit.
  test("the same digest is a no-op, not an identical rewrite", () => {
    const already = single.replace("greeter:local", DIGEST);

    const edit = setContainerImage(already, "greeter", DIGEST);

    expect(edit.changed).toBe(false);
    expect(edit.content).toBe(already);
  });

  test("a tag is refused — promotion pins bytes or it does nothing", () => {
    expect(() => setContainerImage(single, "greeter", "ghcr.io/owner/greeter:v1")).toThrow(
      /digest-pinned/,
    );
  });

  test("an unknown container names the ones that exist", () => {
    expect(() => setContainerImage(single, "notifier", DIGEST)).toThrow(
      /no container named "notifier".*greeter/s,
    );
  });

  test("a manifest that is not a Deployment is refused", () => {
    const service = "apiVersion: v1\nkind: Service\nmetadata:\n  name: greeter\n";

    expect(() => setContainerImage(service, "greeter", DIGEST)).toThrow(/expected a Deployment/);
  });

  test("a container with no image field is an error, not a silent insert", () => {
    const imageless = deployment(`      containers:
        - name: greeter
          imagePullPolicy: IfNotPresent
`);

    expect(() => setContainerImage(imageless, "greeter", DIGEST)).toThrow(/no image field/);
  });

  test("malformed YAML fails before anything is edited", () => {
    expect(() => setContainerImage("kind: Deployment\n  spec: [", "greeter", DIGEST)).toThrow(
      /not valid YAML/,
    );
  });

  test("the result parses back to the value that was asked for", () => {
    const edit = setContainerImage(single, "greeter", OTHER);
    const parsed = Bun.YAML.parse(edit.content) as {
      spec: { template: { spec: { containers: { name: string; image: string }[] } } };
    };

    expect(parsed.spec.template.spec.containers[0]!.image).toBe(OTHER);
  });
});

describe("renderDiff", () => {
  test("shows the file's own lines, not a reconstruction of them", () => {
    const edit = setContainerImage(single, "greeter", DIGEST);

    const diff = renderDiff("gitops/greeter/deployment.yaml", edit);

    expect(diff).toContain("--- a/gitops/greeter/deployment.yaml");
    expect(diff).toContain("-          image: greeter:local");
    expect(diff).toContain(`+          image: ${DIGEST}`);
  });

  test("an unchanged manifest says so rather than printing an empty diff", () => {
    const already = single.replace("greeter:local", DIGEST);

    const diff = renderDiff("gitops/greeter/deployment.yaml", setContainerImage(already, "greeter", DIGEST));

    expect(diff).toContain("already at");
  });
});
