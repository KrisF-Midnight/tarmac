#!/usr/bin/env bash
# Install the ingress controller, so that the application is reachable from a
# browser on the host rather than only through kubectl port-forward.
#
# Idempotent: re-applying the same pinned manifest is a no-op, which matters
# because `make up` runs the whole chain and a developer will re-run it.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
require_cmd kubectl "brew install kubectl"

cluster_exists || die "cluster '$CLUSTER_NAME' does not exist. Run 'make up'."

manifest="$(mktemp -t ingress-nginx.XXXXXX.yaml)"
# shellcheck disable=SC2064
trap "rm -f '$manifest'" EXIT

log "fetching ingress-nginx $INGRESS_NGINX_VERSION"
fetch_pinned "$INGRESS_NGINX_MANIFEST_URL" "$INGRESS_NGINX_MANIFEST_SHA256" "$manifest"

# Server-side apply throughout. Client-side apply stores the whole object in a
# last-applied-configuration annotation, which overflows the annotation size
# limit on large upstream manifests — a failure that reads as a validation error
# and has nothing to do with the manifest being wrong.
log "installing ingress-nginx"
kc apply --server-side --force-conflicts -f "$manifest" >/dev/null

# The admission webhook is the part that matters for what comes next: until its
# certificate job has run and the endpoints exist, applying an Ingress fails with
# a webhook connection error. Argo CD would retry and eventually succeed, but the
# first sync would be red for a reason that looks like a broken manifest.
log "waiting for the admission webhook to be ready"
kc wait --namespace ingress-nginx \
  --for=condition=Complete job/ingress-nginx-admission-create \
  --timeout=120s >/dev/null 2>&1 || true

log "waiting for the controller to be ready"
if ! kc wait --namespace ingress-nginx \
  --for=condition=Available deployment/ingress-nginx-controller \
  --timeout=180s >/dev/null; then
  kc get pods --namespace ingress-nginx
  die "the ingress controller did not become ready. Output above."
fi

log "ingress-nginx is up, reachable on http://localhost:8080"
