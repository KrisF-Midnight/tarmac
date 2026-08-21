# Design Decisions

Fifty-eight decisions, why each was made, what was rejected, and what it costs.

A decision that stops being true gets a new entry marking the old one superseded — the wrong turn
stays in the record.

| # | Decision |
|---|---|
| [1](#1--kind-as-the-runtime-target) | kind as the runtime target |
| [2](#2--pull-based-gitops) | Pull-based GitOps — CI writes git, never the cluster |
| [3](#3--argo-cd-not-flux) | Argo CD, not Flux |
| [4](#4--gate-logic-in-testable-code) | Gate logic in testable code, not CI YAML |
| [5](#5--split-platform-and-app-repos) | Split platform and app repos |
| [6](#6--public-repos-no-credential-to-clone-or-pull) | Public repos, no credential to clone or pull |
| [7](#7--ghcr-not-a-local-registry) | GHCR, not a local registry |
| [8](#8--terraform-against-localstack-via-tflocal) | Terraform against LocalStack, via tflocal |
| [9](#9--gitops-lives-in-the-platform-repo) | `gitops/` lives in the platform repo |
| [10](#10--postsync-hook-for-deploy-verification) | PostSync hook for deploy verification |
| [11](#11--policy-in-ci-and-at-admission) | Policy in CI *and* at admission |
| [12](#12--no-language-model-in-the-merge-path) | No language model in the merge path |
| [13](#13--localstack-pinned-by-digest-to-a-persistence-wrapper) | LocalStack pinned by digest, to a persistence wrapper |
| [14](#14--no-merge-time-deployment-apply) | No merge-time deployment apply — CI tests the module, `make up` provisions |
| [15](#15--bun-as-the-apps-entire-toolchain-no-vite) | Bun as the app's entire toolchain, no Vite |
| [16](#16--the-application-declares-nothing) | The application declares nothing |
| [17](#17----frozen-lockfile-as-a-gate-not-a-setup-step) | `--frozen-lockfile` as a gate, not a setup step |
| [18](#18--third-party-actions-pinned-to-a-commit-sha) | Third-party actions pinned to a commit SHA |
| [19](#19--the-state-bucket-is-created-by-an-init-hook-inside-the-emulator) | The state bucket is created by an init hook inside the emulator |
| [20](#20--s3-native-state-locking-not-a-dynamodb-lock-table) | S3-native state locking, not a DynamoDB lock table |
| [21](#21--environment-differences-live-in-files-not-in-branches-in-the-terraform) | Environment differences live in files, not in branches in the Terraform |
| [22](#22--path-style-s3-addressing-is-a-variable-not-an-endpoint-override) | Path-style S3 addressing is a variable, not an endpoint override |
| [23](#23--the-application-resolves-its-own-object-store-endpoint) | The application resolves its own object-store endpoint |
| [24](#24--applications-reference-the-platforms-module-by-path-for-now) | Applications reference the platform's module by path, for now |
| [25](#25--the-emulator-is-reached-through-a-service-not-by-its-container-name) | The emulator is reached through a Service, not by its container name |
| [26](#26--ingress-nginx-knowing-it-is-retired) | ingress-nginx, knowing it is retired |
| [27](#27--the-appproject-is-where-a-commits-authority-is-bounded) | The AppProject is where a commit's authority is bounded |
| [28](#28--ordering-between-applications-is-retried-not-sequenced) | Ordering between applications is retried, not sequenced |
| [29](#29--make-deploy-local-is-a-named-exception-scoped-to-image-bytes) | `make deploy-local` is a named exception, scoped to image bytes |
| [30](#30--a-missing-configuration-object-fails-readiness-an-empty-one-does-not) | A missing configuration object fails readiness, an empty one does not |
| [31](#31--the-reusable-workflow-is-consumed-through-a-floating-major-tag) | The reusable workflow is consumed through a floating major tag |
| [32](#32--the-cross-repo-commit-is-made-by-a-github-app) | The cross-repo commit is made by a GitHub App |
| [33](#33--promotion-is-a-separate-command-from-the-gates) | Promotion is a separate command from the gates |
| [34](#34--the-registry-package-is-made-public-by-hand) | The registry package is made public by hand |
| [35](#35--make-deploy-local-is-retired-once-an-anonymous-pull-is-proven) | `make deploy-local` is retired once an anonymous pull is proven — supersedes 29 |
| [36](#36--the-credential-that-can-deploy-is-never-present-in-the-job-that-runs-application-code) | The credential that can deploy is never present in the job that runs application code |
| [37](#37--the-promoter-is-versioned-the-manifest-it-edits-is-not) | The promoter is versioned; the manifest it edits is not |
| [38](#38--an-image-is-built-once-per-commit-and-re-runs-reuse-it) | An image is built once per commit, and re-runs reuse it |
| [39](#39--the-only-non-gitops-path-is-a-break-glass-pair-that-stops-the-reconciler-not-one-that-deploys) | The only non-GitOps path is a break-glass pair that stops the reconciler, not one that deploys |
| [40](#40--validatingadmissionpolicy-at-admission-not-kyverno) | ValidatingAdmissionPolicy at admission, not Kyverno — supersedes half of 11 |
| [41](#41--the-rego-reads-source-files-not-plan-json) | The Rego reads source files, not plan JSON — supersedes half of 11 |
| [42](#42--the-admission-bindings-are-scoped-by-exclusion-never-by-an-opt-in-label) | The admission bindings are scoped by exclusion, never by an opt-in label |
| [43](#43--the-admission-policies-are-installed-by-make-up-not-reconciled-by-argo-cd) | The admission policies are installed by `make up`, not reconciled by Argo CD |
| [44](#44--two-findings-are-classified-warn-and-both-fire-on-this-repository) | Two findings are classified `warn`, and both fire on this repository |
| [45](#45--gitops-is-the-intended-path-into-the-cluster-not-the-only-one) | GitOps is the intended path into the cluster, not the only one — supersedes a claim in 39 |
| [46](#46--the-image-scan-reports-it-does-not-block) | The image scan reports, it does not block |
| [47](#47--terraform-is-checked-by-a-gate-not-by-a-ci-step-and-it-is-hermetic) | Terraform is checked by a gate, not by a CI step, and it is hermetic |
| [48](#48--one-admission-probe-per-policy-and-the-install-blocks-until-each-is-refused) | One admission probe per policy, and the install blocks until each is refused |
| [49](#49--the-config-bucket-is-found-by-convention-not-published-to-a-parameter-store) | The config bucket is found by convention, not published to a parameter store |
| [50](#50--the-base-image-pin-is-enforced-by-a-gate-that-reads-the-dockerfile) | The base image pin is enforced by a gate that reads the Dockerfile |
| [51](#51--the-manifests-config-bucket-name-is-checked-against-the-modules-convention) | The manifest's config bucket name is checked against the module's convention — closes a cost in 49 |
| [52](#52--the-naming-expression-is-asserted-from-the-terraform-side-as-well) | The naming expression is asserted from the Terraform side as well — completes 51 |
| [53](#53--the-bucket-name-rule-is-scoped-by-the-modules-signature-not-by-the-locals-name) | The bucket-name rule is scoped by the module's signature, not by the local's name — supersedes a cost in 52 |
| [54](#54--the-environment-enum-is-checked-from-the-terraform-side) | The environment enum is checked from the Terraform side — closes a cost in 52 |
| [55](#55--the-kubernetes-policy-set-is-enforced-by-the-platforms-own-pipeline) | The Kubernetes policy set is enforced by the platform's own pipeline |
| [56](#56--image-pinning-follows-kubectl-debug-resource-limits-deliberately-do-not) | Image pinning follows `kubectl debug`; resource limits deliberately do not |
| [57](#57--the-admission-policies-are-tested-by-evaluating-their-cel-without-a-cluster) | The admission policies are tested by evaluating their CEL, without a cluster |
| [58](#58--the-promoters-write-guard-names-the-event-not-just-the-runner) | The promoter's write guard names the event, not just the runner |

---

### 1 — kind as the runtime target

**Why.** The choice of runtime decides which guardrails are even expressible. Admission control,
GitOps reconciliation and drift correction only exist if there is a control plane to host them.

**Rejected.** Docker Compose — lighter, but the pipeline would end at "container started" and the
guardrails worth having disappear. k3d/minikube — near-equivalent, low-stakes swap.
Managed cluster — this has to run with no cloud account.

**Cost.** Largest single consumer of the 4–6GB a laptop can spare, which is why observability is
deferred rather than shipped.
No LoadBalancer, so ingress needs `extraPortMappings` set at cluster creation — `make up` must own
that. Nodes can't see the host Docker daemon's images.

### 2 — Pull-based GitOps

**Why.** Hosted runners have no inbound path to a laptop cluster behind NAT, so `kubectl apply` from
CI is not merely inadvisable, it's impossible. Better treated as a forcing function toward the
correct pattern than as an obstacle. CI's final act is a git commit; a reconciler inside the cluster
pulls it.

**Rejected.** Self-hosted runner — anyone cloning the repo can't reproduce it, and it means
defending push-based CD when the alternative is free. `act` — fragile, no PR surface, no CD answer.
Tunnel from runner to laptop — infrastructure theatre to enable a pattern we'd then argue against.

**Cost.** The pipeline visibly stops short of deploying; that is intentional, and is stated as such
rather than looking like an unfinished pipeline.
Reconciliation is poll-based and no webhook can reach a laptop. Post-deploy checks can't run in CI,
which forces decision 10.

### 3 — Argo CD, not Flux

**Why.** The road has to have a developer-facing surface, and the test is whether an app team would
want to use it. A GitOps console is what a developer touches to find out whether their change is live.

**Rejected.** **Flux is the better engineering choice** — 4 controllers to Argo's 7, ~half the
memory, no login step, and a notification-controller that posts deploy status onto the merge commit.
It ships no UI since the Weave GitOps console was archived. That gap leaves a developer with nowhere
to look, so Argo wins on product grounds while losing on engineering ones. Argo CD Image Updater —
rejected separately; CI committing the digest is more explicit than a controller mutating git behind
the developer's back.

**Cost.** ~500MB and seven pods. Friction reaching the UI the first time: port-forward, extract
`argocd-initial-admin-secret`, accept a self-signed cert. Default reconciliation is 3 minutes;
lowering `timeout.reconciliation` needs a rollout restart of the application-controller and
repo-server. **With automated sync on, Argo refuses `argocd app rollback`** — so the one-click UI
rollback we're implicitly paying for isn't available. `git revert` is the rollback path regardless.

### 4 — Gate logic in testable code

**Why.** Gate logic decides what merges, so it has to be testable like anything else that decides
something. Logic in `run:` blocks and `if:` expressions can't be unit tested, only exercised by
pushing a commit. Separately, a developer should be able to check whether their change passes
before opening a PR — which requires the gates to run on a laptop. Gate logic is TypeScript run by
Bun with a `bun test` suite; the workflow is a thin caller invoking the same entrypoint as `make ci`.

**Rejected.** Composite actions — idiomatic GitHub, untestable outside CI, forfeits the tests.
Shell script — solves parity, hostile to unit testing. **Dagger** — the strongest answer available;
the pipeline genuinely becomes code with a test suite. Rejected because adopting a whole pipeline
engine is a larger commitment than everything else here put together, and recorded as a deliberate
omission rather than an oversight.

**Cost.** More upfront work than YAML. Bun becomes a hard CI dependency. Genuinely GitHub-native
features still live in YAML, so the boundary needs discipline.

### 5 — Split platform and app repos

**Why.** A paved road is defined by an ownership boundary, and the topology is where that boundary
is actually enforced. `uses: <owner>/tarmac/.github/workflows/ci.yml@v1` is a versioned
contract owned by a different team; the app repo's CI is ~10 lines, which is the honest measure of
how little the app team has to know.

**Rejected.** Monorepo — simpler, but the reusable workflow collapses into a local include and the
boundary vanishes with it. Three repos day one — the textbook layout, but ceremony at this scale.

**Cost.** Cross-repo coordination during development. CI writing to the other repo needs a
credential (decision 9). **The reusable workflow runs in the caller's checkout context**, so it must
explicitly check out the platform repo at the same ref, or it silently runs against stale or absent
policies. Required-check names render as `caller-job / callee-job`, brittle against renames.

### 6 — Public repos, no credential to clone or pull

**Why.** Argo clones the platform repository directly and the cluster pulls the application image
from GHCR, and on public repositories both happen with no credential at all (decision 7) — one
fewer secret in the cluster and one fewer thing to rotate. Branch protection, required checks and
CODEOWNERS all apply, so the guardrails the road depends on are enforceable.

**Rejected.** Private repositories — the guardrails still work, but Argo then needs a clone
credential and the cluster needs a pull secret, which is two durable secrets to keep source that
carries none out of view. Access granted per person on top — buys nothing; anyone who can read can
already fork and comment, and write access is a downgrade rather than a control.

**Cost.** Everything is permanently visible, which is why secret scanning is a gate rather than a
nice-to-have. **CODEOWNERS has no enforcement teeth here** — with a single maintainer, required
reviews would block every pull request, so they stay off and CODEOWNERS states intent rather than
enforcing it. Said plainly in the omissions list rather than left to be found. Forked PRs get a
read-only token, so the verdict comment can't post on them; `pull_request_target` would fix it and
is a known footgun.

### 7 — GHCR, not a local registry

**Why.** `gitops/` holds a digest CI pushed. With a local `registry:2`, whoever runs `make up` next
does it against an empty registry, Argo syncs a manifest naming an image that doesn't exist, and the
stack dies at `ImagePullBackOff` — at the last step, after everything appeared to work. The digest
in git must resolve on any machine. Public repos make GHCR pulls credential-free.

**Rejected.** Local registry — fast and offline, but the committed digest is meaningless on any
machine but the one that built it. `kind load` + `imagePullPolicy: Never` as the primary path —
breaks the GitOps chain, since git would no longer fully describe what runs. Kept for the inner loop
only. Docker Hub — needs credentials, has pull limits.

**Cost.** `make up` now needs internet; the local stack isn't offline. Images are public and
permanent. One more external dependency, and a slow pull shows up as a stack that takes minutes to
come up.

### 8 — Terraform against LocalStack, via tflocal

*The persistence and image-choice parts of this entry are superseded by [13](#13--localstack-pinned-by-digest-to-a-persistence-wrapper); what CI does with Terraform is refined by [14](#14--no-merge-time-deployment-apply). The rest stands.*

**Why.** If the IaC only provisions Kubernetes objects, Argo is already doing that job and the stage
is decorative. **The app reads its greeting from S3**, so if Terraform hasn't run the service errors
and the smoke test fails — the IaC is load-bearing. `tflocal` generates the endpoint overrides,
keeping the Terraform portable to real AWS. Two environments, deliberately: CI runs LocalStack as a
job service and runs `terraform test` against it; the laptop's long-lived instance is applied by
`make up`. See [14](#14--no-merge-time-deployment-apply) for why CI tests rather than deploys.

**Rejected.** Hand-written `endpoints{}` + `skip_*` blocks — what we'd have done without research;
`tflocal` does it and keeps the code clean. Terraform managing only Kubernetes — redundant with
Argo. Crossplane — elegant, too novel to explain quickly, and it displaces Terraform rather than
using it. Terragrunt — indirection over a single stack. Plan-only in CI — leaves `apply` untested.

**Cost.** **CI's LocalStack and the laptop's are different instances** — CI proves the code works,
it doesn't provision what the cluster uses; see 14. **Community edition doesn't persist state**: restarting the container wipes the bucket and the
Terraform state, so `make up` must be idempotent. **Community edition doesn't enforce IAM** —
policies apply and do nothing, so no least-privilege guardrail is honestly demonstrable; named as an
omission rather than faked. State bucket is chicken-and-egg, so bootstrap does an out-of-band
`awslocal s3 mb`; backend blocks can't take variables, so endpoints go through `-backend-config`.

### 9 — `gitops/` lives in the platform repo

**Why.** *Reverses an earlier lean toward the app repo.* Two findings flipped it.
`actions/create-github-app-token` issues a short-lived, repo-scoped token, so the credential
objection largely dissolves. And co-locating manifests with app code triggers reconciliation on
every code commit, stops the history being a clean deployment audit trail, and makes repo-server
clone the whole app repo including test fixtures.

**Rejected.** `gitops/` in the app repo — no credential and app-team ownership, but the costs above.
Dedicated deployments repo — arguably most correct, same credential requirement, no extra benefit at
one service. Classic PAT — long-lived and coarsely scoped, strictly worse than an App token.

**Cost.** A GitHub App must be created, installed on both repos, and its key stored — the only real
credential in the design, and anyone standing this up elsewhere needs their own. The app repo's CI
can write into the platform repo, narrowly; App permissions must be scoped to contents on two repos
and nothing else.

### 10 — PostSync hook for deploy verification

**Why.** CI can't reach the cluster, so the smoke test can't be a CI step. A `Job` annotated
`argocd.argoproj.io/hook: PostSync` runs after a successful sync; a failure marks the sync Failed
and surfaces in Argo. Argo's own docs name this use case. `make smoke` supplements it on demand.

**Rejected.** Smoke test in CI — impossible. `make smoke` alone — verification would depend on a
human remembering. Readiness probes alone — they prove a pod is up, not that the service answers
correctly through ingress with its S3 dependency wired.

**Cost.** **The result never reaches the PR** — the evidence chain from commit to running service
breaks at the last link. **A known open bug (`argo-cd#17408`, reproduced through v2.14)** fires the
hook while previous-ReplicaSet pods are still terminating, so the test can hit the old version and
pass. A green test that proves nothing is worse than none — mitigated with a readiness-polling init
container. Combining `ttlSecondsAfterFinished` with a `hook-delete-policy` causes double-fires; pick
one, and always set `activeDeadlineSeconds`. Failure reports, it doesn't roll back.

### 11 — Policy in CI *and* at admission

**Why.** Policy only in CI is advisory — anything applied by another route is unconstrained. Policy
only at admission gives feedback after merge, where the developer isn't looking. Conftest/OPA on the
PR covers Terraform plan JSON *and* rendered manifests; Kyverno enforces at admission. Both sets
carry allow **and** deny tests — a policy with no failing test hasn't been shown to constrain anything.

**Rejected.** Rego everywhere — one mental model, but Rego is materially harder to read for
Kubernetes admission, and developer experience is the product here. Kyverno everywhere — better
ergonomics, can't evaluate Terraform plan JSON, would leave the IaC ungated. tfsec/Checkov instead
of Rego — worth adding as a reporting gate, but their rules aren't *our* policies, which is the point.

**Cost.** **Two policy languages** — real cognitive load, and the honest answer to "why not one" is
that one tool would be worse at one of the jobs. Rules can drift between CI and admission, so
anything expressed in both needs a test in both. **Kyverno mutation makes Argo permanently
OutOfSync**, so this uses validating policies only. Kyverno 1.11+ is four deployments.

### 12 — No language model in the merge path

**Why.** A gate that blocks a merge has to be able to say why, and to say the same thing tomorrow
about the same diff. A language model can do neither reliably. So nothing on the path from a push
to a merged commit calls one: the gates are code with tests, the policies are Rego with tests, and
both fail with a line number and a rule name. The road is paved precisely because it is
predictable, and a probabilistic step in the middle of it is a pothole nobody can see.

This is a rule about the *merge path*, not about the tooling around it. A model that drafts a
policy, explains a failing rule, or summarises a scan is fine — none of those decide anything.

**Rejected.** An LLM review bot commenting on pull requests — it needs an API key every consumer of
the platform would have to supply, its findings cannot be tested, and a comment that is right four
times in five trains people to skim the fifth. If it merely comments it is noise; if it blocks it
is a non-deterministic required check. An AI-assisted scaffolder — the same objection with worse
consequences, because it makes the generated starting point differ run to run, which is the
opposite of a paved road.

**Cost.** The platform gives up the failure classes that only a model catches: the change that is
syntactically clean, passes every rule, and is still wrong. Those are caught by review here, which
means they are caught by whoever is paying attention, which is a weaker guarantee than a gate.

### 13 — LocalStack pinned by digest, to a persistence wrapper

*Supersedes the persistence and image-choice parts of [8](#8--terraform-against-localstack-via-tflocal).*

**Why.** LocalStack went closed-source in March 2026: Community and Pro consolidated into one image,
and `:latest` now demands an auth token. The free tier is account-gated and non-commercial. Anyone
cloning the repo would have to register with a vendor before `make up` ran, so **pinning became
mandatory, not a preference**. Given a pin was forced anyway, `gresau/localstack-persist:4.14` costs
nothing extra over the plain Community tag and returns the persistence Community lost in v1.0 —
which makes the S3 state backend genuinely durable instead of a claim the stack couldn't back up.

Vetted before adoption rather than after: it builds `FROM` the official image plus ~1,300 lines of
plain Python, contains no network or telemetry calls, is built by public GitHub Actions with SLSA
provenance, has 7.7M pulls and no advisories, and is Apache-2.0 over an Apache-2.0 base — LocalStack's
own announcement endorses pinning to a Community tag.

**Pinned by digest, not tag.** There is no cosign signature, so provenance proves origin but not
authenticity against a trusted key; a digest pin is what actually stops a future compromised Docker
Hub account pushing a new image behind `4.14`.

**Rejected.** LocalStack free tier with an auth token — forces every user to register, and a
non-commercial licence rules it out for anything a company runs. Plain
`localstack/localstack:4.14.x` — safe, but gives up persistence for no saving, since the pin is
required either way. MinIO — since archived in
April 2026, so no longer the safe-harbour option. Garage — actively maintained and S3-compatible, but
a heavier setup and it emulates only S3, losing SSM and the AWS-emulation framing.

**Cost.** A frozen dependency: the author states it will not track future LocalStack releases, so a
CVE in it or the 4.14 base goes unpatched. Acceptable for a local environment pinned by digest, not
for anything long-lived. It is also a third-party wrapper, which needs one line of explanation in
the README. And a namesake hazard worth documenting: the unrelated PyPI package
`localstack-plugin-persistence` had confirmed malicious code (`MAL-2025-6537`) — no relationship to this project, which installs from
local source, but the names differ by one word.

### 14 — No merge-time deployment apply

*Refines the CI half of [8](#8--terraform-against-localstack-via-tflocal).*

**Why.** CI's LocalStack is a job service container that dies with the job, so an `apply` there
provisions nothing that outlives the run. Calling that stage "apply on merge" implies a deployment
that doesn't happen. Plan-on-PR / apply-on-merge exists to promote a reviewed plan into a
persistent shared environment — Atlantis, Digger, Spacelift and env0 all assume one exists, and
the only argument in that literature is *when* to apply, never whether there's a target. We don't
have a shared environment, so the stage has nothing to promote into and is removed.

What CI runs instead is **`terraform test`** against LocalStack — HashiCorp's native framework
(1.6+) and the pattern AWS publishes in `aws-samples/localstack-terraform-test`. It runs on PR and
on merge and it blocks. It proves the resource graph resolves and the module applies from zero; it
doesn't prove IAM, quotas or real AWS semantics, and it isn't claimed to. It also gives the IaC a
test layer, so the Terraform is held to the same rule as the gates and the policies: nothing here
goes in without a test.

The real apply stays in `make up`, which is the conventional ownership split anyway: **Terraform
owns outside the cluster, Argo owns inside it.** LocalStack runs in Docker alongside kind, not in
it, so the boundary falls exactly where practice says it should.

**Rejected.** *Terraform as an Argo sync-wave-0 Job* — the tempting answer, since it would put IaC
behind the same trust boundary as workloads. It works, and Argo's hooks and sync-waves are built
for ordering, but it's a hand-rolled technique rather than a supported pattern, with three
documented landmines: `ttlSecondsAfterFinished` instead of `hook-delete-policy` puts the
Application in a permanent resync loop, the Job must be idempotent because it will rerun, and
there's a bootstrap chicken-and-egg. The prevailing view is to keep cloud-infra Terraform out of
the reconciliation loop entirely. *Crossplane* — the real answer if infra must be reconciled, but
a whole new abstraction for one S3 bucket, and already rejected in 8. *Keeping the apply and
saying nothing* — the status quo, and the actual error. *Dropping the CI run altogether* — loses a
real gate; an unappliable module would reach merge unnoticed.

**Cost.** No promotion path and no drift detection on the cloud resources, because there is no
shared environment to drift from — a local-only constraint, not a claim that this is how it should
work with a real account. Goes on the omissions list next to IAM, which LocalStack doesn't enforce
either. The pipeline never provisions the environment the app talks to; that's deliberate, and
stated in the flow rather than left to be noticed.

---

### 15 — Bun as the app's entire toolchain, no Vite

**Why.** The app is a prop; effort spent on its build config is effort not spent on the
road. Bun 1.3 is runtime, package manager, bundler, test runner and HTML/JSX entrypoint handler in
one binary, so `src/index.html` can be imported directly by the server and served bundled, with
hot reload in dev and a static build in production. That collapses the usual React-app furniture —
Vite, a dev-server proxy to the API, Jest or Vitest, a separate `dist/` served by something else —
into a `Dockerfile` with no build step and a `CMD` of `bun src/server.ts`. One process serves both
the API and the SPA, so there is one thing to probe, one thing to scale and one image to sign.

It also keeps the CI story honest: `bun test` and `bun run typecheck` are the same two commands
locally and in the pipeline, with no lockfile-per-tool drift.

**Rejected.** *Vite + Vitest* — the default and entirely defensible choice, but it adds a second
dev server, a proxy config, and a build artefact that has to be handed to the runtime; none of that
teaches a reader anything about the paved road. *Next.js* — a framework decision for an app that
renders one string. *Serving a prebuilt `dist/` from nginx* — two containers and a second base
image to patch, to avoid a bundler that is already in the runtime.

**Cost.** Bun's bundler is younger than Vite's and its plugin ecosystem is thin, so an app with
real asset-pipeline needs would outgrow it. Pinning Bun by digest in the image mitigates the
version churn but not the ecosystem gap. Registering happy-dom for component tests also overwrites
Bun's `fetch`/`Response` globals, which `Bun.serve` rejects, and `bun test` runs every file in one
process — the workaround is four lines in `test/setup.ts`, but it is the kind of sharp edge a more
settled toolchain would not have.

---

### 16 — The application declares nothing

*Implements [4](#4--gate-logic-in-testable-code) and [5](#5--split-platform-and-app-repos).*

**Why.** A paved road that each application configures is not a road, it is a framework with
homework. The integration surface is therefore three conventions and no config file: a `typecheck`
script, a `test` script, and a `Dockerfile` at the repository root. `greeter`'s entire pipeline is
sixteen lines of YAML that name a workflow and a version, which is the honest measure of how much of
the platform an application team has to hold in their head.

The corollary matters more than the rule: when a gate needs new information, the platform grows a
convention rather than the applications growing a stanza. That keeps the blast radius of a platform
change inside the platform.

**Rejected.** *A `tarmac.yml` per application* — the obvious design, and it is how the road starts
being repaved by every team that adopts it; each opt-out becomes permanent and the matrix of what
actually runs where stops being knowable. *Auto-detection of the app's toolchain* — flexible, but a
gate whose behaviour depends on directory contents is a gate nobody can predict, and its failures
are unreproducible. *Inputs on the reusable workflow for each command* — the same problem as a
config file, just spelled in YAML.

**Cost.** An application that cannot meet the conventions cannot ride the road at all — there is no
graceful degradation, by design. A polyglot estate would need either a second road or a real
per-language abstraction, and this is the point at which that would have to be built rather than
retrofitted.

### 17 — `--frozen-lockfile` as a gate, not a setup step

**Why.** CI has to install dependencies before it can check anything, and the laptop already has
them installed — so the naive split puts `bun install` in the workflow, and the parity claim behind
decision 4 is false at the very first step. Making the install a gate closes that: the same
sequence runs in both places. It also earns its place independently, because `--frozen-lockfile`
fails when the lockfile disagrees with `package.json`, which is precisely how a dependency nobody
reviewed enters a build.

**Rejected.** *A workflow setup step* — the conventional shape, and it costs the one property the
gate system exists to have. *A plain `bun install`* — makes the build work regardless, which is the
opposite of a gate.

**Cost.** The first gate is the slowest on a cold CI runner and reports as a gate failure when it
is really an environment failure. Acceptable: a cold-cache install failing loudly is better than a
warm-cache one succeeding quietly with the wrong tree.

### 18 — Third-party actions pinned to a commit SHA

**Why.** A tag is a mutable pointer in a repository somebody else controls. In March 2025
`tj-actions/changed-files` had its tags retargeted at code that dumped runner memory — including
secrets — into build logs, and every consumer on `@v35` picked it up with no change of their own.
A SHA is immutable, so the same class of compromise becomes a no-op. This is the same argument
already made for the kind node image (1) and the LocalStack image (13); applying it to Actions and
not to images, or the reverse, would be incoherent.

**Rejected.** *Major-version tags* — readable, and what almost every example in GitHub's own docs
shows, which is exactly why the failure mode is so widely distributed. *Dependabot on tags* —
useful, but it updates after a bad tag has already been consumed. Dependabot does understand SHA
pins with a version comment, so the pin costs nothing here.

**Cost.** The SHAs are unreadable, so each carries a `# vX.Y.Z` comment, and those comments are
unverified by anything. Updates need a deliberate bump rather than arriving free.

### 19 — The state bucket is created by an init hook inside the emulator

**Why.** A Terraform S3 backend cannot create the bucket it stores its own state in, so something
has to exist before the first `init`. The usual answers put that something on the developer's
machine: a shell script running the AWS CLI, or a separate bootstrap Terraform with a local state
file that then has to be kept somewhere. Both add a prerequisite to a platform whose whole claim is
that one command works. The emulator already runs an init directory at `/etc/localstack/init/ready.d`
once its services are up, so the bootstrap goes in there and runs *inside* the container. The host
needs no AWS CLI, no Python and no credentials. The script guards on `head-bucket`, so bringing the
stack up a second time is a no-op.

**Rejected.** *A bootstrap Terraform configuration with local state* — the honest answer for a real
account, where the bucket is created once by someone with elevated rights and then never touched.
Here it would mean a second state file with no home and a second `apply` before the first one.
*Creating it from the host script* — adds the AWS CLI to the prerequisites for the sake of two API
calls. *`terraform init -backend=false` and a local state file* — abandons the requirement that the
state backend be real, which is the only reason the backend is here at all.

**Cost.** The bootstrap is emulator-specific in a way the rest of the Terraform deliberately is not:
the equivalent for a real account is a different mechanism, not a different variable. It is one file
and it is named as the seam, but it does not port.

### 20 — S3-native state locking, not a DynamoDB lock table

**Why.** `use_lockfile = true` puts the lock beside the state as an object, which Terraform has
supported since 1.11 and which deprecates the `dynamodb_table` argument. The table was always a
workaround for S3 lacking conditional writes; S3 gained them in 2024 and the workaround is now
obsolete. Choosing it here would mean carrying a second resource, a second thing to provision before
the first `apply`, and an argument Terraform warns about.

**Rejected.** *A DynamoDB lock table* — what most existing configurations still show, and what a
search will suggest. It is a deprecated argument in current Terraform. *No locking at all* — a single
operator on a laptop never collides, which makes it exactly the sort of thing that is omitted for
local use and then absent when it matters.

**Cost.** It raises the minimum Terraform version to 1.11, which is stated in `required_version`
rather than discovered.

### 21 — Environment differences live in files, not in branches in the Terraform

**Why.** Each environment gets a pair of files — `env/<name>.backend.hcl` and `env/<name>.tfvars` —
and the Terraform itself contains no `count`, no conditional and no reference to which environment it
is running in. The backend block is empty; everything that distinguishes one environment's state from
another's is supplied at `init` time. Adding an environment backed by a real account means adding two
files and changing no Terraform, which is the property that makes the local environment evidence
rather than a special case.

**Rejected.** *Workspaces* — one state file per workspace in one bucket, and the backend
configuration cannot then vary, which is precisely the thing that has to vary here. Workspaces also
make it easy to apply to the wrong one, because the current workspace is invisible in the command.
*A `local` boolean threaded through the module* — puts the environment inside the code, so the code
has to be read to know what an environment is.

**Cost.** `init -reconfigure` has to be re-run when switching environments, and forgetting it points
a new environment's apply at the previous one's state. The scripts always pass the backend config
explicitly and always use `-reconfigure` rather than `-migrate-state`, because Terraform offers to
copy one environment's state onto another's and it is never what was meant.

### 22 — Path-style S3 addressing is a variable, not an endpoint override

**Why.** Region, credentials and endpoint all reach both Terraform and the application through the
standard `AWS_*` environment variables, so the configuration that runs against the emulator is the
same configuration that runs against a real account — no endpoint override in the provider, no branch
on environment. One setting could not follow that route: neither the S3 backend nor the AWS provider
reads `AWS_S3_USE_PATH_STYLE`, though both read the endpoint variables beside it. So path style is
stated explicitly — `use_path_style` in the backend config, and a `s3_use_path_style` variable
defaulting to `false` on the provider. An environment backed by a real account omits both lines.
Path style is a supported S3 addressing mode rather than something invented here: the same flag
addresses MinIO, or S3 through an interface VPC endpoint.

**Rejected.** *An `endpoints` block in the provider* — the documented way to point Terraform at an
emulator, and it hard-codes a local URL into a configuration that claims to be portable.
*`tflocal`* — generates those overrides so the Terraform stays clean, which is the right tool if the
Terraform is only ever going to run against the emulator. It is another binary in the prerequisites
and it means the command that provisions locally is not the command that provisions for real.

**Cost.** Two lines per environment that exist because of where the environment runs, in a
configuration whose stated aim is to have none. They are named as such in both files.

**Worth recording: how this failed.** `terraform plan` passed. Plan only reads and lists, and both
work under either addressing mode; the bucket name only moves into the host header on a write. The
first `apply` hung for five minutes retrying `PUT /` with exponential backoff, and the backend
failure before it surfaced as a bare `NoSuchBucket` for a bucket that `list-buckets` showed present.
A green plan is not evidence that an apply will work.

### 23 — The application resolves its own object-store endpoint

**Why.** The runtime's built-in S3 client reads credentials and region from the standard AWS
variables but looks for the endpoint under `S3_ENDPOINT`/`AWS_ENDPOINT` rather than the SDK's
`AWS_ENDPOINT_URL_S3`. Rather than let that leak into the deployment contract — where the manifests
would have to set a variable the AWS SDKs and Terraform have never heard of — one exported function
reads the standard names and passes the endpoint to the client explicitly. The difference is confined
to that function and it is tested.

This is worth a decision entry because of how it fails otherwise. An unset endpoint is not an error:
it is a client that quietly talks to real AWS. That was the actual behaviour before the function
existed, and it was found by a live probe returning a genuine AWS credentials error rather than
anything from the emulator. A configuration mistake that produces a working client pointed at the
wrong account is worse than one that produces an exception.

**Rejected.** *Setting `S3_ENDPOINT` in the deployment* — one line, and it puts a runtime-specific
variable name into every manifest and every developer's shell, where the next person to read it has
no way to know why it is not the standard one. *An AWS SDK dependency* — the standard variables for
free, at the cost of a dependency tree the built-in client makes unnecessary.

**Cost.** A shim that exists to paper over one runtime's naming, which has to be remembered if the
client is ever constructed somewhere else. It is a single exported function and constructing the
client anywhere but through it is the mistake it guards against.

### 24 — Applications reference the platform's module by path, for now

**Why.** Terraform module sources cannot be variables — they are resolved before any input exists —
so the choice is made once, in the file. The application resolves the platform module by a relative
path to a sibling checkout, which is how the repositories already sit on a laptop and how CI already
arranges them. The alternative needs a published tag on the platform to point at, and that tag does
not exist yet.

**Rejected.** *`git::…//infra/modules/app-dependencies?ref=v1`* — the correct end state, and what
this becomes: a one-line change once the platform is tagged. It cannot be adopted before the tag
exists without making the application's first `init` fail. *Vendoring the module into the app
repository* — removes the dependency and with it the entire point of a platform module.

**Cost.** A checkout convention is holding this together where a version constraint belongs. The
application is pinned to whatever is in the sibling directory, which means it silently picks up
platform changes with no commit of its own — the exact property the reusable workflow's `@v1` tag
exists to prevent. It is the same open question as how that tag moves, and it wants closing the same
way.

### 25 — The emulator is reached through a Service, not by its container name

**Why.** The application needs an object-store endpoint that resolves from inside the cluster, and
the emulator runs in a container beside the cluster rather than in it. The obvious address is the
container's name, and it works: a pod gets HTTP 200 and genuine health output from
`http://tarmac-localstack:4566`, and it survives the container restarting. It was adopted only
after asking *why* it works, and the answer disqualified it.

Nothing in Kubernetes resolves that name. CoreDNS finds no `cluster.local` match, falls through to
`forward . /etc/resolv.conf`, and inherits the node's resolver — which under Docker Desktop is the
VM-wide DNS proxy, a component with visibility over every container on the daemon. It answers
container names, and it correctly returns NXDOMAIN for names that do not exist, so it does not even
have the tell of a wildcard resolver. On Linux Docker Engine the node's `resolv.conf` does not point
there and the chain does not exist.

So the container name is not a shortcut, it is a machine-specific accident that presents as a
passing test. Committing it would have produced a deployment that works on the machine it was
written on and fails on a Linux host, at the final step, as a pod that never becomes ready — with
nothing in any log naming DNS as the cause.

The address is therefore bound by Kubernetes' own service discovery: a **selectorless Service**
named `aws`, plus an **EndpointSlice** naming the emulator's address. A pod resolves `aws` to a
ClusterIP and kube-proxy forwards it; Docker's DNS does not participate. Verified on a live cluster
— `aws` resolves to a ClusterIP in the Service CIDR, not to the container's address, and the
response is the emulator's.

**The two objects are not committed to the same place, and the split is the point.** The Service
carries no address and is true on every machine, so it is desired state and lives in `gitops/`. The
EndpointSlice carries an IP that kind's subnet allocation and container start order decide locally,
so it is *not* a fact about the system and is generated at bootstrap by `make up` from
`docker inspect`. The dividing line is whether a value is true on a machine that is not this one.
It also keeps the objection to putting the address in the pod's environment intact: no IP is
committed to `gitops/` by either route.

**Why the EndpointSlice is not committed at all, rather than committed and corrected.** Two variants
would have kept it in git. *Commit it and patch it at bootstrap* is not merely untidy, it does not
work: the reconciler treats git as desired state and reverts drift, so the patch survives until the
next sync and no longer. *Commit it and tell Argo CD to ignore the address field* does work —
`ignoreDifferences` exists for exactly this — but it means git holds a value known to be false on
most machines, and the configuration's only job is to make the reconciler disregard the one field
that carries any information. Both share the same failure signature when they go wrong, and it is
worse than a wrong address applied once: it is a wrong address *re-asserted on every sync*,
overwriting local correction, presenting as a pod that never becomes ready with nothing in any log
naming DNS or address allocation. Generating the object outside `gitops/` removes the class of fault
instead of suppressing its symptom.

A fourth option would have made the address portable enough to commit honestly: pin the emulator to
a fixed address on the cluster network with `docker network connect --ip`. Rejected because it only
relocates the assumption — the `kind` network's subnet is drawn from Docker's default address pool
and is not guaranteed to be the same range on a host that already has networks of its own, so a
committed address would be correct by coincidence rather than by construction. Trading a value that
is visibly generated for an assumption that is nowhere stated is the worse trade.

Two consequences of the split argue for it. There is **no ordering constraint** between the two
objects: an EndpointSlice applied before its Service exists is inert and harmless, and begins
serving the moment the Service appears, so bootstrap and the reconciler do not have to be
sequenced against each other. And because the generated object is the one that can go stale,
`make status` can compare the live EndpointSlice against the emulator's current address — turning
the failure above into a status line rather than an unready pod.

**Rejected.** *The container name directly* — above; the failure is silent and lands at the last
step. *The container's IP straight into the pod's environment* — equally portable in the sense that
it depends on no DNS, but it commits a machine-local address into `gitops/` and gives up the stable
name, so an IP change edits the application's desired state rather than the environment's wiring.
*A CoreDNS rewrite or stub-zone in the kind config* — repairs the Docker-DNS path rather than
leaving it, so it inherits that path's assumptions and needs re-verifying per host platform; it also
puts environment-specific wiring in the cluster definition, where it is invisible from the
manifests. *An `ExternalName` Service* — the tidiest-looking answer and the most misleading: it
returns a CNAME to `tarmac-localstack`, which the pod must still resolve through the same
Docker-Desktop-only path, so it dresses the original defect in a Kubernetes object. *A legacy `v1`
Endpoints object* — still functional on this cluster (1.36) and auto-mirrored into an EndpointSlice,
but deprecated since 1.33 and it prints a warning on every apply; it is a migration owed for no
benefit.

**Cost.** Nothing reconciles the EndpointSlice — there is no selector and no controller watching a
real backend, so if the emulator's address changes the object is stale and the symptom is a pod that
cannot reach its dependency. `make up` regenerating it on every run is what keeps that from being a
manual step, which makes the bootstrap responsible for a piece of cluster state that git does not
describe. That is a real dent in "everything in the cluster arrived through git", and it is the same
class of exception already granted to installing the reconciler itself. The `aws` name is also a
local-emulator shim: an environment backed by a real account has neither object and simply carries
the real endpoint, so the seam has to be understood as per-environment rather than as how the
application always reaches object storage.

### 26 — ingress-nginx, knowing it is retired

**Why.** Something has to get a browser on the host to a pod, and the choice is not free of a wart
whichever way it goes. ingress-nginx is retired: best-effort maintenance ended in March 2026,
`controller-v1.15.1` is the last tag that will ever exist, and its supported-versions table stops at
Kubernetes 1.35 while this cluster runs 1.36. It is kept anyway, and the reasoning is narrow enough
to state precisely. The manifest uses only GA API groups, so nothing in it is exposed to the API
removals that a version gap usually means — the untested surface is the controller's own client
behaviour against 1.36, exercised here by one workload with no traffic on a laptop. Against that: it
is the controller a reviewer expects to see, `Ingress` is the resource an application author already
knows, and the kind provider manifest is one checksum-pinned file. The version is pinned by sha256
and the retirement is written into `scripts/versions.sh` above the pin, so the next person to reach
for a bump finds out there is nothing to bump to before they go looking.

**Rejected.** *Envoy Gateway with the Gateway API* — the actual successor and the right answer for
anything with a future. Rejected for scope, not for merit: it replaces one familiar object with a
three-object model (`GatewayClass`, `Gateway`, `HTTPRoute`) plus a CRD install, and it moves the
part of the platform an application author touches. That is a migration to do deliberately, not a
side quest inside another change. *A `NodePort` Service and no controller at all* — fewer moving
parts and honestly adequate for one service, but it deletes the layer where host routing, TLS
termination and path rules live, so the local environment would stop resembling the thing it stands
in for. *Nothing, and `kubectl port-forward`* — makes a new joiner's first interaction a command
rather than a URL, and hides that exposure was ever a question.

**Cost.** A component in the stack that will receive no further fixes, including security fixes,
on a cluster version it was never tested against. Accepted only because the blast radius is a local
environment: nothing here is reachable from outside the host, and the failure mode of a stale
controller is that routing breaks visibly rather than that something leaks. In an environment
carrying real traffic this entry would read the other way round. The Gateway API migration is on
the omissions list rather than pretended at.

### 27 — The AppProject is where a commit's authority is bounded

**Why.** The pipeline holds no cluster credentials — it writes git and stops (decision 3) — so
"what can a merge do to the cluster?" cannot be answered by looking at a deploy key's permissions.
It has to be answered by the reconciler, and the `AppProject` is that answer: one source
repository, two destination namespaces, an allowlist of namespaced kinds, and exactly one
cluster-scoped kind. The one that matters is the last. Without a `clusterResourceWhitelist`
restricted to `Namespace`, a merge into `gitops/` could add a `ClusterRoleBinding` and grant itself
whatever the destination restriction was meant to withhold — which would make every other limit in
the file decorative. An allowlist rather than `*` also means adding a new kind of object is a
reviewed line in this file, which is friction worth having exactly once per kind.

`EndpointSlice` is deliberately absent from that list, which turns decision 25 from a convention
into a structural rule: commit the emulator's EndpointSlice and the sync fails and says why, rather
than working on the machine it was generated on and nowhere else.

**Rejected.** *`namespaceResourceWhitelist: '*'`* — the common default, and it makes the project a
namespace filter rather than a boundary. *Argo CD's `default` project* — permits any repository and
any destination, so it inverts the property this is here to provide. *Kyverno for the same job* —
policy admission is the right tool for what a manifest may contain, not for what a reconciler may
reach; the two are complementary and the project is the cheaper and earlier of the two.

**Cost.** The allowlist is a second place to edit when the application grows a `ConfigMap` or an
`HPA`, and the failure when it is forgotten is a sync error rather than a missing object, which
reads as a broken manifest until someone looks at the project. Worth it for the property that the
set of things a merge can create is a short list a reviewer can read in one screen.

### 28 — Ordering between applications is retried, not sequenced

**Why.** The two applications under the root look like they want ordering: the greeter pods cannot
pass a readiness probe until the `aws` Service exists. Sync waves are the obvious mechanism and they
do not work here, for a reason worth knowing. Argo CD removed the health assessment for its own
`Application` CRD in 1.8, so a wave boundary between two child applications — which waits for the
previous wave to be synced *and healthy* — has no health to wait on. It orders when the children are
created and nothing else. It looks like ordering and is not.

Restoring the health check is possible, with a Lua customisation in `argocd-cm`. It was rejected
because the ordering it would then give is circular: `local-aws` cannot be created before the
`greeter` namespace exists, and the greeter application owns that namespace, while the greeter
application cannot become healthy before `local-aws`'s Service exists. Either wave order deadlocks.
The dependency is only acyclic at the level of individual resources, so it is resolved there —
whichever application syncs first, the loser fails once on a missing namespace and succeeds on
retry. `selfHeal` is what guarantees termination rather than the retry block: automated sync will not
reattempt a sync that failed against the same commit, so without it a bootstrap that exhausted its
retries would sit red until the next commit rather than until the condition cleared.

**Rejected.** *Sync waves* — above; the mechanism does not do what it appears to. *`CreateNamespace=true`
on `local-aws`* — removes the ordering problem, and produces a namespace with no Pod Security
Admission labels on it. Those labels are a security control and belong in a manifest that can be
reviewed, not in a side effect of a sync option. *Hoisting the namespace into a third application,
or into bootstrap* — both work, both cost a moving part to save one red tick on a first sync, and
both take the namespace away from the application it is named after. *One application instead of
two* — collapses the seam that makes the local emulator replaceable by deletion rather than by diff.

**Cost.** A first bootstrap shows one application failed for a few seconds before it converges, which
is a thing to explain rather than a thing to be proud of. And the convergence depends on `selfHeal`
being on — a design where the two are coupled without the coupling being visible in either file,
which is why it is written in both of them.

### 29 — `make deploy-local` is a named exception, scoped to image bytes

**Why.** The inner loop cannot go through a registry. Waiting on a build, a push to GHCR and a pull
back to see a one-line change is the wrong trade on a laptop, so `make deploy-local` builds the
application and loads the image straight into the cluster's containerd with `kind load`. That is a
route to the cluster that does not pass through git, and rather than leave it implicit it is worth
saying exactly how far it reaches: it replaces the bytes that the `greeter:local` tag resolves to,
and nothing else. The Deployment, its image reference, its security context and whether it is
deployed at all still come from git. The exception can change what runs; it cannot change how it is
configured.

**Rejected.** *A local registry on the kind network* — already rejected for the platform as a whole
(decision 7); it adds a component to make the local path resemble the real one, and the resemblance
is not worth a container. *`imagePullPolicy: Never`* — states the intent more strongly and makes the
manifest local-only, so the same file could not also be the one CI writes a digest into.
*No exception, registry only* — honest, and slow enough that it would be worked around rather than
used.

**Cost.** Two ways for code to reach the cluster, and the fast one leaves no trace. A developer who
uses `make deploy-local` and then wonders why a colleague sees different behaviour has no artefact to
look at — the tag is the same, the manifest is the same, and only the bytes differ. `imagePullPolicy:
IfNotPresent` is what makes this possible and is also what makes it invisible.

### 30 — A missing configuration object fails readiness, an empty one does not

**Why.** The application reads its greeting from an S3 object on every request, and it treats two
failures differently on purpose. A fetch that throws — no bucket, no object, no endpoint — is
deliberately not caught, so it propagates, `/readyz` fails, and the pod is removed from the Service.
That is the honest answer: the infrastructure the service depends on is not there. A body that is
present but empty or whitespace-only is treated as misconfiguration instead, and the built-in default
is served, because a truncated value is not evidence that the dependency is gone.

The split is defensible, but the empty case is the weaker half and worth being explicit about rather
than discovering later: **an empty object and a correct read are indistinguishable from outside the
process.** This was not theoretical. `docker exec` without `-i` gives the command `/dev/null` on
stdin, so a `cp -` upload writes zero bytes and reports success; the config object was silently
truncated, and the service kept answering with a plausible greeting and a green readiness probe. The
mistake was in the test, but the reason it went unnoticed was this fallback.

So the mitigation is not in the application, it is in how the path is verified: any check of this
seam must assert that the served value equals a value the check itself wrote, and confirm the object's
size at the store. Asserting a 200 and a non-empty body proves only that the process is running.

**Rejected.** *Treat empty as fatal too* — makes truncation loud, which is the attraction, and is the
change to make if this were carrying real traffic. It loses because the default then becomes
unreachable and a legitimately empty configuration value turns into an outage, which is a worse
default for a value that is presentational. *Catch the fetch error and serve the default* — the
symmetrical option, and the wrong one: it converts a missing dependency into a service that looks
healthy while serving something nobody configured. *Cache the value with a TTL* — fewer reads per
request, and it would hide exactly the failure this seam exists to expose, since a deleted object
would keep serving from cache until the TTL expired.

**Cost.** One class of misconfiguration is silent by design. A pipeline that overwrites the
configuration object with nothing produces a healthy deployment serving a default, and nothing in the
cluster reports a problem — the only place it can be caught is a verification step that knows what
value it expects.

### 31 — The reusable workflow is consumed through a floating major tag

**Why.** Applications say `uses: <org>/tarmac/.github/workflows/ci.yml@v1`. `v1` is a tag that moves:
it is advanced to the head of `main` only when the platform's own gates pass on that commit, and a
change that breaks the contract with applications gets `v2` instead of moving `v1`. The point of a
paved road is that the road can be resurfaced without every car being recalled — a new gate, a fixed
step, a bumped action pin should reach every application without a commit in each of their repos. Tag
per commit, and the platform team's improvements are the app teams' backlog.

This closes the same question in its second form. Applications also track the platform's Terraform
module by checkout path (decision 24), which floats for exactly the same reason and was left open
pending this. It stays as it is, and the platform checkout is renamed from `platform/` to `tarmac/`
so the relative path in an application's Terraform resolves against the repository name rather than a
role name that happens to be where CI put it.

**Rejected.** *A commit SHA per application* — reproducible, auditable, and it makes every platform
change an N-repo pull request campaign; correct with a bot to raise those PRs, which is a component
this does not have. *A tag per release, `@v1.4.2`* — the same problem one notch smaller. *`@main`* —
honest about the floating, and gives the platform no way to land a breaking change at all.

**Cost.** This is in direct tension with decision 18, which SHA-pins third-party actions on the
argument that a moving tag is a moving target. The distinction being drawn — first-party code under
the same gates floats, third-party code does not — is a real one, but it is a distinction, not an
exemption: an application's build can change behaviour with no commit of its own, and the only thing
standing between a bad platform commit and every application is that `v1` moves on green.

### 32 — The cross-repo commit is made by a GitHub App

**Why.** The pipeline's last act is a commit into the platform repository's `gitops/` directory,
from a job running in an application's repository. `GITHUB_TOKEN` is scoped to the repository the job
runs in, so it cannot do this by construction. A GitHub App installed on the platform repository
with `contents: write`, minting a short-lived installation token at job time through
`actions/create-github-app-token`, is the option where the credential is per-run, revocable centrally,
attributable to something other than a person, and not a secret that has to be rotated by hand.

**Rejected.** *A personal access token* — a long-lived credential tied to a human account, and a
fine-grained one still cannot be scoped below the repository. *A deploy key* — repository-scoped and
appealingly narrow, but SSH-only, one key per repository to distribute, and it identifies the key
rather than the workflow. *Argo CD Image Updater* — removes the commit entirely by letting the
cluster watch the registry, and was rejected earlier for the same reason it is rejected here: it puts
the cluster back in the position of deciding what to run, which is the property this design exists to
avoid.

**Cost.** `contents: write` is not path-scopable. The App can write anywhere in the platform
repository, not only `gitops/`, so the constraint that it only ever touches one image field lives in
the code that runs, not in the permission that allows it. The compensating controls are elsewhere and
worth naming: branch protection on the platform repository, the AppProject's resource allowlist
(decision 27) bounding what a `gitops/` commit can cause, and the platform's own gates running on the
resulting commit. Also, App-minted tokens do trigger workflows where `GITHUB_TOKEN` does not, so
every deployment costs one extra run of the platform's read-only self-check.

### 33 — Promotion is a separate command from the gates

**Why.** The gates verify; promotion mutates. They are deliberately not the same program: `promote`
lives outside the gate registry, so running the full gate suite on a laptop cannot push a commit, and
so the gate contract stays "reads the working tree, returns a verdict". The digest is passed between
them as data rather than as shared state — an image gate records the published `repo@sha256:…` as a
fact, the runner writes the collected facts to a file, and `promote` reads that file. The manifest is
edited by explicit YAML path rather than by text substitution: a `sed` on the first `image:` line is
correct until someone adds an initContainer, at which point it is silently wrong.

**Rejected.** *Promotion as one more gate* — uniform, and it makes `make ci` a command that can push
to a remote, which is a footgun no naming convention fixes. *Parsing the digest out of the gate's
rendered summary* — no new plumbing, and it couples a machine contract to a string written for
humans. *Templating the manifest at deploy time* — removes the commit, and with it the record that
the running version is a thing someone can `git log`.

**Cost.** A second entry point with its own argument parsing and its own tests, and a fact channel
that is only meaningful when a gate and the promoter agree on a key name — a contract with nothing
enforcing it but tests on both sides.

### 34 — The registry package is made public by hand

**Why.** A package pushed to GHCR is private by default, and its visibility is settable only in the
web UI — there is no REST endpoint and no `gh` subcommand for it. So it is a one-time manual step,
written down in the platform's setup documentation rather than automated, because the alternative is
scripting against an unsupported surface to save a single click that happens once per repository.
Public is the right end state here: the cluster then pulls anonymously and no pull credential exists
in the cluster at all.

**Rejected.** *Ship an `imagePullSecret`* — keeps the package private, and puts a registry credential
into the cluster and into the bootstrap path, which is a durable cost to avoid a one-off action.
*Automate it by driving the web UI* — a scripted click against an unversioned page, in the setup path.

**Cost.** A manual step in a design whose whole claim is that the path is automated, and one that
fails late and confusingly if skipped: the first deployment goes green in CI, the commit lands, Argo
syncs, and the pod sits in `ImagePullBackOff` with an authorisation error for an image that exists.

### 35 — `make deploy-local` is retired once an anonymous pull is proven

**Why.** Decision 29 kept `make deploy-local` as a named exception on the argument that the inner
loop could not wait on a registry round trip. That argument was made while the registry path did not
exist. Once CI publishes and promotes, the cost of the second route is no longer theoretical: two
ways for code to reach the cluster, and the fast one leaves no artefact — which is precisely the
property the design is meant not to have. So the target goes.

It goes **in that order**, not before: build the release path, push a real release through it, and
verify that a logged-out Docker (`docker logout ghcr.io`) can pull the published image onto a cold
node. Removing the local route first and discovering afterwards that the registry route has a gap
leaves no way to run anything. What survives is a `suspend`/`resume` pair — drop `syncPolicy`, then
restore it — named as a break-glass tool for incidents, not offered as a development convenience.

**Rejected.** *Keep it and document it harder* — decision 29's position, and documentation does not
change what the artefact record shows. *Keep it but make it break the deployment loudly* — the
`imagePullPolicy: Never` variant, which makes the manifest local-only so the same file cannot also be
the one CI writes a digest into. *Remove it now* — same destination, and it removes the fallback
before the replacement is proven.

**Cost.** The inner loop gets slower by a build, a push and a pull, and a one-line change now needs a
commit and a CI run to be seen in the cluster. That is the correct price for a single route, but it is
a real one, and it is the reason a break-glass pair still exists.

### 36 — The credential that can deploy is never present in the job that runs application code

**Why.** The gate job checks out an application repository and runs its test suite, its build and its
lockfile install. That is arbitrary code from a repository the platform does not control, executing on
a runner. If the token that can commit the promoted digest were in that job's environment, a
single malicious or compromised dependency in any onboarded application could read it and write
whatever it liked into `gitops/` — which is to say, deploy anything to the cluster. So promotion is a
separate job. The gate job passes a digest forward through `needs:`; it never sees the token, and the
release job never runs application code.

The same reasoning applies one level up: the caller names the two secrets it forwards, rather than
using `secrets: inherit`. Inheriting grants the called workflow everything the repository holds,
including secrets added later for unrelated reasons, and the grant is invisible from the caller.

**Rejected.** *One job, minting the token after the gates pass* — simpler, one runner, no output
plumbing; and the token then exists in a process tree that has already executed third-party code, with
whatever that code left behind still on the runner. *Passing the facts as an uploaded artifact* — a
real audit trail, and two more actions plus a retention setting to move roughly eighty bytes.
*`secrets: inherit`* — one line instead of four, and it makes the blast radius of onboarding an
application "everything in that repository's secret store".

**Cost.** A second runner per deployment, a second checkout of the platform, and a value that has to
cross a job boundary as a string. Job outputs are visible in the run's logs and API, so anything put
on that channel is public to anyone who can read the run — fine for a digest, and a rule that has to
be remembered if the channel ever carries anything else.

### 37 — The promoter is versioned; the manifest it edits is not

**Why.** The release job checks out the platform twice, at two different refs, and the asymmetry is
deliberate. The promotion *code* is part of the contract the application pinned, so it comes from
`platform-ref` — the same ref the caller's `uses:` line names. The manifest it edits is live cluster
state, so it comes from the deployment branch. Running `v1`'s promoter against `main`'s `gitops/` is
the correct pairing: an application gets the behaviour it asked for, applied to the world as it
currently is.

**Rejected.** *One checkout at the branch* — one step instead of two, and the code that deploys an
application would then change whenever the platform's default branch changes, silently, with no commit
in the application repository. That is exactly the property decision 31's version tag exists to
provide, discarded in the one job where the consequence is a deployment. *One checkout at
`platform-ref`* — consistent, and it edits and pushes a manifest read from a tag, so a promotion
racing another promotion rebases onto a base that is not where the branch is.

**Cost.** Two checkouts of the same repository in one job, which reads like a mistake until the reason
is known — hence the comment in the workflow and this entry. A tag old enough to predate a change in
the manifest's shape will also fail against current `gitops/`, loudly, at the point where the tag
should have been moved.

---

### 38 — An image is built once per commit, and re-runs reuse it

**Why.** `docker build` is not reproducible. Docker stamps a wall-clock `created` into the image
config on every build, so the same source produces a different digest each time — and the digest is
what gets committed into `gitops/`. The consequence was found by re-running a green
pipeline with nothing changed: two runs of greeter `370c013` produced `sha256:1d01369c5c9a` and then
`sha256:4ef0455991b2`, and therefore two deployment commits rolling the pods for a byte-identical
application. Worth naming how it was found — the pipeline was green both times, so no amount of
reading the output would have shown it.

The image is already addressed by commit SHA, so that tag is an idempotency key that costs nothing to
adopt: before building, ask the registry whether this commit already has an image, and if it does,
skip the build and the push and report the digest that is already there. Same commit, same digest.
This also makes the promoter's no-op-on-unchanged-digest path reachable — it was tested and, in
production, dead code, because the digest was never unchanged.

Only on a push. A pull request builds every time: there the build *is* the gate, and a check that can
be satisfied by something already sitting in a registry is not gating the change in front of it.

**Rejected.** *Making the build reproducible* — the stronger property, and the right answer for a
project that needs to prove an image corresponds to a source tree. It means `SOURCE_DATE_EPOCH`
plus buildx's `rewrite-timestamp`, because normalising the config timestamp alone leaves layer mtimes
taken from the checkout, and then owning a buildx version pin and proving normalisation holds across
a two-stage build. A large surface for a property this pipeline does not need. *Keying the no-op on
the source commit instead of the digest* — the manifest records a digest, not a provenance, so this
means writing the source SHA into the manifest as an annotation and comparing that: more moving
parts, and it would make an unchanged deployment depend on a field nothing else reads. *Accepting
it* — a redeploy per re-run is survivable, but it makes "the digest names the bytes that passed the
gates" true while "the same commit names the same bytes" is false, and reviewers reasonably assume
both.

**Cost.** The gate stops being a pure function of the source tree and starts depending on registry
state. Delete the image from GHCR and a re-run behaves differently — which is also the break-glass
for forcing a rebuild, deliberately left as the only one rather than adding a flag. Every way of
failing to reach the registry falls through to a real build, so the failure mode is a redundant build
rather than a deployment of a digest nobody confirmed exists. And the build gate now reports
`skipped` on a re-run, which is honest — it did not build anything — but means a green pipeline no
longer implies an image was built by *that* run.

---

### 39 — The only non-GitOps path is a break-glass pair that stops the reconciler, not one that deploys

**Why.** `deploy-local` built an application and side-loaded the image into the cluster's containerd,
bypassing the registry. It earned its place while the pipeline did not exist: it was the only way to
get bytes into the cluster. Once CI publishes a digest and Argo CD reconciles it, keeping it leaves a
second way to deploy that nothing gates, nothing records and nobody watches — the exact property the
design is supposed to remove. It goes. Decision 35 already accepted the cost it existed to avoid.

What is genuinely missing without it is not a deploy path but an escape hatch. `selfHeal` means the
cluster is not somewhere state can be edited, and during an incident that is the correct default and
the thing standing between an engineer and a mitigation that is understood but not yet merged.
Without a supported lever, the unsupported one gets used, and fighting `selfHeal` at 3am is worse than
any lever.

So: `make suspend` scales the application controller to zero, `make resume` scales it back and waits
for git to win again. A pair, never an off switch alone — the failure mode of a break-glass is not
that it is used, it is that it is used and forgotten.

**Rejected.** *Clearing `syncPolicy.automated` on the Application*, which is what `argocd app set
--sync-policy none` does, and the obvious answer. It does not work here: the Applications are
themselves reconciled by `root`, which has `selfHeal` too, so Argo restores the policy within minutes
and quietly resumes deploying — a break-glass that closes itself, discovered when a commit lands on
top of the manual fix. Scaling the controller cannot be undone by the thing it turns off. *Adding
`root` to a list of applications Argo ignores* — it makes the escape hatch permanent structure in git
to serve an exceptional case, and weakens the root reconciliation everything else depends on.
*Nothing at all*, on the grounds that a laptop platform has no 3am: the lever is cheap and the
argument for it is about production, where the first question anyone asks is "and how do you fix an
incident here?"

**Cost.** It is cluster-wide. Nothing reconciles for any application while suspended, so this cannot
hold one application still while the platform carries on — the right blast radius for an emergency
switch that is either obviously on or obviously off, and the wrong tool for anything routine. While
suspended the pipeline keeps running and keeps writing digests into git, which then queue up
undeployed; `make status` reports the suspended state on every run so this cannot be forgotten
quietly, but nothing enforces a time limit.

`resume` forces a hard refresh rather than waiting for one, and that is not defensive coding — the
naive version was written, run, and observed to be wrong. A controller that has just come back reacts
to watch events, and every edit made during a suspension happened while nothing was watching, so it
re-compares nothing; meanwhile `status.sync.status` still holds the value cached before the suspend.
A resume that waited on the reported status returned "the cluster matches git again" against a
Deployment still carrying a hand-scaled replica count, and it stayed wrong until something forced a
refresh. The accepted cost of the fix is that resume is slower and that it discards Argo's manifest
cache for every application.

### 40 — ValidatingAdmissionPolicy at admission, not Kyverno

**Supersedes the admission half of 11.**

**Why.** Decision 11 named Kyverno because it is pleasant to write and reads like Kubernetes. The
reason for changing is not that Kyverno is heavy — it is that a webhook is a component that can be
down, and a validating webhook with `failurePolicy: Fail` that is down blocks every create in its
scope, including the ones that would fix it. On a single-node kind cluster the controller and the
API server share a node, so the failure mode is not hypothetical. A ValidatingAdmissionPolicy is
CEL evaluated inside the API server: no deployment, no service, no certificate to rotate, and no
state in which the policy layer is unavailable while the API server is up. It is also GA, so this
is not an early bet.

Both policies here fit in a CEL expression comfortably, which is the honest test — the decision
would go the other way for a rule that needs to look at another object.

**Rejected.** *Kyverno*, as above; also four deployments to install and a mutation feature that
makes Argo permanently OutOfSync, which decision 11 had already ruled out using. *A webhook of our
own* — every problem of Kyverno with none of its maturity. *Gatekeeper* — same webhook exposure,
plus a CRD layer over the Rego that already exists in `policy/`.

**Cost.** CEL cannot do what Rego can. There is no cross-object lookup and no calling out, so a
rule like "this image's digest was published by our pipeline" is not expressible here and would
need something else entirely. The two languages decision 11 accepted are still two languages —
they are now CEL and Rego rather than Kyverno YAML and Rego, which is not obviously an
improvement in readability. And admission is structurally blind to what already runs: it judges
requests, so a policy tightened today says nothing about the workloads admitted yesterday.

### 41 — The Rego reads source files, not plan JSON

**Supersedes the CI half of 11.**

**Why.** Decision 11 said conftest would read `terraform plan` JSON. It reads the `.tf` source
instead. A plan requires credentials, a backend, an `init` and a reachable provider — in the
gate's case, an emulator that only exists on a laptop — which would make the first and cheapest
gate the one with the most infrastructure behind it. Worse, it would run against the application
repository, so the platform's shared module would be gated only through whoever happened to call
it.

Reading source gives up resolved values and gains something better: the rules run in under a
second, need nothing installed, and catch the mistake in the file the author is editing. What is
genuinely lost — a plan's view of what will actually change — is a different check, and it is on
the omissions list as `terraform plan` in CI rather than pretended at here.

The consequence to be aware of is that conftest sees one file at a time and does not expand
modules. So the S3 rules earn their keep against the platform's own module source, which is
checked when the platform gates itself; the rule that fires on an application repository is the
unpinned module source in 44.

**Rejected.** *`terraform plan` JSON*, as above. *tfsec or Checkov* — good rules, but somebody
else's, and a policy layer whose content the team did not choose cannot answer "why is this your
policy". Worth adding later as a reporting gate beside these, not instead of them. *`terraform
validate`* — it checks that the configuration is valid, never that it is acceptable, which is a
different question.

**Cost.** Rules match on unresolved interpolation strings — `"${aws_s3_bucket.config.id}"` — so
they reason about references rather than values, and a bucket wired up through a variable
indirection could evade the companion-resource check. The rule set is written to match by
reference rather than by shared local name, and the case is covered by a test, but the general
limitation is real.

### 42 — The admission bindings are scoped by exclusion, never by an opt-in label

**Why.** This is the whole design, and it comes from watching Pod Security Admission fail at it.
PSA is switched on per namespace by a label, which means a namespace created without the label
gets nothing, silently, and no amount of policy inside PSA can fix that — a mechanism that only
sees what opted in cannot police its own adoption. Reproducing that shape for these policies would
reproduce the hole.

So the bindings match every namespace and name their exceptions: `kube-system`, `kube-public`,
`kube-node-lease`, `local-path-storage`, `ingress-nginx` and `argocd`. A new namespace is covered
the moment it exists, and adding an exception is a diff in a file a reviewer reads.

The excluded namespaces are the platform's own machinery, installed from upstream manifests that
`scripts/versions.sh` pins by SHA-256. Their provenance answer is that checksum. Asking upstream
to publish digest-pinned images to our registry is not something this platform gets to decide.

`policy/kubernetes/namespaces.rego` closes the other end of the same hole before it opens: it
fails a Namespace manifest that does not set `pod-security.kubernetes.io/enforce: restricted`.

**Rejected.** *An opt-in label*, as above. *Listing the namespaces in scope* — the same failure
one step removed: correct on the day it is written and wrong the first time somebody adds a
namespace. *`kubernetes.io/metadata.name NotIn` with no exceptions at all* — honest, and it
prevents the cluster from starting, because the control plane's own components do not meet these
rules and cannot be made to.

**Cost.** The exception list is a second place to edit, and a workload that legitimately needs an
upstream image has no route except an entry in it — deliberately, but it means the list will grow
and nobody is scheduled to prune it. The six excluded namespaces are unpoliced by this layer, and
anything that can create a workload in `kube-system` is outside it entirely.

### 43 — The admission policies are installed by `make up`, not reconciled by Argo CD

**Why.** Everything else that runs in this cluster arrives through git and is reconciled. These do
not, and the asymmetry is the point: a rule that arrives through the same door as the thing it
judges can be removed by the change it would have rejected. Argo CD applies what is in `gitops/`;
if the policies lived there, a commit removing them would be reconciled exactly as faithfully as
one adding a workload, and the policy layer would be enforcing at the pleasure of the payload.

They are also machinery, not payload — the same category as the cluster itself, the ingress
controller and Argo CD, all of which `make up` installs. Installed second, immediately after the
cluster exists, so nothing has ever been deployed into an unpoliced cluster.

`scripts/admission-up.sh` does not report success on a successful apply. It sends a deliberately
non-compliant pod with `--dry-run=server` and waits until the cluster rejects it. That is not
belt-and-braces: the API server picks policies up through an informer, and a probe run
milliseconds after the apply was admitted, which read as a broken policy for some minutes before
it turned out to be a race.

**Rejected.** *An Argo CD Application over `policy/admission/`*, as above. *A sync wave before
everything else*, which fixes the ordering and not the removability. *Applying them in
`cluster-up.sh`* — it would work, and it buries a security control inside a script named for
something else.

**Cost.** The policies are not reconciled, so nothing reverts a hand-deleted binding — `make
status` reports each policy and whether it is bound, which turns a silent hole into a visible one
but does not close it. Anyone who runs only `kubectl apply -k gitops/` gets no policy layer at
all. And installing them by script means the cluster's rules are not fully described by git, which
is a real dent in the property the rest of the design leans on.

### 44 — Two findings are classified `warn`, and both fire on this repository

**Why.** conftest exits non-zero on `deny` and zero on `warn`, which is the same blocking/reporting
split the gate registry already draws, one level further down. Two rules are deliberately on the
reporting side.

*A Secret with literal values in git.* `gitops/local-aws/credentials.yaml` holds the emulator's
throwaway credentials. Blocking it would be blocking the only thing that makes a
no-cloud-account setup work, and adding an exemption for the one file that fails would make the
rule a formality. Reported instead: the finding is real, the fix is a secret backend, and the day
this platform faces an environment that matters it is already written down.

*A module source with no version.* An application's Terraform calls the platform module by
relative path, which is what a developer types on a laptop and what decision 24 accepted. Blocking
it would fail the platform's own pipeline on the platform's own code. It becomes a `deny` on the
day the platform has a tag to pin to — a decision to take deliberately, not to discover on a red
run.

Both rules assert their own classification in a test: `test_the_secret_finding_never_blocks` and
`test_the_unpinned_module_finding_never_blocks` fail if somebody promotes them without meaning to.

**Rejected.** *Making everything `deny`* — the honest-looking choice that ends with an exemption
list, which is where policy sets go to become decoration. *Leaving both rules out until they can
block* — then the platform ships with a policy set that is green on the day it is written, which
demonstrates nothing.

**Cost.** A `warn` that nobody reads is the same as no rule. It is printed in the gate output and
in the pull request comment and there is nothing beyond that — no expiry, no ticket, no count that
has to go down. Two known findings ship in a green pipeline, and the mechanism that stops them
being ignored forever is a person.

### 45 — GitOps is the intended path into the cluster, not the only one

**Supersedes the claim in 39 that `selfHeal` means the cluster is not somewhere state can be
edited.**

**Why.** It was worth testing, so it was tested. A pod applied by hand into the application's
namespace was still running eight minutes later, with every Application reporting Synced and
Healthy throughout. Argo CD was not broken and was not late: `selfHeal` reverts drift in the
resources an Application tracks, and prunes what it created. A resource it never created and no
manifest mentions is not drift — it is simply not Argo's.

The claim was overstated wherever it appeared, and it appeared in the README as "the only path in
is a commit". The admission policies close part of the gap and the part they close is worth
having: a hand-applied workload that violates them is rejected before it exists. A compliant one
is still admitted, and still nobody reconciles it away.

The rest is RBAC, not policy — denying `create` on workload resources to every subject except
Argo's service account, so that the only principal who can put a pod in the cluster is the one
reading git. That is the honest answer and it is not implemented; it is on the omissions list.

**Rejected.** *Saying nothing and leaving the README as it was* — the claim was load-bearing in
the design's own argument, and anyone who tests it finds out in thirty seconds. *An admission
policy that rejects anything not carrying Argo's tracking label* — plausible, and it breaks
`kubectl` for every legitimate debugging action while being trivially forgeable by anyone who can
set a label. RBAC is the mechanism that actually distinguishes principals.

**Cost.** The design's cleanest sentence is now a longer and more qualified one. Anyone reading
only the headline claims will find the platform less absolute than it looked, which is the correct
impression and a weaker headline.

### 46 — The image scan reports, it does not block

**Why.** This is the first gate in the platform classified `reporting`, and the classification is
the decision — the scanner behind it is nearly interchangeable.

A blocking vulnerability gate fails on a calendar, not on a diff. A CVE is published against a
base-image package on a Tuesday and every pipeline in the estate is red on Wednesday, including the
one carrying the fix for an unrelated outage. Nothing about the change under review got worse. The
observed answer to that, everywhere it has been tried, is a blanket ignore file — after which the
scanner enforces nothing while still looking like a control, which is worse than not blocking,
because it is the same absence with a green tick on it.

What makes that defensible rather than merely convenient is that reporting is not silence. The
findings land in the pull request comment and the terminal, worst severity first and, within a
severity, the ones with a published fix ahead of the ones without — so what the author sees first
is what they can act on today. Skipping one becomes a decision somebody made rather than one nobody
saw. And the security properties a *change* can actually break — credentials written into a
provider block, an image pulled from somewhere other than `ghcr.io`, a tag that is not a digest —
are blocking, in the policy gate, because those do fail on the diff.

Two mechanics carry the argument rather than decorate it. Trivy is invoked *without* `--exit-code`,
so whether a finding stops the pipeline is decided by the `severity` field in the gate registry —
where `docs/gate-matrix.md` lists it and `verdictFrom` acts on it — rather than by a flag on
somebody else's CLI. And the judgement about what a report *means* lives in `gates/src/`
`vulnerabilities.ts`, a pure module over a captured report, so it has tests that do not change their
expected result when the vulnerability database updates overnight.

Scope, stated rather than hidden: HIGH and CRITICAL only, because a list nobody reads is not a
report; and the vulnerability scanner only, not the secret scanner, so a credential baked into an
image layer is not caught here. The Rego sees secrets in source, which is where this platform's
would come from; the image case is on the omissions list.

**Rejected.** *Blocking on CRITICAL and reporting on HIGH* — the compromise everyone reaches for.
It fails on the calendar exactly as before, only less often, and the day it fires is still a day
somebody unrelated is holding a red pipeline. *Two gates, one reporting for CVEs and one blocking
for secrets in the image* — the blocking half would duplicate rules the Rego already enforces
against source, and a second scanner install to re-check what the policy gate checked reads as
thoroughness rather than being it. *A gate whose severity depends on what it found* — `severity` is
a static field precisely so the generated matrix can be read as a promise; a sometimes-blocking
gate makes that document a lie. *`trivy --exit-code 1`* — shorter, and it moves the platform's most
argued-about decision into a CLI flag where it cannot be listed or tested. *Grype, or Docker Scout*
— no argument against either; trivy scans OS packages and language lockfiles in one invocation and
emits stable JSON, and the module reading that JSON is where the actual thinking is.

**Cost.** A pipeline can go green with twelve HIGH findings in it, and does — that is the current
state of the greeter image, visible in every run. Nothing counts them down, nothing expires them,
and no ticket is opened. The mechanism that turns a report into a fix is a person reading it, which
is exactly the weakness this decision trades for not having a control everybody has learned to
route around. A scanner pinned by checksum also does not pin its findings: the database is fetched
at scan time, so the same commit scanned a month apart reports differently. That is deliberate — a
scanner frozen to the CVEs of its release date reports nothing worth having — and it is the second
reason this gate cannot sanely be blocking.

---

### 47 — Terraform is checked by a gate, not by a CI step, and it is hermetic

**Why.** `fmt -check` and `validate` are two lines of YAML if all you want is for them to run. They
are a gate here instead, and the two reasons are worth separating.

The first is what `validate` adds that nothing else on this road has. The policy gate already reads
these same `.tf` files, but Rego parses them as *source* and judges them against rules this platform
wrote — is the bucket encrypted, is public access blocked. It has no idea what arguments the AWS
provider actually accepts. A misspelled attribute or a reference to a resource that does not exist
passes every other gate in the pipeline and fails at `apply`, which is the last place where failing
is still cheap and the first place where it is someone's afternoon. `validate` knows the provider
schema; that is the whole of its value, and it is not a duplicate of the policy gate. Proven rather
than asserted: `bucketz = "nope"` in `greeter/infra` was caught with *"Did you mean bucket?"*, and
the run exited 1. `fmt -check` rides along for a much smaller reason — formatting arguments are the
cheapest review comment to stop having.

The second reason is that a gate is a thing this platform can describe. Being in the registry means
it appears in `docs/gate-matrix.md` with a severity and a written justification that CI checks is
current, it is selectable with `--only`, it runs identically on a laptop and on a runner, and it has
tests. A workflow step is none of that, and `make infra-fmt` — which existed and which nothing
invoked — is the proof: a check nobody runs is a check that does not exist.

Ordered after the unit tests rather than beside the policy gate, where it would read more naturally.
The order in the registry is cost and not theme, and `init` pulls the AWS provider over the network.
It is the most expensive gate that runs before the image is built.

**The hermetic part is not a detail.** On its first real run the gate failed on a laptop and would
have passed in CI. A developer who has run `make infra` has a `.terraform/` that records the S3
backend, and Terraform honours that record *even under `-backend=false`* — so `init` went looking
for AWS credentials, found none, and failed. A fresh CI checkout has no such directory and would
never have shown it. That is precisely the local/CI parity this platform claims, being false and
being quiet about it. The fix is `TF_DATA_DIR` pointed outside the module, which cuts both ways: the
gate cannot be confused by a developer's working state and cannot corrupt it either. The path is
derived from the module path rather than randomised, so the provider cache survives between runs and
a test can assert the exact value. `dataDirFor` is a pure function with its own tests for that
reason.

`-backend=false` is the other half. Validating does not need state, and asking for it would mean this
gate held a credential reaching the real backend — decision 36 says the pipeline holds no such
credential, and that applies to reads as much as to writes. A test asserts the flag is passed.

Which directories get validated is discovered, not hardcoded, because the two repositories disagree
about the shape: an application keeps one root module at `infra/`, the platform keeps a child module
at `infra/modules/app-dependencies/` and nothing at the top. Hardcoding either would have silently
validated nothing in the other.

The binary is pinned and checksummed like conftest, and for conftest's reason rather than trivy's:
this one blocks a merge, so its provenance is not delegated to a marketplace action. The checksum
was produced by downloading the artefact and hashing it, *then* compared against upstream's
`SHA256SUMS` — the only ordering that catches the case where the published sums are the thing that
moved. Related: `greeter/infra/.terraform.lock.hcl` recorded an `h1:` hash for darwin only, so CI's
Linux `init` was falling back to the registry `zh:` hashes. `terraform providers lock` for both
platforms now records both.

**Rejected.** *Two lines of YAML in the workflow* — invisible to the matrix, unselectable, untested,
and it would not run on a laptop; `make infra-fmt` already demonstrated where that ends. *Two gates,
one for fmt and one for validate* — one concern, "the Terraform in this repository is well-formed
and internally valid", and splitting it doubles the matrix rows without adding a decision anyone
would make differently. *Making `make infra-fmt` the CI entry point* — it sweeps both repositories at
once, which a gate looking at one application cannot do; it stays as the local convenience and the
gate owns enforcement. *`hashicorp/setup-terraform`* — same objection as every marketplace action
here: it moves the provenance of a merge-blocking tool into somebody else's repository. *OpenTofu* —
no argument against it, and the configuration uses nothing specific to either. Terraform's BUSL
licence restricts offering it as a competing product, not running it in your own pipeline, so it
does not bite; the migration if it ever does is this pin and the binary name. *A random temp
directory for `TF_DATA_DIR`* — hermetic but uncacheable, so every run re-downloads the provider, and
untestable because there is nothing to assert.

**Cost.** Terraform is a ~120MB download on every CI run and the AWS provider is a much larger one
on top of it, against a module of a few dozen lines. That is a poor ratio and it is paid knowingly:
the alternative is finding a typo at `apply`. A provider cache keyed on the lockfile would fix most
of it and is not done. `validate` is also strictly local — it type-checks the configuration and
knows nothing about the state or the account, so it cannot tell you the apply will succeed, only
that this class of failure will not be why it did not. And the laptop is not held to the pin: a
developer on 1.14 gets the same answer from `fmt` and `validate`, which is true today and is an
assumption, not a guarantee.

---

### 48 — One admission probe per policy, and the install blocks until each is refused

**Why.** `kubectl apply` returning on a ValidatingAdmissionPolicy means the object exists, not that
anything is being checked. The API server picks policies up through an informer, so there is a
window — short, and long enough — in which the policy is installed and requests sail through
unchecked. This was found the hard way: a probe fired immediately after the apply was admitted, and
read as a broken policy rather than a race. So `make up` does not report success on the admission
layer until it has watched the cluster actually refuse something.

The part worth arguing about is that there are *two* probes, one per policy, each breaking exactly
one rule and satisfying the other. The obvious version is a single pod that breaks both — fewer
files, same apparent coverage. It is strictly weaker, and not by a little. **The API server reports
one denial per request.** It evaluates until something says no and returns that, so a pod violating
both rules tells you only that *one of them* is live, and you do not get to choose which. That check
passes with either policy entirely dead. It is a green light wired to half the circuit.

The probes go through `--dry-run=server`, so they traverse the full admission chain and create
nothing, and they land in `default` on purpose: it is in scope for the bindings and carries no Pod
Security label, so nothing upstream can reject the pod first and mask the answer. The rejection is
matched on the policy name, not on exit status — a failure that is not *this policy saying no* is a
cluster problem being read as a working guardrail, which is the same false green in a different hat.

**Rejected.** *A fixed sleep* — either too short and flaky or too long and paid on every `make up`,
and it never actually observes the property. *Polling the policy object's status* — the API reports
the object as accepted and its bindings as resolved well before the informer has propagated to the
admission path; that is exactly the state the original bug was in. *One probe breaking both rules* —
above; it is the version that shipped first and it hid a real failure, in which the probe violated
both, the server reported `resource-limits`, and the script grepped for `pinned-images`. `make up`
died at step two for a week and never reached LocalStack, Terraform, the ingress or Argo.

**Cost.** The probes have to be maintained alongside the policies, and nothing enforces that: a
third policy added without a third probe is silently unproven, and the install script will report
success over it. The pairing is a convention — probe file named for the policy, matched on
`tarmac-require-$policy` — not a check. Each probe also has to be constructed to satisfy every rule
but its own, which gets harder as the policies multiply and is the thing that will eventually break.
The honest fix is generating the probes from the policies, and it is not done.

---

### 49 — The config bucket is found by convention, not published to a parameter store

**Why.** The module created an SSM parameter holding the bucket name, and the README described the
bucket as "discoverable through SSM". Nothing read it. The application receives `CONFIG_BUCKET` as an
environment variable from its Deployment, and that manifest states the name as a literal. The
parameter was a third copy of a string two places already carried, with no consumer — dead
infrastructure that read as a working discovery mechanism, which is worse than an absent one. It is
gone, along with the `ssm` service from the emulator's service list and the output that re-exported
it.

The seam it appeared to cover is real, and was never covered by it. Terraform derives the name as
`"${var.app_name}-${var.environment}-config"`; `gitops/greeter/deployment.yaml` states the result.
Nothing checks the two agree. What makes that survivable is that it fails loudly: a wrong name is a
404 on the object, an exception on the greeting path, a 503 from `/readyz`, and a rollout that never
completes (30). A wrong bucket cannot produce a pod quietly serving the wrong thing.

**Rejected.** *Keeping the parameter and having the application read it* — an AWS SDK dependency in
the app, rejected in 16 and 23, to resolve a name fully determined by two variables it already knows.
*Keeping it unread, as documentation* — infrastructure that exists to be read by humans is a comment
with a bill and a blast radius. *Injecting the name into the manifest at deploy time* — deploy-time
templating, rejected in 37.

**Cost.** The naming convention is now written twice, once in HCL and once as a YAML literal, with
nothing enforcing that they agree. A Rego rule over the Deployment could enforce it and is not
written. Decision 13 rejected Garage partly for "losing SSM"; that reason no longer counts against
it, though the digest-pin and persistence reasons stand on their own.

---

### 50 — The base image pin is enforced by a gate that reads the Dockerfile

**Why.** Two digest rules already existed and neither one looked at a `FROM` line.
`policy/kubernetes/images.rego` reads the manifests before merge and the `require-pinned-images`
policy reads admission requests at runtime; both take a Kubernetes container image as their input.
Revert greeter's base image from `oven/bun:1.3.14-alpine@sha256:…` to the mutable tag and every gate
stays green. "Everything this platform runs is pinned to a digest" was enforced for the top layer and
asserted by convention for everything underneath it.

The pinned conftest has a native Dockerfile parser, so this is a third Rego policy set rather than
new tooling. It runs first, ahead of `policy`: it parses one file, and what it guards is the input to
`image-build`, the most expensive blocking gate. Blocking. Every `FROM` is judged, each unpinned
stage reported separately; `scratch` and references to an earlier stage are exempt, because there is
nothing in a registry to pin. A `${TAG}` fed from an `ARG` with a default is resolved; an `ARG` with
no default is its own finding, because an image chosen at build time cannot be pinned by reading the
file.

**Rejected.** *A third `POLICY_TARGETS` row on the existing `policy` gate* — that list maps a
directory to a policy set, this is one file with a different parser, and folding it in would hide the
severity, ordering and rationale the generated matrix states per gate. *hadolint* — a second linter
whose surface is mostly opinions this repository has no position on, to get one rule. *Leaving it to
admission* — impossible in principle: no Kubernetes object records what an image was built on.

**Cost.** A fourth place the digest rule is written, and the only one with no runtime counterpart, so
it is a merge-time check with nothing behind it. `ARG` resolution stops at one level — an `ARG`
defined in terms of another is denied rather than resolved. And the gate reads the repository-root
Dockerfile only, matching what `docker build .` consumes; an application that builds from somewhere
else is unchecked, and nothing says so.

---

### 51 — The manifest's config bucket name is checked against the module's convention

*Closes a cost accepted in 49.*

**Why.** 49 left the naming convention written twice — derived in HCL as
`"${var.app_name}-${var.environment}-config"`, restated as a literal in
`gitops/greeter/deployment.yaml` — with nothing linking them, and recorded that a Rego rule could
enforce it and was not written. It is written now, as two rules in the existing Kubernetes policy
set rather than a new gate: same parser, same directory, same input, same conftest invocation.

The expected name is bound to the workload's own `app.kubernetes.io/name` label, and the environment
segment must be one of the three values the module's `variables.tf` allows. So the application half
is anchored to something the object asserts about itself, not to a string in the rule. The second
rule denies a container that sets `CONFIG_BUCKET` on an object carrying no app label — without it,
the policy is switchable off per workload by deleting a line, and a skipped check and a passing check
look identical in the output.

**Rejected.** *Adding a `tarmac.io/environment` label so the rule could bind the environment exactly*
— the strongest-looking option and close to worthless: the label would be written by the same hand,
in the same file, as the value it checks, so it catches a typo in one of the two and nothing else, in
exchange for permanent required metadata on every workload. *A bare `^[a-z0-9-]+-config$` regex with
no app binding* — accepts `other-local-config`, the cross-application mistake most worth catching.
*Accepting any middle segment* — accepts `greeter-lcoal-config`; mirroring the enum costs one
duplicated set and catches the whole typo class. *Skipping the check when the app label is absent* —
above. *Generating the manifest's value from Terraform output* — the real fix, and much larger: it
means a templating step between `terraform output` and `gitops/`, and `gitops/` is deliberately plain
YAML that Argo CD reads with nothing in between.

**Cost.** A string-shape assertion, not a proof: it does not know the bucket exists, is reachable, or
holds the object — `/readyz` is still what finds that out. It does not bind the environment, so
`greeter-production-config` would pass in the local deployment. It cannot see a value arriving
through `envFrom` or `valueFrom`, which is asserted as a deliberate gap in a test rather than papered
over by denying a legitimate pattern. And the convention still lives in two languages, because Rego
cannot read HCL: this trades a manifest that can drift from the module for a rule that can, which is
the better failure only because the rule is tested and the manifest was not. The tests name all three
environments explicitly, so a fourth added to `variables.tf` breaks a test rather than a deploy. The
fuller fix — a companion rule in `policy/terraform/` asserting the module's own local still matches
the pattern — is not written.

---

### 52 — The naming expression is asserted from the Terraform side as well

*Completes 51.*

**Why.** 51's rule hard-codes `<app>-<environment>-config`, because Rego is handed parsed manifests
and never HCL. A hard-coded copy with no link back to the original does not stop working when the
original moves — it starts being confidently wrong, passing manifests that name a bucket Terraform no
longer creates. That is a worse failure than the one it replaced.

It is assertable, because conftest's parse of `main.tf` preserves the interpolation verbatim:
`locals` comes back as a list of blocks and `bucket_name` as the literal string
`"${var.app_name}-${var.environment}-config"`. So a rule in `policy/terraform/` can hold the module's
own expression to the shape the Kubernetes rule assumes, from the side that can actually see it. It
is matched as a pattern rather than by equality, so `${ var.app_name }` — legal HCL, and untouched by
`terraform fmt`, which does not reformat inside interpolations — is not reported as a change.

The message names `policy/kubernetes/config_bucket.rego` explicitly. That is the entire point of the
rule: it fires at the moment somebody changes the convention, and it tells them where the other half
is. A rule that just said "this does not match the expected pattern" would be a puzzle.

**Rejected.** *Scoping to the module by file path* — not available; without `--combine`, conftest
hands Rego one parsed document and nothing in it names the file. Scope had to be structural, and the
rule fires only on a `bucket_name` local that an `aws_s3_bucket` in the same document takes its name
from — which is better anyway, since a copy of this module in an application's own Terraform is
caught and an unrelated `bucket_name` local is not. *Anchoring on every `aws_s3_bucket` name
expression* — closes the rename dodge below, at the cost of holding every bucket in the estate to a
shape only the config bucket owes. *Generating the Kubernetes rule from the Terraform* — a codegen
step and a build artefact in git, to remove one line of duplication.

**Cost.** Renaming the local takes it out of scope and the rule reports nothing — a false negative
taken deliberately over a broad false positive, and stated in the rule itself. The environment enum
is still mirrored by hand, in `variables.tf` and again in the Kubernetes rule, so a fourth
environment is a two-file edit with only a failing test to prompt it. A name built inline or through
`format()` is invisible. And the rule asserts only that the Terraform side has not moved — never that
the Rego on the other side is right.

---

### 53 — The bucket-name rule is scoped by the module's signature, not by the local's name

*Supersedes the false negative accepted in 52.*

**Why.** 52 scoped the rule to a `bucket_name` local that an `aws_s3_bucket` takes its name from, and
accepted the consequence in writing: rename the local, and the rule silently stops having an opinion.
That is the worst shape a policy can take. It does not fail, it reports nothing, and nothing in the
output distinguishes "checked and clean" from "not looking" — the same failure this file objects to
everywhere else. The scope can be taken from the module's signature instead. Nothing else in the
estate writes an `aws_s3_object` with `for_each = var.config` into a bucket, so the rule follows that
bucket's own `${local.…}` reference to whichever local holds the name and holds *that* to the
convention, whatever it has been called.

**Rejected.** *Anchoring on every `aws_s3_bucket` name expression* — still rejected, for the reason 52
gave: it holds every bucket in the estate to a shape only the config bucket owes. The signature is a
third anchor 52 did not consider, and it is narrower than both of the two that were. *Leaving the false
negative documented* — the comment was honest, and a reader who has to be told the rule can be
switched off by a rename has been told the rule is optional.

**Cost.** The scope is now a property of the module's internals rather than its naming, so a module
that stops writing its config through `for_each = var.config` takes itself out of scope exactly as
quietly as a rename used to. The dodge has moved rather than closed; it now costs a change to what the
module does instead of what it calls things. Four tests pin the boundary, including a rename that
diverges from the convention and a rename that does not.

---

### 54 — The environment enum is checked from the Terraform side

*Closes a cost accepted in 52.*

**Why.** The list of valid environments is written three times: the `contains([…], var.environment)`
validation in `variables.tf`, and again in each of the two Rego rules that reason about the bucket
name. 52 accepted that and left a failing test as the only prompt to keep them in step. A test only
fails once somebody has already changed one copy and not the others, and only if they run it.
`policy/terraform/environments.rego` reads the validation out of the parsed HCL and denies when it
stops matching the list the Kubernetes rule mirrors, so a divergence is caught by the gate that
already runs on every change rather than by a suite somebody remembers.

A second rule denies a validation it cannot parse as a list. Without it, rewriting the validation into
a form the rule does not understand would be indistinguishable from agreement, and silence would stop
meaning "checked" — which is the property 53 was written to protect.

**Rejected.** *Generating one list from the other* — a codegen step and a build artefact in git,
rejected in 52 for the naming rule and no better here. *A shared data file both sides read* — Rego can
read one and HCL cannot, so it moves the mirror rather than removing it and adds a third file to keep
in step.

**Cost.** The rule knows the validation's shape, not its meaning: a validation expressed through
`can()` or a regex rather than `contains()` is unparseable, and reports as unparseable rather than
being checked. An application's own `environment` variable, declared with no validation at all, is
deliberately out of scope — the check covers the module, not every caller of it.

---

### 55 — The Kubernetes policy set is enforced by the platform's own pipeline

**Why.** `POLICY_TARGETS` maps `infra/` to `policy/terraform/` and `gitops/` to `policy/kubernetes/`.
An application repository has the first and never the second: there is no separate deployment
repository, and an application's manifests are written into *this* repository's `gitops/<app>/` by the
promoter, after the gates have passed. So over an application the Kubernetes rules load nothing. That
is the deployment topology rather than a hole — `self.yml` gates this repository with
`--only base-image,policy,infra` on every pull request and every push to the default branch, and
`secrets.rego` fires there today, with a standing finding against `gitops/local-aws/credentials.yaml`.

What was wrong was the reporting. A green Policy row read as though the whole of `policy/` had had an
opinion, and only a reader with the target list memorised would notice that half the rules never
loaded. Renaming `gitops/` would have silenced the Kubernetes set estate-wide with every pipeline
staying green. The gate now names the sets that did not run — `infra/: 1 finding(s), reported not
blocking (kubernetes rules not run: no gitops/)` — and a run with no targets at all is SKIPPED, not
PASSED.

**Rejected.** *Pointing the Kubernetes rules at a directory an application does not have* — it makes
the gate skip silently everywhere and enforce nothing, which is the failure this entry exists to
correct, applied to the whole estate instead of half of it. *Requiring every application to carry a
`gitops/`* — a second copy of cluster state, in a repository the platform does not control.

**Cost.** An application's manifest change is judged by the Kubernetes rules after the promotion
commit lands on the default branch, not before it. What makes that survivable is that the pre-merge
copy of those rules covers the manifests a human writes, and the promoter only ever rewrites an image
digest the publish gate already resolved. Second cost: the scope note is prose in a gate summary, so a
reader who does not read it still sees a green row.

---

### 56 — Image pinning follows `kubectl debug`; resource limits deliberately do not

**Why.** Both admission policies matched `pods`, and a rule naming a parent resource never matches a
subresource request. `kubectl debug` PATCHes `pods/ephemeralcontainers`, so it reached neither.
`require-pinned-images` now matches that subresource on UPDATE — but matching alone would have been
worse than not matching at all. Since 1.22 the subresource carries a whole Pod, so
`has(object.spec.template)` is false and the policy's `containers` variable resolves to the pod's
*original* containers, which were admitted at create time and are still compliant. Every debug
container would have passed a rule that looked like coverage. The variable therefore folds in
`ephemeralContainers`, behind a `has()` guard so that a plain Pod and a Deployment template — neither
of which carries the field — do not fail on a missing key under `failurePolicy: Fail`.

`require-resource-limits` does not match it, and cannot. Kubernetes refuses any request that sets
`resources` on an ephemeral container, so a rule demanding requests and limits there is unsatisfiable
by anybody: it would not police `kubectl debug`, it would ban it, with a message instructing the
operator to set a field the API server will reject. The reasoning sits in the policy file at the point
where the match would otherwise go, because its absence is the kind that reads as an oversight.

**Rejected.** *`pods/*`* — one rule covering every subresource at once, and it pulls in exec, log,
status and binding, whose request objects this CEL cannot read; under `failurePolicy: Fail` each
becomes a rejection by evaluation error. *Matching the subresource in `require-resource-limits` and
reading `containers` only* — it re-judges what was already judged at create time, and shows up as
coverage.

**Cost.** An ephemeral container consumes capacity that nothing accounts for, and nothing at admission
can change that. `kubectl debug` stays the one path by which a workload exceeds its resource budget
without a policy having an opinion — accepted because the alternative is removing the ability to debug
a running pod.

---

### 57 — The admission policies are tested by evaluating their CEL, without a cluster

**Why.** `policy/admission/` had no tests. `conftest verify` speaks Rego and never loaded it, so the
only thing that had ever exercised the CEL was the live refusal probe at install time (48) — which
proves each policy rejects one crafted object, once, and says nothing about the cases nobody thought to
install. The rules that need testing are the ones never shown to reject anything.

`admission.test.ts` reads the real YAML through `Bun.YAML.parse` and evaluates the real expressions
against crafted request objects, using a small interpreter for the CEL subset these two policies use.
Two properties of that interpreter are load-bearing: it throws on anything it does not implement —
unknown method, unknown global, undeclared name — and it reproduces CEL's rule that a missing field is
an error rather than undefined. Together they mean a policy that grows unmodelled syntax fails loudly
instead of passing vacuously, and four tests assert them of the interpreter itself. The match
constraints are flattened into a set and asserted too, so 56's subresource coverage cannot be removed
without a test naming it failing.

**Rejected.** *A CEL evaluation dependency* — the language has implementations, and taking a runtime
dependency to test two files whose expressions run to a few dozen tokens is a poor trade against
writing the subset. *A kind cluster in the suite* — the honest test, and it moves the suite from
milliseconds to minutes and makes it need Docker. *Golden-file assertions over the YAML* — they pin the
text rather than the behaviour, and would have passed the vacuous ephemeral-containers match in 56
without complaint.

**Cost.** The interpreter is not the API server. It does not type-check, it does not apply the
binding's namespace selector, and it is handed request objects rather than receiving them — so a policy
can pass every test here and still behave differently in a cluster, most plausibly on a request shape
nobody crafted. It is a second implementation of somebody else's semantics, and it will drift from
them. Against that: three deliberate breaks were each caught by exactly the test aimed at them, which
the install-time probe could not have done.

---

### 58 — The promoter's write guard names the event, not just the runner

**Why.** The promoter defaults to a dry run and has to be talked into writing. The condition that
does the talking used to be `GITHUB_ACTIONS === "true"`, which answers *am I on a runner* — and every
job in every workflow sets it. A pull_request run, a scheduled run, or some future job that calls the
promoter to preview a diff would all have satisfied it. What actually authorises a push is *am I the
release job of a merged change*, and until now the difference was held entirely by an `if:` in
`ci.yml`: outside the program, untestable, and invisible to anyone reading the promoter's own source.
Adding `GITHUB_EVENT_NAME === "push"` moves the derivable half of that condition into the code, costs
nothing — the release job already runs only on `push` — and turns a promoter invoked from a
pull_request job into a dry run rather than a deploy. It is decision 36's boundary restated one layer
down: the code should refuse, not merely never be asked.

**Rejected.** *Leave it to `ci.yml`* — the guard already worked in practice, and it worked because of
a file the promoter cannot see; a second caller is a rewrite of the security property with no test to
notice. *Require the branch too* — the strictest version, and the default branch's name lives in the
workflow context rather than the environment, so the program would have to be told what it is, which
is the caller asserting its own authority. *An explicit `--i-mean-it` flag* — unambiguous, and it puts
the decision to write in the hands of whoever composes the command line.

**Cost.** The guard is now a pair split across two files, and only one half is tested here. A push to
a side branch still satisfies the program; `ci.yml`'s `if:` is what stops it, so the two must move
together, and the comment above `writesAllowed` says so because nothing enforces it.

---

## Accepted costs, collected

Every cost accepted above, in one place.

| From | What we accepted |
|---|---|
| 1 | kind is the largest single consumer of the memory a laptop can spare, which is why observability is deferred rather than shipped |
| 2 | The pipeline visibly stops short of deploying, and reconciliation is poll-based because no webhook can reach a laptop |
| 4 | More upfront work than YAML, and Bun becomes a hard CI dependency |
| 5 | Cross-repo coordination, and a reusable workflow that must check out the platform repo itself or silently run against absent policies |
| 6 | CODEOWNERS has no enforcement teeth — a single account can't approve its own PR |
| 7 | `make up` needs internet, and every published image is public and permanent |
| 8 | LocalStack doesn't enforce IAM, so no least-privilege guardrail is honestly demonstrable |
| 9 | A GitHub App must be created, installed on both repos and its key stored — the only real credential in the design |
| 13 | A frozen, single-maintainer third-party image in the stack — pinned by digest, unpatched if a CVE lands |
| 14 | No merge-time deployment apply, no promotion path, no infra drift detection — nowhere to promote to |
| 10 | Deploy verification never reaches the PR; the evidence chain breaks at the last link |
| 10 | A known open Argo bug can make the smoke test pass against the previous version |
| 11 | Two policy languages, because one tool would be worse at one of the two jobs |
| 12 | No model in the merge path, so the change that passes every rule and is still wrong is caught by review rather than by a gate |
| 3 | Argo's UI rollback isn't available with automated sync; `git revert` is the only path |
| 15 | A younger bundler with a thin plugin ecosystem, and DOM-test globals that collide with the server's |
| 16 | No graceful degradation — an app that can't meet the three conventions can't ride the road at all |
| 17 | The first gate reports an environment failure as a gate failure on a cold runner |
| 18 | Action version comments next to SHA pins are unverified, and updates need a deliberate bump |
| 19 | The state-bucket bootstrap is emulator-specific and does not port to a real account |
| 20 | Minimum Terraform is 1.11, for state locking that does not need a second resource |
| 21 | Switching environments needs `init -reconfigure`; forgetting it points an apply at the wrong state |
| 22 | Two lines per environment exist only because of where it runs — path-style addressing |
| 23 | A shim for one runtime's non-standard endpoint variable, bypassable by constructing the client directly |
| 24 | Apps track the platform module by checkout path, so they pick up changes with no commit of their own |
| 25 | One piece of cluster state — the emulator's EndpointSlice — is generated by bootstrap rather than described in git |
| 26 | A retired ingress controller, on a cluster version it was never tested against, with no future security fixes |
| 27 | The resource allowlist is a second place to edit, and forgetting it surfaces as a sync error, not a missing object |
| 28 | A first bootstrap shows one application briefly failed, and convergence silently depends on selfHeal being on |
| 29 | Two routes for code into the cluster, and the fast one leaves no artefact to distinguish it from the slow one |
| 30 | A config object truncated to zero bytes deploys healthy and serves a default; only a value-asserting check catches it |
| 31 | Apps float on `@v1`, in direct tension with SHA-pinning third-party actions; a bad platform commit reaches everyone |
| 32 | `contents: write` is not path-scopable — the "only the image field" constraint is in code, not in the permission |
| 32 | Every deployment triggers one extra run of the platform's self-check, because App tokens trigger workflows |
| 33 | A second entry point, and a gate-to-promoter fact contract held together only by tests on both sides |
| 34 | A manual visibility click in an otherwise automated path, and it fails late as `ImagePullBackOff` |
| 35 | The inner loop costs a build, a push and a pull; a one-line change needs a commit and a CI run to be seen |
| 36 | A second runner per deployment, and a cross-job channel that is readable by anyone who can read the run |
| 37 | Two checkouts of one repository in one job, which reads as a mistake until the reason is known |
| 38 | The build gate now depends on registry state, and reports `skipped` on a re-run rather than `passed` |
| 39 | The break-glass is cluster-wide, nothing time-limits it, and digests queue up in git while it is held |
| 40 | CEL cannot look at another object, so provenance rules richer than a string test are out of reach |
| 40 | Admission judges requests, so a policy tightened today says nothing about what is already running |
| 41 | Rules match unresolved interpolation strings, so a bucket wired up through a variable could evade them |
| 42 | Six namespaces are unpoliced, and the exception list will grow with nobody scheduled to prune it |
| 43 | Nothing reverts a hand-deleted policy binding; `make status` reports it, which is not the same as fixing it |
| 43 | The cluster's rules are not fully described by git — a dent in the property the rest of the design leans on |
| 44 | Two known findings ship in a green pipeline, and only a person stops them being ignored forever |
| 45 | The design's cleanest claim is now a longer, more qualified one — the correct impression and a weaker headline |
| 46 | Twelve HIGH findings ship in a green pipeline; nothing counts them down and only a person acts on them |
| 46 | A credential baked into an image layer is not caught — the vulnerability scanner runs, the secret scanner does not |
| 46 | The scanner binary is pinned but its findings are not, so the same commit reports differently a month later |
| 47 | A ~120MB terraform download plus a much larger provider, on every run, to check a few dozen lines |
| 47 | No provider cache keyed on the lockfile, so CI pays that download every time |
| 47 | `validate` is local-only — it cannot tell you the apply will succeed, only that a typo will not be why it didn't |
| 47 | A laptop is not held to the version pin; that `fmt` and `validate` agree across minor versions is an assumption |
| 48 | A policy added without a matching probe is silently unproven, and the install still reports success |
| 48 | Each probe must satisfy every rule but its own, which gets harder with each policy added |
| 49 | The bucket-naming convention is written in HCL and again as a YAML literal — enforced since 51 |
| 50 | A fourth place the digest rule is written, and the only one with no runtime counterpart |
| 50 | `ARG` resolution stops at one level, and only the repository-root Dockerfile is read |
| 51 | A string-shape assertion, not a proof — it does not know the bucket exists or holds the object |
| 51 | The environment segment is not bound, so a production bucket name passes in the local deployment |
| 51 | The convention is mirrored in Rego, so a change to the module can leave the rule confidently wrong — caught since 52 |
| 52 | Renaming the `bucket_name` local takes the rule out of scope and it reports nothing — closed since 53 |
| 52 | The environment enum is still mirrored by hand, in `variables.tf` and again in the Rego — caught since 54 |
| 53 | A module that stops writing its config through `for_each = var.config` leaves scope as quietly as a rename once did |
| 54 | A validation expressed through `can()` or a regex is unparseable, and reports as that rather than being checked |
| 54 | An application's own `environment` variable, declared without a validation, is out of scope |
| 55 | An application's manifest change is judged by the Kubernetes rules after the promotion commit lands, not before it |
| 55 | The scope note is prose in a gate summary — a reader who skips it still sees a green row |
| 56 | An ephemeral container consumes capacity nothing accounts for, and nothing at admission can change that |
| 57 | The CEL interpreter is a second implementation of somebody else's semantics — no type checking, no namespace selector, and it will drift |
| 58 | The write guard is a pair split across two files, only one half of it tested, and a push to a side branch still satisfies the tested half |

## Rejected tools, collected

Flux, Dagger, Crossplane, Terragrunt, Argo CD Image Updater, an LLM review bot, a monorepo, a
dedicated deployments repo, a local container registry, a self-hosted runner, the LocalStack free
tier, MinIO, Garage, Vite, Vitest, Next.js, per-app pipeline config, composite actions,
major-version action tags, Terraform workspaces, a DynamoDB state lock table, `tflocal`, a provider
`endpoints` block, a bootstrap Terraform configuration, an AWS SDK dependency in the app, an
`ExternalName` Service, a CoreDNS rewrite rule, a legacy `v1` Endpoints object, an Argo CD
`ignoreDifferences` rule over an address that is locally allocated, a statically pinned container
address on the cluster network, Envoy Gateway and the Gateway API, a bare `NodePort` with no ingress
controller, Argo CD's `default` AppProject, an unrestricted `namespaceResourceWhitelist`, sync waves
for cross-application ordering, a Lua health check for the `Application` CRD, `CreateNamespace=true`,
`imagePullPolicy: Never`, a personal access token, a deploy key, a per-application SHA pin of the
reusable workflow, promotion as a gate, deploy-time manifest templating, an `imagePullSecret`,
a YAML round trip through a parser that discards comments, `secrets: inherit`, minting the deploy
token in the job that runs application code, passing the published digest as a build artifact,
a single platform checkout in the release job, `SOURCE_DATE_EPOCH` with buildx `rewrite-timestamp`,
a source-commit annotation in the deployment manifest, a flag to force a rebuild, side-loading images
into the cluster with `kind load`, `argocd app set --sync-policy none` as a break-glass, an Argo
ignore rule over the root Application, Kyverno, Gatekeeper, a validating webhook of our own,
`terraform plan` JSON as the policy input, tfsec and Checkov as the policy set, an opt-in namespace
label for admission scope, an explicit in-scope namespace list, an Argo CD `Application` over the
admission policies, an exemption list for the one file that fails, an admission rule keyed on Argo's
tracking label, `trivy --exit-code` as the blocking decision, a gate whose severity depends on what
it found, blocking on CRITICAL while reporting HIGH, a second image-level secret scanner, Grype and
Docker Scout, `hashicorp/setup-terraform`, OpenTofu, two lines of workflow YAML instead of a gate,
separate gates for `fmt` and `validate`, `make infra-fmt` as the CI entry point, a randomised
`TF_DATA_DIR`, a fixed sleep after applying the admission policies, polling a policy's status to
decide it is enforcing, a single admission probe breaking every rule at once, an app-side lookup of
the config bucket name, deploy-time injection of that name, hadolint, a third `POLICY_TARGETS` row
for the Dockerfile policy set, a `tarmac.io/environment` label added so a policy could check itself,
a bucket-name regex with no application binding, generating the manifest's bucket name from Terraform
output, a policy rule anchored on every `aws_s3_bucket` name expression, generating the Kubernetes
rule from the Terraform, generating one environment list from the other, a shared data file both the
HCL and the Rego read, pointing the Kubernetes rules at a directory an application does not have,
requiring every application to carry a `gitops/`, `pods/*` as an admission match, matching the
ephemeral-containers subresource in the resource-limits policy, a CEL evaluation dependency, a kind
cluster in the test suite, golden-file assertions over the policy YAML.
Reasons are in the entries above.
