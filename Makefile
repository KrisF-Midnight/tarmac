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

.PHONY: help up down status ci test typecheck gate-matrix check-gate-matrix \
        infra infra-plan infra-fmt ingress argocd aws-endpoint deploy-local

help: ## Show the available targets
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# Order matters and is the same order the real thing has: somewhere to run, then
# the dependencies outside the cluster, then the way in, then the reconciler that
# deploys the workloads. The workloads themselves are not here — they arrive
# because Argo CD reads gitops/, which is the whole point.
#
# Every step is idempotent, because this is the target a newcomer re-runs when
# something looks wrong.
up: ## Bring the local platform up
	@./scripts/cluster-up.sh
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

# The inner loop, and the one thing here that is not GitOps. It builds APP_DIR
# and pushes the image straight into the cluster's image store, so a code change
# is testable without a registry round trip or a commit. The deployed manifest
# still comes from git — this only replaces the bytes the tag resolves to, which
# is why it ends with a restart rather than an edit.
deploy-local: ## Build APP_DIR and load it into the cluster, bypassing the registry
	@./scripts/deploy-local.sh $(APP_DIR)

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
	@bun gates/src/cli.ts --app-dir $(APP_DIR)

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
