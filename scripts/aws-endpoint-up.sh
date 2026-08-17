#!/usr/bin/env bash
# Bind the in-cluster `aws` Service to the emulator's current address.
#
# This is the one object in the cluster that git does not describe, and the
# omission is deliberate (decision 25). The Service half is desired state and
# lives in gitops/ — it carries a name and a port and is identical on every
# machine. The address half is decided locally by Docker's address allocation
# and container start order, so committing it would put a value in git that is
# false on most machines. Worse, the reconciler would re-assert that false value
# on every sync, and the symptom is a pod that never becomes ready with nothing
# in any log naming DNS or address allocation as the cause.
#
# So it is generated here, on every `make up`, from the live container.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
require_cmd kubectl "brew install kubectl"

localstack_running || die "the local AWS stand-in is not running. Run 'make up'."

# The namespace is created by gitops/, but this script runs during bootstrap and
# may land before the reconciler has synced anything. Create it if absent rather
# than ordering the two: an EndpointSlice whose Service does not exist yet is
# inert and harmless, and starts serving the moment the Service appears.
kc get namespace "$APP_NAMESPACE" >/dev/null 2>&1 \
  || kc create namespace "$APP_NAMESPACE" >/dev/null

ip="$(localstack_cluster_ip)"
if [[ -z "$ip" ]]; then
  die "the stand-in is not attached to the 'kind' network, so no pod can reach it.
       Run 'make up' — localstack-up.sh attaches it once the cluster exists."
fi

log "pointing $AWS_SERVICE_NAME.$APP_NAMESPACE at the stand-in on $ip"

# EndpointSlice rather than a v1 Endpoints object: the latter still works on this
# cluster and is auto-mirrored, but has been deprecated since 1.33 and warns on
# every apply. The service-name label is what associates the slice with the
# selectorless Service — there is no owner reference and no controller involved.
kc apply --server-side --force-conflicts -f - <<YAML >/dev/null
apiVersion: discovery.k8s.io/v1
kind: EndpointSlice
metadata:
  name: ${AWS_SERVICE_NAME}-emulator
  namespace: ${APP_NAMESPACE}
  labels:
    kubernetes.io/service-name: ${AWS_SERVICE_NAME}
    app.kubernetes.io/managed-by: tarmac-bootstrap
  annotations:
    tarmac.dev/generated-by: scripts/aws-endpoint-up.sh
    tarmac.dev/why-not-in-git: >-
      The address is allocated by the local Docker daemon and is not true on
      another machine. See docs/decisions.md, decision 25.
addressType: IPv4
ports:
  - name: http
    port: 4566
    protocol: TCP
endpoints:
  - addresses: ["${ip}"]
    conditions:
      ready: true
YAML

# The slice is only half the pair. If the Service is missing the name still does
# not resolve, and the failure is indistinguishable from this script not having
# run — so say which half is absent instead of reporting success.
if ! kc get service "$AWS_SERVICE_NAME" -n "$APP_NAMESPACE" >/dev/null 2>&1; then
  warn "Service '$AWS_SERVICE_NAME' does not exist in namespace '$APP_NAMESPACE' yet."
  warn "The address is recorded, but the name resolves only once the reconciler"
  warn "syncs gitops/. This is expected during a first bootstrap."
  exit 0
fi

log "$AWS_SERVICE_NAME.$APP_NAMESPACE resolves to the stand-in"
