# The platform's verb surface. Everything a developer or a newcomer needs to do
# is a target here, so there is one place to look rather than a README full of
# copy-pasteable command lines.

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

# Which application `make ci` gates. Defaults to a sibling checkout, which is
# how the two repos sit on a laptop; CI passes the path of its own checkout.
APP_DIR ?= ../greeter

.PHONY: help up down status ci test typecheck gate-matrix check-gate-matrix

help: ## Show the available targets
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

up: ## Bring the local platform up
	@./scripts/cluster-up.sh

down: ## Tear the local platform down
	@./scripts/cluster-down.sh

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
