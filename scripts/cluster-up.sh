#!/usr/bin/env bash
# Create the local Kubernetes cluster. Idempotent: safe to run on an existing
# cluster, which matters because `make up` will grow more steps after this one
# and a developer will end up re-running the whole thing.

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

# Applied here rather than as a kubeadm patch in cluster.yaml. Kubernetes 1.31+
# moved kubeadm to v1beta4, where kubeletExtraArgs is a list of name/value pairs
# instead of a map — the form every ingress-nginx guide still shows silently
# stopped parsing. A label is the same outcome with nothing to keep in sync.
log "labelling node for ingress"
kubectl label node "$CLUSTER_NAME-control-plane" ingress-ready=true --overwrite >/dev/null

log "waiting for the node to be ready"
kubectl wait --for=condition=Ready node --all --timeout=120s >/dev/null

log "cluster is up"
kubectl get nodes -o wide
