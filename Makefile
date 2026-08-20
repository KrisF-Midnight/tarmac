# The platform's verb surface. Everything a developer or a newcomer needs to do
# is a target here, so there is one place to look rather than a README full of
# copy-pasteable command lines.

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

# Which application `make ci` gates. Defaults to a sibling checkout, which is
# how the two repos sit on a laptop; CI passes the path of its own checkout.
APP_DIR ?= ../greeter

# Which environment `make infra` provisions. Selects a backend config, so state
# for one environment can never be written over another's.
ENV ?= local

# The application being gated or promoted. Derived from APP_DIR so there is one
# thing to set, not two that can disagree.
APP ?= $(notdir $(patsubst %/,%,$(APP_DIR)))

# Where a gate run leaves what it found, and where promotion reads it from.
# Outside the tree on purpose: it is the output of one run, not a file the
# repository has an opinion about.
FACTS ?= /tmp/tarmac-facts.json

.PHONY: help up down status ci test typecheck gate-matrix check-gate-matrix \
        infra infra-plan infra-fmt ingress argocd aws-endpoint suspend resume promote \
        admission policy policy-test security

help: ## Show the available targets
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# Order matters and is the same order the real thing has: somewhere to run, the
# rules that govern what may run there, then the dependencies outside the
# cluster, then the way in, then the reconciler that deploys the workloads. The
# workloads themselves are not here — they arrive because Argo CD reads gitops/,
# which is the whole point.
#
# Admission comes second, immediately after the cluster exists and before
# anything has been deployed into it. A policy installed after the workloads is
# a policy that never saw them.
#
# Every step is idempotent, because this is the target a newcomer re-runs when
# something looks wrong.
up: ## Bring the local platform up
	@./scripts/cluster-up.sh
	@./scripts/admission-up.sh
	@./scripts/localstack-up.sh
	@$(MAKE) --no-print-directory infra
	@./scripts/ingress-up.sh
	@./scripts/argocd-up.sh
	@./scripts/aws-endpoint-up.sh

down: ## Tear the local platform down
	@./scripts/localstack-down.sh
	@./scripts/cluster-down.sh

ingress: ## Install or re-apply the ingress controller
	@./scripts/ingress-up.sh

argocd: ## Install Argo CD and point it at gitops/
	@./scripts/argocd-up.sh

# Needed again after every emulator restart: the container's address on the
# cluster network is assigned by Docker and is not stable across restarts. `make
# status` says when it has gone stale, so this is the fix that follows.
aws-endpoint: ## Regenerate the emulator's EndpointSlice from its current address
	@./scripts/aws-endpoint-up.sh

# The only way to change the cluster without a commit, and it does not deploy
# anything — it stops Argo CD reverting what you do by hand, then puts it back.
# Deliberately a pair: an off switch with no on switch beside it is how a cluster
# ends up drifting for a week because somebody fixed an incident and went home.
suspend: ## Break glass: stop Argo CD reconciling, so kubectl edits stick
	@./scripts/reconcile.sh suspend

resume: ## Hand the cluster back to git, reverting anything edited by hand
	@./scripts/reconcile.sh resume

admission: ## Install or re-apply the cluster's admission policies
	@./scripts/admission-up.sh

# The pre-merge half of the same rules, run on its own. `make ci` runs it too,
# as the first gate — this is the shortcut for when policy is the thing being
# worked on and the rest of the pipeline is noise.
policy: ## Run the policy gate against APP_DIR
	@bun gates/src/cli.ts --app-dir $(APP_DIR) --only policy

# The policies' own tests. Rules that have never been shown to reject anything
# are indistinguishable from rules that do not work, so these run in CI beside
# the platform's TypeScript tests rather than as an optional extra.
policy-test: ## Run the policy unit tests
	@conftest verify --policy policy/kubernetes
	@conftest verify --policy policy/terraform

# Needs an image to scan, so it is `make ci` minus everything except the build
# — running `--only security` alone would scan whatever that tag pointed at last
# time, which is the one result worse than no result.
security: ## Scan APP_DIR's image, as the pipeline's reporting gate does
	@bun gates/src/cli.ts --app-dir $(APP_DIR) --only image-build,security

infra: ## Provision APP_DIR's cloud dependencies
	@./scripts/infra-apply.sh $(APP_DIR) $(ENV)

infra-plan: ## Show what provisioning APP_DIR would change
	@./scripts/infra-plan.sh $(APP_DIR) $(ENV)

infra-fmt: ## Check Terraform formatting across the platform and APP_DIR
	@terraform fmt -check -recursive -diff infra
	@terraform fmt -check -recursive -diff $(APP_DIR)/infra

status: ## Show what is currently running
	@./scripts/status.sh

ci: ## Run the gates against APP_DIR, exactly as CI does
	@bun gates/src/cli.ts --app-dir $(APP_DIR) --facts-out $(FACTS)

# The other half of the pipeline, and deliberately not one of the gates: the
# gates read and return a verdict, this one edits a manifest and pushes. Running
# it here can only ever print what it would do — it writes inside GitHub Actions
# and nowhere else, which is why `make ci` cannot deploy anything.
promote: ## Show what promoting APP's published digest into gitops/ would change
	@bun promote/src/cli.ts --facts $(FACTS) --app $(APP)

test: ## Run the platform's own test suite
	@bun test

typecheck: ## Typecheck the platform
	@bun run typecheck

gate-matrix: ## Regenerate docs/gate-matrix.md from the gate registry
	@bun gates/src/matrix.ts docs/gate-matrix.md

# The matrix is documentation that claims to describe the code. A stale one is
# worse than none, so CI regenerates it and fails if the tree disagrees.
check-gate-matrix: ## Fail if the committed gate matrix is out of date
	@bun gates/src/matrix.ts /tmp/gate-matrix.md >/dev/null
	@diff -u docs/gate-matrix.md /tmp/gate-matrix.md \
		|| { echo "docs/gate-matrix.md is stale — run 'make gate-matrix'"; exit 1; }
