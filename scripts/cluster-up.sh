#!/usr/bin/env bash
# Create the local Kubernetes cluster. Idempotent: safe to run on an existing
# cluster, which matters because `make up` will grow more steps after this one
# and a developer will end up re-running the whole thing.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
require_cmd kind    "brew install kind"
require_cmd kubectl "brew install kubectl"

if cluster_exists; then
  log "cluster '$CLUSTER_NAME' already exists, reusing it"
else
  log "creating cluster '$CLUSTER_NAME'"
  kind create cluster --config "$REPO_ROOT/kind/cluster.yaml" --wait 120s
fi

kubectl config use-context "kind-$CLUSTER_NAME" >/dev/null

# No ingress-ready label. It used to be applied here, because the upstream
# kind manifest carried a nodeSelector on it — that selector was dropped in
# controller-v1.13.0, and what actually schedules the controller onto a
# single-node cluster is its control-plane tolerations. The label selected
# nothing and gated nothing, which is worse than absent: it read as the
# mechanism. What is still required is the extraPortMappings in kind/cluster.yaml,
# because the controller binds hostPort 80/443 on the node.

log "waiting for the node to be ready"
kubectl wait --for=condition=Ready node --all --timeout=120s >/dev/null

log "cluster is up"
kubectl get nodes -o wide
