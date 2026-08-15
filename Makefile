# The platform's verb surface. Everything a developer or a reviewer needs to do
# is a target here, so there is one place to look rather than a README full of
# copy-pasteable command lines.

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

.PHONY: help up down status

help: ## Show the available targets
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

up: ## Bring the local platform up
	@./scripts/cluster-up.sh

down: ## Tear the local platform down
	@./scripts/cluster-down.sh

status: ## Show what is currently running
	@./scripts/status.sh
