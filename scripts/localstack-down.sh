#!/usr/bin/env bash
# Stop the local AWS stand-in. Idempotent: a no-op if it was never started.
#
# The data volume survives by default. State is the one thing here that cannot
# be rebuilt by re-running something, and a `make down` that silently discarded
# it would make the next `make up` look like a first run when it is not. Pass
# --purge to remove it deliberately.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker

purge=false
[[ "${1:-}" == "--purge" ]] && purge=true

if $purge; then
  warn "removing the stand-in's data volume — Terraform state will be lost"
  compose down --volumes
  log "the local AWS stand-in is down, data discarded"
else
  compose down
  log "the local AWS stand-in is down, data kept"
fi
