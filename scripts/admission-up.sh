#!/usr/bin/env bash
# Install the admission policies, so the cluster refuses what the pipeline is
# supposed to have caught — including changes that never went near the pipeline.
#
# These are ValidatingAdmissionPolicies: CEL evaluated inside the API server,
# with no controller to install and no webhook certificate to rotate. See
# policy/admission/ for the rules themselves and docs/decisions.md for why this
# rather than a policy engine.
#
# Idempotent: re-applying the same objects is a no-op, which matters because
# `make up` runs the whole chain and a developer will re-run it.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
require_cmd kubectl "brew install kubectl"

cluster_exists || die "cluster '$CLUSTER_NAME' does not exist. Run 'make up'."

log "applying admission policies"
kc apply --server-side --force-conflicts -f "$REPO_ROOT/policy/admission" >/dev/null

# Applied is not the same as enforcing.
#
# The API server picks policies up through an informer, so for a short window
# after the apply returns the object exists and requests are still admitted
# unchecked. This was found the hard way: a probe run immediately after the
# apply was admitted, and looked like a broken policy rather than a race.
#
# So the script does not report success until it has watched the cluster reject
# something. The probes are deliberately non-compliant pods, sent with
# --dry-run=server: they go through the full admission chain and create nothing.
# `default` is used on purpose — it is in scope for the bindings and carries no
# Pod Security label, so nothing else can reject the pod first and mask the
# answer.
#
# There is one probe per policy, and each one breaks exactly that policy's rule
# and satisfies the other. A single pod breaking both would prove less, not
# more: the API server reports one denial and picks whichever policy it reached
# first, so a probe that violates both cannot tell you which of the two is
# actually enforcing — and the check would pass with one of them dead.
probe_dir="$(mktemp -d -t admission-probe.XXXXXX)"
# shellcheck disable=SC2064
trap "rm -rf '$probe_dir'" EXIT

# Pinned by tag, not by digest — but with complete resources, so only the
# pinned-images policy has anything to say about it.
cat >"$probe_dir/pinned-images.yaml" <<'YAML'
apiVersion: v1
kind: Pod
metadata:
  name: tarmac-admission-probe-image
  namespace: default
spec:
  containers:
    - name: probe
      image: docker.io/library/busybox:1
      resources:
        requests: { cpu: 10m, memory: 16Mi }
        limits: { cpu: 10m, memory: 16Mi }
YAML

# Correctly pinned by digest — the digest is not real, but nothing pulls the
# image on a dry run — and carrying no resources, so only the resource-limits
# policy has anything to say about it.
cat >"$probe_dir/resource-limits.yaml" <<'YAML'
apiVersion: v1
kind: Pod
metadata:
  name: tarmac-admission-probe-resources
  namespace: default
spec:
  containers:
    - name: probe
      image: ghcr.io/tarmac/probe@sha256:0000000000000000000000000000000000000000000000000000000000000000
YAML

probe_rejected() {
  local policy="$1" out
  # A successful apply means the pod was admitted: not enforcing yet. A failure
  # only counts if the named policy is the thing that said no — any other error
  # is a cluster problem being mistaken for a working policy.
  out="$(kc apply --dry-run=server -f "$probe_dir/$policy.yaml" 2>&1)" && return 1
  grep -q "tarmac-require-$policy" <<<"$out"
}

log "waiting for the policies to start enforcing"
deadline=$((SECONDS + 60))
for policy in pinned-images resource-limits; do
  until probe_rejected "$policy"; do
    if ((SECONDS >= deadline)); then
      kc get validatingadmissionpolicy,validatingadmissionpolicybinding
      die "tarmac-require-$policy is installed but is not rejecting a pod that breaks it. Output above."
    fi
    sleep 1
  done
done

log "admission policies are enforcing: $(kc get validatingadmissionpolicy -o name | wc -l | tr -d ' ') policies"
