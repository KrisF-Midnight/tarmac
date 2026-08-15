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
| Docker | runs the cluster and the local AWS stand-in | Docker Desktop |
| kind | the Kubernetes cluster | `brew install kind` |
| kubectl | talks to it | `brew install kubectl` |

Later stages add `bun`, `terraform`, `tflocal`, `conftest`, `kyverno`, `trivy` and `argocd`.

## Getting started

```
make up       # bring the platform up
make status   # what is running
make down     # tear it back down
```

`make` on its own lists the available targets.

Both `up` and `down` are safe to re-run: `up` reuses an existing cluster rather than failing,
`down` on an absent one is a no-op.

## Layout

| Path | Contains |
|---|---|
| `kind/` | cluster definition, node image pinned by digest |
| `scripts/` | the steps behind the Makefile targets |

## Status

Early. The cluster lifecycle is in place; the pipeline, policies, IaC and GitOps delivery
land on top of it.
