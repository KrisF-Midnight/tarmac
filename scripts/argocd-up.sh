#!/usr/bin/env bash
# Install Argo CD and point it at this repository's gitops/ directory.
#
# This is the one imperative step in the deployment story, and it is deliberately
# small: it installs the reconciler, then applies exactly two objects — the
# AppProject that bounds what may be deployed, and the root Application that
# discovers everything else. From that point on nothing reaches the cluster
# except by a commit to gitops/, which is the property the pipeline depends on.
#
# Idempotent: re-applying the same pinned manifest and the same two objects is a
# no-op, which matters because `make up` runs the whole chain.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
require_cmd kubectl "brew install kubectl"

cluster_exists || die "cluster '$CLUSTER_NAME' does not exist. Run 'make up'."

ARGOCD_NAMESPACE="argocd"

# Created here rather than in gitops/, because it has to exist before the
# reconciler that would otherwise create it. Bootstrap owns the substrate; git
# owns everything that runs on top of it.
kc get namespace "$ARGOCD_NAMESPACE" >/dev/null 2>&1 \
  || kc create namespace "$ARGOCD_NAMESPACE" >/dev/null

manifest="$(mktemp -t argocd.XXXXXX.yaml)"
# shellcheck disable=SC2064
trap "rm -f '$manifest'" EXIT

log "fetching Argo CD $ARGOCD_VERSION"
fetch_pinned "$ARGOCD_MANIFEST_URL" "$ARGOCD_MANIFEST_SHA256" "$manifest"

# Server-side apply. The Application CRD's schema is far past the 256KB limit on
# the last-applied-configuration annotation that client-side apply writes, so a
# plain `kubectl apply` of this manifest fails outright — a failure that reads
# like a malformed manifest and is nothing of the kind.
log "installing Argo CD into namespace $ARGOCD_NAMESPACE"
kc apply --namespace "$ARGOCD_NAMESPACE" \
  --server-side --force-conflicts -f "$manifest" >/dev/null

# The CRDs land in the same apply as the objects that will use them. Applying an
# Application before its CRD is Established fails with "no matches for kind",
# so wait for the API to actually serve them.
log "waiting for the Argo CD CRDs to be served"
for crd in applications.argoproj.io appprojects.argoproj.io; do
  kc wait --for=condition=Established "crd/$crd" --timeout=120s >/dev/null \
    || die "the $crd CRD was never established. Argo CD did not install cleanly."
done

# The controller is what reconciles, the repo-server is what can read git, and
# the server is what a developer opens. All three have to be up before the root
# Application means anything; without this wait the script would report success
# while the first sync had not been attempted.
log "waiting for Argo CD to be ready"
for deploy in argocd-repo-server argocd-server; do
  kc wait --namespace "$ARGOCD_NAMESPACE" \
    --for=condition=Available "deployment/$deploy" --timeout=300s >/dev/null \
    || { kc get pods --namespace "$ARGOCD_NAMESPACE"; die "$deploy did not become ready. Output above."; }
done
kc rollout status --namespace "$ARGOCD_NAMESPACE" \
  statefulset/argocd-application-controller --timeout=300s >/dev/null \
  || { kc get pods --namespace "$ARGOCD_NAMESPACE"; die "the application controller did not become ready. Output above."; }

# Two objects, in this order and applied by name rather than by directory: the
# Applications reference the project, and a project that does not exist yet is a
# validation failure. `apply -f <dir>` happens to sort these correctly by
# filename, which is a coincidence and not something to depend on.
log "applying the project and the root application"
kc apply -f "$REPO_ROOT/gitops/argocd/bootstrap/project.yaml" >/dev/null
kc apply -f "$REPO_ROOT/gitops/argocd/bootstrap/root.yaml" >/dev/null

log "Argo CD is up"
cat <<'EOF'

  The root application will now sync gitops/argocd/apps from the repository's
  main branch, and those applications sync the rest. Nothing local is deployed:
  Argo CD reads the pushed branch, not this working tree, so uncommitted changes
  under gitops/ are invisible to it. That is the point — but it does mean a
  change is not deployed until it is pushed.

    make status                 what the reconciler has actually converged on
    kubectl -n argocd get app   sync and health per application

  The UI, if you want it, is a port-forward away. It is not behind the ingress
  on purpose: argocd-server terminates its own TLS and serves gRPC on the same
  port, so putting it behind nginx means running it insecure and annotating the
  backend protocol — moving parts in the trust boundary, bought for a UI that is
  not part of the deliverable.

    kubectl -n argocd port-forward svc/argocd-server 8081:443
    kubectl -n argocd get secret argocd-initial-admin-secret \
      -o jsonpath='{.data.password}' | base64 -d

EOF
