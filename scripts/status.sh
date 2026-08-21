#!/usr/bin/env bash
# What is actually running right now.
#
# Reports live state, never desired state: it asks the cluster and the containers,
# not the manifests. That is the whole value of it — the manifests are already
# readable in git, and the question this answers is where the two have diverged.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# `require_cmd docker` rather than the `require_docker` its siblings use. Both
# check the binary; only the latter also insists the daemon is up, and a stopped
# daemon is a state this script reports rather than refuses. A missing binary is
# a different thing — nothing below can answer anything — so it still dies.
require_cmd docker  "Install Docker Desktop."
require_cmd kind    "brew install kind"
require_cmd kubectl "brew install kubectl"

indent() { sed 's/^/          /'; }

if ! docker info >/dev/null 2>&1; then
  echo "docker    not running"
  exit 0
fi

if cluster_exists; then
  echo "cluster   up ($CLUSTER_NAME)"
  kc get nodes --no-headers \
    -o custom-columns=':metadata.name,:status.conditions[-1].type' 2>/dev/null | indent
else
  echo "cluster   down"
  # Nothing below can be answered without an API server, and printing "not
  # installed" six times would suggest six separate problems.
  exit 0
fi

# Admission policies, and specifically whether each one is bound.
#
# An unbound ValidatingAdmissionPolicy is the failure this block exists for: the
# object is present, `kubectl get` lists it, and it evaluates nothing. Reporting
# "2 policies" without checking would be a status line that says the cluster is
# protected when it is not, which is worse than no line at all.
read -ra policies <<<"$(kc get validatingadmissionpolicy \
  -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)"
bound="$(kc get validatingadmissionpolicybinding \
  -o jsonpath='{range .items[*]}{.spec.policyName}{"\n"}{end}' 2>/dev/null)"

if ((${#policies[@]} == 0)); then
  echo "admission no policies — anything can be applied. Run 'make admission'."
else
  echo "admission ${#policies[@]} policies"
  for policy in "${policies[@]}"; do
    if grep -qx "$policy" <<<"$bound"; then
      printf '  %-36s enforcing\n' "$policy" | indent
    else
      printf '  %-36s NOT BOUND — evaluates nothing\n' "$policy" | indent
    fi
  done
fi

if localstack_running; then
  echo "aws       up ($AWS_ENDPOINT_URL)"
  # What has actually been provisioned, rather than what the container claims.
  # A running stand-in with an empty bucket list means an apply is missing, and
  # that is the failure worth catching here — the service would return 503 and
  # the cause would look like the service.
  docker exec "$LOCALSTACK_CONTAINER" awslocal s3api list-buckets \
    --query 'Buckets[].Name' --output text 2>/dev/null \
    | tr '\t' '\n' | sed '/^$/d; s/^/          bucket /'
else
  echo "aws       down"
fi

# The check that earns the generated EndpointSlice its keep. Its address is
# assigned by Docker and does not survive an emulator restart, so it is the one
# piece of cluster state in this design that can silently become wrong — and the
# symptom, a readiness probe timing out against an address that answers nothing,
# points at the application rather than at the address. Comparing the two is a
# one-line answer to a confusing failure.
live_ip="$(kc get endpointslice --namespace "$APP_NAMESPACE" \
  -l "kubernetes.io/service-name=$AWS_SERVICE_NAME" \
  -o jsonpath='{.items[*].endpoints[*].addresses[0]}' 2>/dev/null)"
real_ip="$(localstack_cluster_ip)"

if [[ -z "$live_ip" ]]; then
  echo "endpoint  missing — the application cannot resolve '$AWS_SERVICE_NAME'. Run 'make aws-endpoint'."
elif [[ -z "$real_ip" ]]; then
  echo "endpoint  $live_ip, but the stand-in is not on the 'kind' network — nothing is there."
elif [[ "$live_ip" == "$real_ip" ]]; then
  echo "endpoint  $live_ip (matches the stand-in)"
else
  echo "endpoint  STALE — cluster points at $live_ip, the stand-in moved to $real_ip. Run 'make aws-endpoint'."
fi

if kc get deployment/ingress-nginx-controller --namespace ingress-nginx >/dev/null 2>&1; then
  ready="$(kc get deployment/ingress-nginx-controller --namespace ingress-nginx \
    -o jsonpath='{.status.readyReplicas}/{.spec.replicas}' 2>/dev/null)"
  echo "ingress   ${ready} ready (http://localhost:8080)"
else
  echo "ingress   not installed — run 'make ingress'"
fi

if kc get namespace argocd >/dev/null 2>&1 \
  && kc get crd applications.argoproj.io >/dev/null 2>&1; then
  # A suspended platform is reported before anything else about it, because
  # every line below becomes a claim about the past the moment reconciliation
  # stops. "Synced" under a stopped controller means "was Synced when it was
  # last looked at", and that is exactly the sentence someone misreads during an
  # incident. `make suspend` is easy to walk away from; this is what makes
  # walking away from it survivable.
  if [[ "$(kc get statefulset/argocd-application-controller --namespace argocd \
    -o jsonpath='{.spec.replicas}' 2>/dev/null)" == "0" ]]; then
    echo "argocd    SUSPENDED ($ARGOCD_VERSION) — not reconciling. Run 'make resume'."
    echo "          Nothing below is being enforced, and git is not deploying."
  else
    echo "argocd    up ($ARGOCD_VERSION)"
  fi
  # Sync and health per application, which together answer "is what is running
  # what git says, and does it work". An application that is Synced and Degraded
  # is the interesting case: the manifests arrived and the workload is unhappy,
  # which is a different problem from the manifests not arriving.
  apps="$(kc get applications.argoproj.io --namespace argocd --no-headers \
    -o custom-columns=':metadata.name,:status.sync.status,:status.health.status' 2>/dev/null)"
  if [[ -n "$apps" ]]; then
    printf '%s\n' "$apps" | awk '{printf "  %-12s %-12s %s\n", $1, $2, $3}' | indent
  else
    echo "          no applications — bootstrap did not apply the root. Run 'make argocd'."
  fi
else
  echo "argocd    not installed — run 'make argocd'"
fi

if kc get namespace "$APP_NAMESPACE" >/dev/null 2>&1; then
  # Pods rather than the Deployment's replica count, because the count is a
  # summary and the reason a pod is not ready is in its phase and restarts.
  pods="$(kc get pods --namespace "$APP_NAMESPACE" --no-headers \
    -o custom-columns=':metadata.name,:status.phase,:status.containerStatuses[0].ready,:status.containerStatuses[0].restartCount' 2>/dev/null)"
  if [[ -n "$pods" ]]; then
    echo "greeter   namespace up"
    printf '%s\n' "$pods" | awk '{printf "  %-28s %-10s ready=%-6s restarts=%s\n", $1, $2, $3, $4}' | indent
  else
    echo "greeter   namespace up, no pods — check 'kubectl -n argocd get app greeter'"
  fi
else
  echo "greeter   not deployed — nothing has synced the '$APP_NAMESPACE' namespace yet"
fi
