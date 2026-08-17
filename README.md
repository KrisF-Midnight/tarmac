# tarmac

The paved road: the shared platform that application teams ship on top of.

Application repositories consume this platform rather than reimplementing it. They get a
tested set of quality gates, policy enforcement in CI and again at cluster admission,
infrastructure-as-code for their dependencies, and GitOps delivery — by calling a versioned
workflow, not by copying YAML.

A local environment stands in for the cloud, so the whole road can be run end to end on a
laptop with no cloud account.

## Prerequisites

| Tool | Purpose | Install |
|---|---|---|
| Docker | runs the cluster, the image builds and the local AWS stand-in | Docker Desktop |
| Bun | runs the gates | `brew install bun` |
| kind | the Kubernetes cluster | `brew install kind` |
| kubectl | talks to it | `brew install kubectl` |
| Terraform | provisions the applications' cloud dependencies, 1.11 or newer | `brew install terraform` |

Later stages add `conftest`, `kyverno` and `trivy`. Argo CD is not on this list on purpose:
`make up` installs it into the cluster, so it costs nothing on the host.

Nothing here needs an AWS account, AWS credentials, or the AWS CLI. The stand-in accepts any
credentials and `make up` supplies throwaway ones, so a mistake in this stack cannot reach an
account that charges money.

## Getting started

```
make up         # bring the platform up and provision ../greeter's dependencies
make status     # what is running
make ci         # run the gates against ../greeter
make infra      # re-provision after changing the Terraform
make infra-plan # what provisioning would change, without changing it
make down       # tear it back down
```

`make` on its own lists the available targets. `ENV=<name>` selects an environment for the
`infra` targets; it defaults to `local`.

All of these are safe to re-run: `up` reuses an existing cluster rather than failing, `down` on
an absent one is a no-op, and a second `make infra` reports no changes.

`make down` keeps the local AWS stand-in's data volume, so Terraform state survives a teardown.
`scripts/localstack-down.sh --purge` discards it, which means the next `up` starts from nothing.

## Riding the road

An application repository's entire CI is a call to the platform's reusable workflow:

```yaml
jobs:
  ci:
    uses: <owner>/tarmac/.github/workflows/ci.yml@v1
    with:
      platform-ref: v1
```

In exchange the application provides three things and nothing else:

| The application provides | Used by |
|---|---|
| a `typecheck` script in `package.json` | the Types gate |
| a `test` script in `package.json` | the Unit tests gate |
| a `Dockerfile` at the repository root | the Image build and Image publish gates |

There is no per-application configuration file. The moment applications start configuring
the road, it stops being paved.

Before an application can make that call, the deployment identity has to exist and its
credentials have to be in the application repository. That is one-time setup, and it is
written down in [docs/onboarding.md](docs/onboarding.md) — including the two steps that are
web-UI clicks rather than code, and why neither can be automated.

## Gates

The same entrypoint runs on a laptop and in CI — `make ci` and the workflow both call
`gates/src/cli.ts` with the same arguments, so a green run locally means what a green run on
the pull request means.

Gates are either **blocking** or **reporting**. A blocking failure fails the required check;
a reporting failure is surfaced on the pull request and never stops it, so ignoring one is a
decision somebody made rather than one nobody saw. The current classification, and the
reasoning behind each, is in [docs/gate-matrix.md](docs/gate-matrix.md) — generated from the
registry by `make gate-matrix`, and checked in CI so it cannot drift from the code.

The logic lives in TypeScript rather than in workflow steps for two reasons: it can be unit
tested, and it can be run before a pull request exists. `make test` runs that suite.

Useful while iterating:

```
make ci APP_DIR=../notifier      # gate a different application
bun gates/src/cli.ts --app-dir ../greeter --only typecheck
bun gates/src/cli.ts --help
```

## Layout

| Path | Contains |
|---|---|
| `.github/workflows/ci.yml` | the reusable workflow application repos call |
| `.github/workflows/self.yml` | the platform gating itself |
| `gates/` | gate logic and its test suite |
| `infra/modules/` | the Terraform modules application repositories consume |
| `kind/` | cluster definition, node image pinned by digest |
| `localstack/` | the local AWS stand-in: compose file, environment, state-bucket bootstrap |
| `scripts/` | the steps behind the Makefile targets |
| `docs/` | onboarding, the gate matrix and the decision record |

## Infrastructure

An application declares its cloud dependencies in its own `infra/` directory by calling a
platform module — see [`infra/modules/app-dependencies`](infra/modules/app-dependencies). The
module decides what a bucket looks like; the application decides only that it wants one.

Two properties are worth knowing:

**The Terraform is not shaped by where it runs.** Region, credentials and endpoint all arrive
through the standard `AWS_*` environment variables, so the same configuration would run against
a real account. There is no endpoint override and no branch on environment; per-environment
values live in `env/<name>.backend.hcl` and `env/<name>.tfvars` beside the configuration.

**State is real.** The backend is S3 on the stand-in, locked with a lock object rather than a
DynamoDB table, and it survives a restart. The state bucket itself is created by an init hook
running inside the stand-in, because a backend cannot create the bucket it stores its own state
in — which is also why bringing the platform up needs no AWS CLI on the host.

There is no `terraform apply` in CI, and there should not be: CI's copy of the stand-in dies with
the job, so an apply there would provision something and destroy it in the same breath. Terraform
owns what lives outside the cluster, Argo owns what lives inside it.

There is no `terraform plan` in CI either, and that one is a gap rather than a decision. The checks
that belong there — a plan rendered on the pull request, `terraform validate`, and a `terraform
test` over the module — exist today only as `make infra-plan` and `make infra-fmt`, which run on a
laptop and are not required by anything. A change to a shared module can currently reach `main`
without a plan ever having been read.

## Breaking glass

Nothing here deploys to the cluster. The only path in is a commit: CI writes an image digest
into `gitops/`, Argo CD reconciles it, and `selfHeal` reverts anything edited by hand. That is
the property the design rests on, and it is also the one that hurts during an incident, when the
fix is understood but not yet merged.

```
make suspend    # stop Argo CD reconciling — kubectl edits now stick
make resume     # hand the cluster back to git, reverting those edits
```

Two things about this are deliberate:

**It stops the reconciler, not an application.** Clearing `syncPolicy.automated` on one
Application — what `argocd app set --sync-policy none` does — does not work here, because the
Applications are themselves reconciled by `root`, which has `selfHeal` too. Argo would restore
the policy within minutes and quietly resume deploying. Scaling the controller down cannot be
undone by the thing it turns off.

**It is cluster-wide, and `make status` says so on every run.** An emergency lever should be one
switch that is obviously on or obviously off, not a per-application setting somebody has to
remember the state of. The cost is real: while suspended, nothing reconciles for anything, and
digests the pipeline writes queue up in git undeployed.

Anything worth keeping has to be committed *before* `make resume`, not after — resume reverts
every hand edit at once.

## Status

The cluster lifecycle, the gate pipeline, application infrastructure and GitOps delivery are in
place: a commit to an application repository reaches the cluster without anyone touching it.
Policy enforcement lands on top of them, and the gaps named above — Terraform checks in CI,
security scanning — are open rather than answered.
