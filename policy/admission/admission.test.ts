/**
 * Tests for the admission policies, run without a cluster.
 *
 * These policies were the one rule set in the repository with no tests. The
 * only thing exercising them was the live refusal probe in
 * scripts/admission-up.sh, which needs a running API server, takes a minute to
 * get to, and proves exactly two facts: one policy rejects one bad pod each.
 * Everything else — which requests the policies are even asked about, whether
 * an expression holds on a request shape nobody tried by hand — was unchecked.
 *
 * `conftest verify` cannot help: these are CEL in YAML, not Rego. So the file
 * carries a CEL interpreter covering the subset the policies use, and runs the
 * real expressions, read out of the real YAML, against crafted request objects.
 *
 * What that is worth, and what it is not. It is not the API server: the type
 * checking, the request routing and the binding's namespace selector are all
 * somebody else's code and are not modelled here. It is the two halves that
 * actually decide whether a policy does anything — the match rules that say
 * which requests reach it, and the expressions that say yes or no once one
 * does. The interpreter throws on any syntax it does not implement rather than
 * skipping it, so a policy that grows a construct this file has never seen
 * fails here loudly instead of passing quietly.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// A CEL interpreter, in the subset these policies are written in.
// ---------------------------------------------------------------------------

/** Anything CEL itself would report as an evaluation error. */
class CelError extends Error {}

type Token = { kind: "id" | "str" | "num" | "punct"; text: string };

// Longest first, so `==` is never read as two tokens and `!=` never as `!`.
const PUNCT = ["==", "!=", "&&", "||", "(", ")", "[", "]", ",", ".", "?", ":", "!", "+"];

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "'" || ch === '"') {
      const end = src.indexOf(ch, i + 1);
      if (end === -1) throw new CelError(`unterminated string in: ${src}`);
      out.push({ kind: "str", text: src.slice(i + 1, end) });
      i = end + 1;
    } else if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j]!)) j++;
      out.push({ kind: "num", text: src.slice(i, j) });
      i = j;
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j]!)) j++;
      out.push({ kind: "id", text: src.slice(i, j) });
      i = j;
    } else {
      const punct = PUNCT.find((p) => src.startsWith(p, i));
      if (!punct) throw new CelError(`unsupported character ${JSON.stringify(ch)} in: ${src}`);
      out.push({ kind: "punct", text: punct });
      i += punct.length;
    }
  }
  return out;
}

type Node =
  | { t: "lit"; v: unknown }
  | { t: "id"; name: string }
  | { t: "list"; items: Node[] }
  | { t: "sel"; obj: Node; field: string }
  | { t: "has"; obj: Node; field: string }
  | { t: "macro"; kind: "filter" | "map"; target: Node; varName: string; body: Node }
  | { t: "call"; target: Node; name: string; args: Node[] }
  | { t: "not"; operand: Node }
  | { t: "bin"; op: string; l: Node; r: Node }
  | { t: "ternary"; cond: Node; then: Node; otherwise: Node };

function parse(src: string): Node {
  const tokens = tokenize(src);
  let pos = 0;

  // String literals are excluded on purpose: `'in' in m` must not read the
  // literal as the operator.
  const at = (text: string) => {
    const token = tokens[pos];
    return token !== undefined && token.text === text && token.kind !== "str";
  };
  const eat = (text: string) => (at(text) ? (pos++, true) : false);
  const want = (text: string) => {
    if (!eat(text)) throw new CelError(`expected ${text} at token ${pos} in: ${src}`);
  };

  function primary(): Node {
    const token = tokens[pos];
    if (!token) throw new CelError(`unexpected end of expression: ${src}`);
    if (token.kind === "str") return (pos++, { t: "lit", v: token.text });
    if (token.kind === "num") return (pos++, { t: "lit", v: Number(token.text) });
    if (eat("(")) {
      const inner = expr();
      want(")");
      return inner;
    }
    if (eat("[")) {
      const items: Node[] = [];
      if (!at("]")) do items.push(expr());
        while (eat(","));
      want("]");
      return { t: "list", items };
    }
    if (token.kind === "id") {
      pos++;
      if (token.text === "true") return { t: "lit", v: true };
      if (token.text === "false") return { t: "lit", v: false };
      if (token.text === "null") return { t: "lit", v: null };
      if (!at("(")) return { t: "id", name: token.text };
      // The only global these policies call. `has` is a macro, not a
      // function: its argument names a field to test for rather than a value
      // to pass, which is the whole reason it can be used on a field that is
      // not there.
      want("(");
      const arg = expr();
      want(")");
      if (token.text !== "has") throw new CelError(`unsupported function ${token.text}() in: ${src}`);
      if (arg.t !== "sel") throw new CelError(`has() takes a field selection in: ${src}`);
      return { t: "has", obj: arg.obj, field: arg.field };
    }
    throw new CelError(`unexpected token ${token.text} in: ${src}`);
  }

  function postfix(): Node {
    let node = primary();
    while (eat(".")) {
      const name = tokens[pos];
      if (!name || name.kind !== "id") throw new CelError(`expected a field name in: ${src}`);
      pos++;
      if (!eat("(")) {
        node = { t: "sel", obj: node, field: name.text };
      } else if (name.text === "filter" || name.text === "map") {
        const variable = tokens[pos];
        if (!variable || variable.kind !== "id")
          throw new CelError(`${name.text}() binds a variable name in: ${src}`);
        pos++;
        want(",");
        const body = expr();
        want(")");
        node = { t: "macro", kind: name.text, target: node, varName: variable.text, body };
      } else {
        const args: Node[] = [];
        if (!at(")")) do args.push(expr());
          while (eat(","));
        want(")");
        node = { t: "call", target: node, name: name.text, args };
      }
    }
    return node;
  }

  const unary = (): Node => (eat("!") ? { t: "not", operand: unary() } : postfix());

  function binary(ops: string[], next: () => Node): () => Node {
    return () => {
      let left = next();
      while (ops.some(at)) {
        const op = tokens[pos]!.text;
        pos++;
        left = { t: "bin", op, l: left, r: next() };
      }
      return left;
    };
  }

  const sum = binary(["+"], unary);
  const relation = binary(["==", "!=", "in"], sum);
  const conjunction = binary(["&&"], relation);
  const disjunction = binary(["||"], conjunction);

  function expr(): Node {
    const cond = disjunction();
    if (!eat("?")) return cond;
    const then = expr();
    want(":");
    return { t: "ternary", cond, then, otherwise: expr() };
  }

  const parsed = expr();
  if (pos !== tokens.length) throw new CelError(`trailing input at token ${pos} in: ${src}`);
  return parsed;
}

const asMap = (v: unknown): Record<string, unknown> => {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    throw new CelError(`expected a map, got ${JSON.stringify(v)}`);
  return v as Record<string, unknown>;
};
const asList = (v: unknown): unknown[] => {
  if (!Array.isArray(v)) throw new CelError(`expected a list, got ${JSON.stringify(v)}`);
  return v;
};
const asString = (v: unknown): string => {
  if (typeof v !== "string") throw new CelError(`expected a string, got ${JSON.stringify(v)}`);
  return v;
};
const asBool = (v: unknown): boolean => {
  if (typeof v !== "boolean") throw new CelError(`expected a bool, got ${JSON.stringify(v)}`);
  return v;
};

function add(l: unknown, r: unknown): unknown {
  if (typeof l === "number" && typeof r === "number") return l + r;
  if (typeof l === "string" && typeof r === "string") return l + r;
  if (Array.isArray(l) && Array.isArray(r)) return [...l, ...r];
  throw new CelError("+ needs two numbers, two strings or two lists");
}

const equal = (l: unknown, r: unknown) =>
  typeof l === "object" && l !== null ? JSON.stringify(l) === JSON.stringify(r) : l === r;

function evaluate(node: Node, scope: Record<string, unknown>): unknown {
  switch (node.t) {
    case "lit":
      return node.v;
    case "list":
      return node.items.map((item) => evaluate(item, scope));
    case "id":
      if (!(node.name in scope)) throw new CelError(`undeclared reference to '${node.name}'`);
      return scope[node.name];
    // Selecting a field that is not there is an error in CEL, not an absent
    // value — which is exactly the failure mode these policies guard against
    // with `has()`, so the interpreter has to reproduce it rather than
    // quietly hand back undefined.
    case "sel": {
      const target = asMap(evaluate(node.obj, scope));
      if (!(node.field in target)) throw new CelError(`no such key: ${node.field}`);
      return target[node.field];
    }
    case "has":
      return node.field in asMap(evaluate(node.obj, scope));
    case "not":
      return !asBool(evaluate(node.operand, scope));
    case "ternary":
      return asBool(evaluate(node.cond, scope))
        ? evaluate(node.then, scope)
        : evaluate(node.otherwise, scope);
    case "macro": {
      const items = asList(evaluate(node.target, scope));
      const step = (item: unknown) => evaluate(node.body, { ...scope, [node.varName]: item });
      return node.kind === "filter"
        ? items.filter((item) => asBool(step(item)))
        : items.map(step);
    }
    case "call": {
      const target = evaluate(node.target, scope);
      const args = node.args.map((arg) => evaluate(arg, scope));
      switch (node.name) {
        case "size":
          return Array.isArray(target) ? target.length : asString(target).length;
        case "startsWith":
          return asString(target).startsWith(asString(args[0]));
        case "contains":
          return Array.isArray(target)
            ? target.some((item) => equal(item, args[0]))
            : asString(target).includes(asString(args[0]));
        case "join":
          return asList(target).map(asString).join(asString(args[0]));
        default:
          throw new CelError(`unsupported method ${node.name}()`);
      }
    }
    case "bin": {
      if (node.op === "&&") return asBool(evaluate(node.l, scope)) && asBool(evaluate(node.r, scope));
      if (node.op === "||") return asBool(evaluate(node.l, scope)) || asBool(evaluate(node.r, scope));
      const [l, r] = [evaluate(node.l, scope), evaluate(node.r, scope)];
      switch (node.op) {
        case "==":
          return equal(l, r);
        case "!=":
          return !equal(l, r);
        case "+":
          return add(l, r);
        case "in":
          return Array.isArray(r) ? r.some((item) => equal(item, l)) : asString(l) in asMap(r);
        default:
          throw new CelError(`unsupported operator ${node.op}`);
      }
    }
  }
}

const cel = (src: string, scope: Record<string, unknown>) => evaluate(parse(src), scope);

// ---------------------------------------------------------------------------
// The policies, read from the files the cluster is given.
// ---------------------------------------------------------------------------

type Rule = { apiGroups: string[]; apiVersions: string[]; operations: string[]; resources: string[] };
type Doc = { kind: string; metadata: { name: string }; spec: Record<string, any> };

const documents: { file: string; doc: Doc }[] = readdirSync(import.meta.dir)
  .filter((file) => file.endsWith(".yaml"))
  .flatMap((file) => {
    const parsed = Bun.YAML.parse(readFileSync(join(import.meta.dir, file), "utf8"));
    return (parsed as Doc[]).map((doc) => ({ file, doc }));
  });

const of = (kind: string) => documents.filter((d) => d.doc.kind === kind).map((d) => d.doc);
const POLICIES = of("ValidatingAdmissionPolicy");
const BINDINGS = of("ValidatingAdmissionPolicyBinding");
const policy = (name: string) => POLICIES.find((p) => p.metadata.name === name)!;
const binding = (name: string) => BINDINGS.find((b) => b.metadata.name === name)!;

const PINNED_IMAGES = "tarmac-require-pinned-images";
const RESOURCE_LIMITS = "tarmac-require-resource-limits";

/**
 * One admission decision. Variables are computed eagerly and in declaration
 * order; CEL evaluates them lazily, which is a difference that cannot show
 * here because every variable in these policies feeds the validation.
 */
function admit(target: Doc, object: unknown): { allowed: boolean; message: string } {
  const variables: Record<string, unknown> = {};
  const scope = { object, variables };
  for (const variable of target.spec.variables ?? []) {
    variables[variable.name] = cel(variable.expression, scope);
  }
  for (const validation of target.spec.validations) {
    if (asBool(cel(validation.expression, scope))) continue;
    return { allowed: false, message: String(cel(validation.messageExpression, scope)) };
  }
  return { allowed: true, message: "" };
}

/** Every (group, version, resource, operation) a policy's match rules cover. */
const covered = (target: Doc): Set<string> =>
  new Set(
    (target.spec.matchConstraints.resourceRules as Rule[]).flatMap((rule) =>
      rule.apiGroups.flatMap((group) =>
        rule.apiVersions.flatMap((version) =>
          rule.resources.flatMap((resource) =>
            rule.operations.map((op) => `${group}/${version}/${resource}:${op}`),
          ),
        ),
      ),
    ),
  );

// ---------------------------------------------------------------------------
// Request objects, in the shapes the API server hands to a policy.
// ---------------------------------------------------------------------------

const PINNED = `ghcr.io/tarmac/greeter@sha256:${"a".repeat(64)}`;
const BUDGET = {
  requests: { cpu: "10m", memory: "16Mi" },
  limits: { cpu: "50m", memory: "64Mi" },
};

const container = (over: Record<string, unknown> = {}) => ({
  name: "app",
  image: PINNED,
  resources: BUDGET,
  ...over,
});

const pod = (spec: Record<string, unknown> = {}) => ({
  apiVersion: "v1",
  kind: "Pod",
  metadata: { name: "greeter-7d9", namespace: "greeter" },
  spec: { containers: [container()], ...spec },
});

const deployment = (spec: Record<string, unknown> = {}) => ({
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: { name: "greeter", namespace: "greeter" },
  spec: { replicas: 2, template: { spec: { containers: [container()], ...spec } } },
});

/**
 * What `kubectl debug` sends. Since 1.22 the ephemeralcontainers subresource
 * takes a whole Pod and not an EphemeralContainers object, so `spec.containers`
 * arrives populated with images that were admitted when the pod was created —
 * the reason a policy can match this request and still decide nothing.
 * `resources` is absent because the API server refuses an ephemeral container
 * that sets it.
 */
const debugRequest = (image: string) =>
  pod({
    containers: [container()],
    ephemeralContainers: [{ name: "debugger", image }],
  });

describe("the admission policy set", () => {
  test("is two policies, each with a binding that names it", () => {
    expect(POLICIES.map((p) => p.metadata.name).sort()).toEqual([PINNED_IMAGES, RESOURCE_LIMITS]);
    for (const b of BINDINGS) expect(b.spec.policyName).toBe(b.metadata.name);
    expect(BINDINGS.map((b) => b.spec.policyName).sort()).toEqual([PINNED_IMAGES, RESOURCE_LIMITS]);
  });

  // Both are the difference between a rule and a suggestion. Deny rather than
  // Warn or Audit, and a failure to evaluate rejects rather than admits.
  test("every policy denies, and fails closed", () => {
    for (const p of POLICIES) expect(p.spec.failurePolicy).toBe("Fail");
    for (const b of BINDINGS) expect(b.spec.validationActions).toEqual(["Deny"]);
  });

  // The bindings' scope is an exclusion list, so the two drifting apart would
  // mean one policy silently stops applying somewhere the other still does.
  test("both bindings exclude the same namespaces and nothing else", () => {
    const excluded = BINDINGS.map((b) => {
      const [expression, ...rest] = b.spec.matchResources.namespaceSelector.matchExpressions;
      expect(rest).toEqual([]);
      expect(expression.key).toBe("kubernetes.io/metadata.name");
      expect(expression.operator).toBe("NotIn");
      return expression.values;
    });
    expect(excluded[0]).toEqual(excluded[1]);
    expect(excluded[0]).toContain("kube-system");
  });

  // Not for tidiness: `pods/*` would match exec, log, status and binding, whose
  // request objects are not pods at all. With failurePolicy: Fail every one of
  // those would be rejected by a CEL error rather than by a rule.
  test("no match rule uses a wildcard", () => {
    for (const p of POLICIES) {
      const rules = p.spec.matchConstraints.resourceRules as Rule[];
      for (const rule of rules) {
        expect([...rule.apiGroups, ...rule.apiVersions, ...rule.operations]).not.toContain("*");
        for (const resource of rule.resources) expect(resource).not.toContain("*");
      }
    }
  });

  test("every expression in every policy parses", () => {
    for (const p of POLICIES) {
      for (const variable of p.spec.variables ?? []) expect(() => parse(variable.expression)).not.toThrow();
      for (const validation of p.spec.validations) {
        expect(() => parse(validation.expression)).not.toThrow();
        expect(() => parse(validation.messageExpression)).not.toThrow();
      }
    }
  });
});

/**
 * Which requests reach the policies at all. This is the half the live probe in
 * scripts/admission-up.sh cannot check: the probe sends a pod, so it proves
 * only that pods are covered, and a policy that has stopped matching anything
 * else looks identical from there.
 */
describe("match constraints", () => {
  // Pods are where enforcement happens; the controller kinds are matched so
  // the refusal reaches whoever ran `kubectl apply` rather than a ReplicaSet
  // event nobody is watching.
  const WORKLOAD_PATHS = [
    ["", "v1", "pods"],
    ["apps", "v1", "deployments"],
    ["apps", "v1", "statefulsets"],
    ["apps", "v1", "daemonsets"],
    ["apps", "v1", "replicasets"],
    ["batch", "v1", "jobs"],
  ] as const;

  test.each(POLICIES.map((p) => [p.metadata.name, p] as const))(
    "%s covers every way a workload is created or changed",
    (_name, p) => {
      const rules = covered(p);
      for (const [group, version, resource] of WORKLOAD_PATHS) {
        for (const op of ["CREATE", "UPDATE"]) {
          expect(rules).toContain(`${group}/${version}/${resource}:${op}`);
        }
      }
    },
  );

  /**
   * `kubectl debug` creates no pod, so `resources: ["pods"]` never sees it: it
   * PATCHes an existing pod through a subresource, and a rule naming the parent
   * resource does not match a subresource request. Before this rule existed,
   * `kubectl debug --image=busybox:latest` put an unpinned image into a running
   * pod's namespaces with nothing in this directory having an opinion.
   */
  test("the pinned-images policy covers the ephemeral-containers subresource", () => {
    expect(covered(policy(PINNED_IMAGES))).toContain("/v1/pods/ephemeralcontainers:UPDATE");
  });

  /**
   * And the resource-limits policy deliberately does not. Kubernetes forbids
   * `resources` on an ephemeral container — the API server rejects any request
   * that sets it — so a rule demanding requests and limits there is one nobody
   * could ever satisfy: it would not police `kubectl debug`, it would ban it.
   * If this assertion is ever inverted, that is the reasoning to overturn.
   */
  test("the resource-limits policy deliberately does not", () => {
    expect(covered(policy(RESOURCE_LIMITS))).not.toContain("/v1/pods/ephemeralcontainers:UPDATE");
  });

  // A subresource has no create verb, and asking for one is a rule that reads
  // like it covers more than it does.
  test("the subresource is matched on UPDATE only", () => {
    expect(covered(policy(PINNED_IMAGES))).not.toContain("/v1/pods/ephemeralcontainers:CREATE");
  });
});

describe("require-pinned-images", () => {
  const decide = (object: unknown) => admit(policy(PINNED_IMAGES), object);

  test("admits a pod whose images come from ghcr.io by digest", () => {
    expect(decide(pod()).allowed).toBe(true);
  });

  test("rejects a tag, and says which container carries it", () => {
    const outcome = decide(pod({ containers: [container({ image: "ghcr.io/tarmac/greeter:v1" })] }));

    expect(outcome.allowed).toBe(false);
    expect(outcome.message).toContain("app -> ghcr.io/tarmac/greeter:v1");
    expect(outcome.message).toContain("pinned by digest");
  });

  // A digest is only half of it. Provenance is the other half, and an image
  // pinned by digest from anywhere at all would otherwise pass.
  test("rejects a digest-pinned image from another registry", () => {
    const image = `docker.io/library/busybox@sha256:${"b".repeat(64)}`;

    expect(decide(pod({ containers: [container({ image })] })).allowed).toBe(false);
  });

  test("reads init containers, which run first and are therefore the easier place to hide one", () => {
    const object = pod({ initContainers: [container({ name: "migrate", image: "alpine:3" })] });
    const outcome = decide(object);

    expect(outcome.allowed).toBe(false);
    expect(outcome.message).toContain("migrate");
  });

  test("reaches the pod template of a controller kind", () => {
    const outcome = decide(deployment({ containers: [container({ image: "nginx:latest" })] }));

    expect(outcome.allowed).toBe(false);
    expect(outcome.message).toContain("nginx:latest");
  });

  /**
   * The defect matching the subresource would have papered over. A debug
   * request carries the pod's own containers, which are pinned and were
   * admitted already, so a policy reading only `containers` returns "no
   * offending images" and the unpinned debug container starts anyway. Matching
   * the request without reading the field it changes is worse than not matching
   * it: `kubectl get validatingadmissionpolicy` would show coverage.
   */
  test("rejects an unpinned ephemeral container even though the pod itself is compliant", () => {
    const object = debugRequest("docker.io/library/busybox:latest");

    expect(admit(policy(PINNED_IMAGES), pod()).allowed).toBe(true);
    expect(decide(object).allowed).toBe(false);
    expect(decide(object).message).toContain("debugger -> docker.io/library/busybox:latest");
  });

  test("admits a debug container that is pinned like everything else", () => {
    expect(decide(debugRequest(PINNED)).allowed).toBe(true);
  });

  // failurePolicy: Fail turns an evaluation error into a rejection, so an
  // expression that reaches for a field a real request does not carry becomes
  // an outage rather than a policy decision. Every shape the match rules admit
  // has to evaluate cleanly.
  test.each([
    ["a pod with neither init nor ephemeral containers", pod()],
    ["a pod with init containers", pod({ initContainers: [container({ name: "migrate" })] })],
    ["a deployment template", deployment()],
    ["an ephemeral-containers request", debugRequest(PINNED)],
  ])("evaluates without error against %s", (_name, object) => {
    expect(() => decide(object)).not.toThrow();
  });
});

describe("require-resource-limits", () => {
  const decide = (object: unknown) => admit(policy(RESOURCE_LIMITS), object);
  const resources = (over: unknown) => pod({ containers: [container({ resources: over })] });

  test("admits a container that declares cpu and memory on both sides", () => {
    expect(decide(pod()).allowed).toBe(true);
  });

  // The container with no resources block at all is the case that reads as an
  // evaluation error rather than a violation if the `has()` guard is dropped.
  test("rejects a container that declares no resources at all", () => {
    const object = pod({ containers: [{ name: "app", image: PINNED }] });
    const outcome = decide(object);

    expect(outcome.allowed).toBe(false);
    expect(outcome.message).toContain("app");
  });

  test.each([
    ["no requests", { limits: BUDGET.limits }],
    ["no limits", { requests: BUDGET.requests }],
    ["requests without cpu", { requests: { memory: "16Mi" }, limits: BUDGET.limits }],
    ["requests without memory", { requests: { cpu: "10m" }, limits: BUDGET.limits }],
    ["limits without cpu", { requests: BUDGET.requests, limits: { memory: "64Mi" } }],
    ["limits without memory", { requests: BUDGET.requests, limits: { cpu: "50m" } }],
    ["an empty block", {}],
  ])("rejects %s", (_name, over) => {
    expect(decide(resources(over)).allowed).toBe(false);
  });

  test("reads init containers and controller templates too", () => {
    const bare = { name: "migrate", image: PINNED };

    expect(decide(pod({ initContainers: [bare] })).allowed).toBe(false);
    expect(decide(deployment({ containers: [bare] })).allowed).toBe(false);
  });
});

/**
 * The interpreter above is test code judging production rules, so the ways it
 * could be wrong in the policies' favour matter as much as the policies do.
 * Both failure modes here are silent ones: an error swallowed into a pass, and
 * syntax it has never seen evaluated as something else.
 */
describe("the CEL subset", () => {
  test("a missing field is an error, as it is in CEL, not an absent value", () => {
    expect(() => cel("object.spec.nope", { object: { spec: {} } })).toThrow(/no such key/);
  });

  test("has() on the same field is not", () => {
    expect(cel("has(object.spec.nope)", { object: { spec: {} } })).toBe(false);
  });

  test("an unimplemented function fails rather than being skipped", () => {
    expect(() => cel("object.image.matches('^ghcr')", { object: { image: "x" } })).toThrow(
      /unsupported method/,
    );
    expect(() => cel("string(object.n)", { object: { n: 1 } })).toThrow(/unsupported function/);
  });

  test("an undeclared name fails rather than reading as null", () => {
    expect(() => cel("params.allowed", {})).toThrow(/undeclared reference/);
  });
});
