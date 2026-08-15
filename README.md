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

Later stages add `terraform`, `tflocal`, `conftest`, `kyverno`, `trivy` and `argocd`.

## Getting started

```
make up       # bring the platform up
make status   # what is running
make ci       # run the gates against ../greeter
make down     # tear it back down
```

`make` on its own lists the available targets.

Both `up` and `down` are safe to re-run: `up` reuses an existing cluster rather than failing,
`down` on an absent one is a no-op.

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
| `kind/` | cluster definition, node image pinned by digest |
| `scripts/` | the steps behind the Makefile targets |
| `docs/` | the gate matrix and the decision record |

## Status

Early. The cluster lifecycle and the gate pipeline are in place; policies, IaC and GitOps
delivery land on top of them.
