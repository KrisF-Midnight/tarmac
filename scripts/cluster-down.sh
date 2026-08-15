#!/usr/bin/env bash
# Tear the cluster down. Idempotent: a no-op if it was never created.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
require_cmd kind "brew install kind"

if cluster_exists; then
  log "deleting cluster '$CLUSTER_NAME'"
  kind delete cluster --name "$CLUSTER_NAME"
  log "cluster is down"
else
  log "cluster '$CLUSTER_NAME' does not exist, nothing to do"
fi
