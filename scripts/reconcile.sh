#!/usr/bin/env bash
# Break glass: stop Argo CD reconciling, and start it again.
#
# This exists for one situation — something is broken, the fix is not in git yet,
# and the cluster has to be edited by hand to stop the bleeding. Without it the
# only options during an incident are "wait for a pull request to merge" and
# "fight selfHeal", and the second is what people actually do at 3am.
#
# It is deliberately the whole reconciler and not one application. The obvious
# alternative is to clear `spec.syncPolicy.automated` on the Application, which
# is what `argocd app set --sync-policy none` does. That does not work here, and
# the reason is worth writing down: the Applications are themselves reconciled by
# `root`, which has selfHeal too. Argo would restore the syncPolicy within
# minutes and resume deploying — a break-glass that quietly closes itself again,
# discovered only when a commit lands on top of the manual fix. Scaling the
# controller cannot be undone by the thing it turns off.
#
# The cost, stated plainly: this is cluster-wide. Nothing reconciles while it is
# suspended, for any application. That is the correct blast radius for an
# emergency lever — one obvious switch that is either on or off — but it is not a
# way to hold one application still while the rest of the platform carries on.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_cmd kubectl "brew install kubectl"

CONTROLLER="statefulset/argocd-application-controller"

action="${1:-}"
[[ "$action" == "suspend" || "$action" == "resume" ]] \
  || die "usage: reconcile.sh suspend|resume"

cluster_exists || die "cluster '$CLUSTER_NAME' does not exist. Run 'make up'."

kc get "$CONTROLLER" --namespace argocd >/dev/null 2>&1 \
  || die "Argo CD is not installed in this cluster, so there is nothing to suspend.
     Run 'make argocd'."

# Desired replicas, not ready replicas. A controller that is scaled to 1 but
# crash-looping is not a suspended platform, it is a broken one, and reporting it
# as suspended here would send someone looking for a switch nobody flipped.
replicas="$(kc get "$CONTROLLER" --namespace argocd -o jsonpath='{.spec.replicas}')"

if [[ "$action" == "suspend" ]]; then
  if [[ "$replicas" == "0" ]]; then
    log "already suspended — Argo CD is not reconciling anything."
    exit 0
  fi

  kc scale "$CONTROLLER" --namespace argocd --replicas=0 >/dev/null
  kc wait --namespace argocd --for=delete pod \
    -l app.kubernetes.io/name=argocd-application-controller --timeout=60s >/dev/null 2>&1 || true

  log "suspended. Argo CD is no longer reconciling anything in this cluster."
  cat <<'EOF'

          While this is suspended:
            - kubectl edits stick. Nothing will revert them.
            - commits to gitops/ are not deployed. The pipeline still runs and
              still writes digests into git; they simply queue up.
            - 'make status' says so on every run, so this cannot be forgotten
              quietly.

          Resume with 'make resume'. Every hand edit made in the meantime is
          reverted at that moment, in one go — so anything worth keeping has to
          be in a commit before you resume, not after.
EOF
  exit 0
fi

if [[ "$replicas" != "0" ]]; then
  log "already running — Argo CD is reconciling normally."
  exit 0
fi

kc scale "$CONTROLLER" --namespace argocd --replicas=1 >/dev/null
log "resuming — waiting for the controller to come back"
kc rollout status "$CONTROLLER" --namespace argocd --timeout=120s

# Everything below exists because of one measured behaviour, and without it this
# script lies. A controller that has just come back does not re-compare anything:
# it reacts to watch events, and every edit made during the suspension happened
# while nothing was watching. Meanwhile `status.sync.status` still holds the
# value cached before the suspend — so an application that was edited by hand
# five seconds ago reads "Synced", and keeps reading it until the next refresh
# cycle, up to three minutes later.
#
# Both halves of that were observed, not assumed: a resume that waited on the
# reported status returned "the cluster matches git again" against a Deployment
# still carrying a hand-scaled replica count, and it stayed wrong until something
# forced a refresh.
#
# So force one. Hard, not normal: a suspension has no defined length, main may
# have moved several commits while it lasted, and a normal refresh is entitled to
# answer from cached manifests. Argo removes the annotation once the refresh has
# actually happened, which is the only trustworthy "this status is fresh" signal
# available — a timestamp comparison would still be reading a field the
# controller had not yet revisited.
apps="$(kc get applications.argoproj.io --namespace argocd \
  -o jsonpath='{.items[*].metadata.name}')"
[[ -n "$apps" ]] || die "Argo CD is running, but there are no Applications.
     The root Application is missing — run 'make argocd'."

log "forcing a re-compare against git"
for app in $apps; do
  kc annotate "application.argoproj.io/$app" --namespace argocd \
    argocd.argoproj.io/refresh=hard --overwrite >/dev/null
done

refresh_pending() {
  kc get "application.argoproj.io/$1" --namespace argocd \
    -o jsonpath='{.metadata.annotations.argocd\.argoproj\.io/refresh}' 2>/dev/null
}

log "waiting for every application to report Synced against a fresh comparison"
deadline=$((SECONDS + 180))
while ((SECONDS < deadline)); do
  stale=""
  for app in $apps; do
    if [[ -n "$(refresh_pending "$app")" ]]; then stale="$app"; break; fi
  done
  if [[ -z "$stale" ]]; then
    statuses="$(kc get applications.argoproj.io --namespace argocd --no-headers \
      -o custom-columns=':status.sync.status' 2>/dev/null)"
    if [[ -n "$statuses" ]] && ! grep -qv '^Synced$' <<<"$statuses"; then
      log "reconciliation resumed. The cluster matches git again."
      exit 0
    fi
  fi
  sleep 5
done

kc get applications.argoproj.io --namespace argocd \
  -o custom-columns=NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status
die "the controller is back, but something is still not Synced after 3 minutes.
     That is a real disagreement between the cluster and git, not a slow resume —
     the manual fix probably needs to be committed, or reverted."
