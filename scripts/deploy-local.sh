#!/usr/bin/env bash
# Build the application and put the image inside the cluster, without a registry.
#
# This is the inner loop, and it is the one place in the repository where
# something reaches the cluster other than by a commit. That is a deliberate
# exception with a narrow scope: it replaces the bytes that the `greeter:local`
# tag resolves to, and nothing else. The Deployment, its image reference, and
# every other field still come from git — so this can change what runs, but not
# how it is configured or whether it is deployed at all.
#
# The real path is a registry: CI builds, pushes to GHCR by digest, and writes
# the digest into gitops/. This exists because waiting on a push and a pull to
# see a one-line change is a bad trade in a local loop, not because the registry
# path is missing.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
require_cmd kind    "brew install kind"
require_cmd kubectl "brew install kubectl"

app_dir="${1:-$REPO_ROOT/../greeter}"
IMAGE="${IMAGE:-greeter:local}"

[[ -d "$app_dir" ]] || die "no application checkout at $app_dir.
     Pass one: make deploy-local APP_DIR=/path/to/greeter"
app_dir="$(cd "$app_dir" && pwd)"

[[ -f "$app_dir/Dockerfile" ]] || die "$app_dir has no Dockerfile, so there is nothing to build."

cluster_exists || die "cluster '$CLUSTER_NAME' does not exist. Run 'make up'."

# --load is implicit for the default builder, but not for a docker-container
# driver, and a developer with buildx configured that way would otherwise get a
# successful build and an image that is nowhere. Named tag only: the digest is
# CI's business.
log "building $IMAGE from $app_dir"
docker build --tag "$IMAGE" "$app_dir"

# The cluster's containerd, not the host's docker. Without this the kubelet has
# no such image, and because the manifest sets imagePullPolicy: IfNotPresent it
# fails with ErrImageNeverPull rather than reaching out to a registry that does
# not have a `local` tag either.
log "loading $IMAGE into cluster '$CLUSTER_NAME'"
kind load docker-image "$IMAGE" --name "$CLUSTER_NAME"

# The tag did not change, so nothing in the cluster has any reason to notice.
# A restart is what makes the new bytes take effect — and it goes through the
# Deployment's own rolling update, so this exercises the same surge-before-
# terminate path a real release does rather than deleting pods.
if kc get deployment/greeter --namespace "$APP_NAMESPACE" >/dev/null 2>&1; then
  log "restarting the deployment to pick up the new image"
  kc rollout restart deployment/greeter --namespace "$APP_NAMESPACE" >/dev/null
  if ! kc rollout status deployment/greeter --namespace "$APP_NAMESPACE" --timeout=180s; then
    kc get pods --namespace "$APP_NAMESPACE"
    die "the new image did not become ready, and the old pods are still serving.
     That is the rolling update doing its job. Logs:
       kubectl -n $APP_NAMESPACE logs -l app.kubernetes.io/name=greeter --tail=50"
  fi
else
  warn "no greeter deployment in namespace '$APP_NAMESPACE' yet, so the image is
       loaded but nothing is running it. The Deployment comes from git, via Argo
       CD — check 'kubectl -n argocd get app' if you expected it to be there."
fi

log "$IMAGE is live in cluster '$CLUSTER_NAME'"
