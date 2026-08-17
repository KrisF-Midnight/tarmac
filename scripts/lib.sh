#!/usr/bin/env bash
# Shared helpers. Sourced by the scripts in this directory, not run directly.

set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-tarmac}"
LOCALSTACK_CONTAINER="${LOCALSTACK_CONTAINER:-tarmac-localstack}"

# Where the application runs, and the in-cluster name its object-store endpoint
# points at. Both also appear in gitops/ as literal YAML — a manifest cannot
# source a shell file. That duplication is the seam between the two halves of
# decision 25, and the reason aws-endpoint-up.sh asserts the Service exists
# rather than assuming it: if these drift, the pod resolves nothing.
# shellcheck disable=SC2034
APP_NAMESPACE="${APP_NAMESPACE:-greeter}"
# shellcheck disable=SC2034
AWS_SERVICE_NAME="${AWS_SERVICE_NAME:-aws}"

# Read by the scripts that source this file, which is invisible to a linter
# looking at lib.sh on its own.
# shellcheck disable=SC2034
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Endpoint, region and dummy credentials for the local AWS stand-in. Sourced
# rather than duplicated so that the scripts, the Terraform and the running
# application all agree on where "AWS" is.
# shellcheck source=localstack/env.sh
source "$REPO_ROOT/localstack/env.sh"

# Pinned versions of what gets installed into the cluster.
# shellcheck source=scripts/versions.sh
source "$REPO_ROOT/scripts/versions.sh"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m warn\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror\033[0m %s\n' "$*" >&2; exit 1; }

# Fail with an actionable message rather than a bare "command not found".
require_cmd() {
  local cmd="$1" hint="${2:-}"
  command -v "$cmd" >/dev/null 2>&1 || die "$cmd is not installed.${hint:+ $hint}"
}

require_docker() {
  require_cmd docker "Install Docker Desktop."
  docker info >/dev/null 2>&1 || die "the Docker daemon is not running. Start Docker Desktop and retry."
}

cluster_exists() {
  kind get clusters 2>/dev/null | grep -qx "$CLUSTER_NAME"
}

# Always name the context. A bare kubectl acts on whatever the developer's
# current context happens to be, and every command in these scripts is one that
# would be unwelcome against a real cluster.
kc() {
  kubectl --context "kind-$CLUSTER_NAME" "$@"
}

# macOS ships shasum, Linux ships sha256sum, and CI is Ubuntu while development
# is a Mac. Neither is guaranteed to be the one present.
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# Download a manifest and refuse it unless it is byte-for-byte what this repo was
# tested against. The tag in the URL is a pointer and can be moved; the checksum
# is the actual pin. Without this, "pinned to v3.5.1" means "pinned to whatever
# that tag points at on the day the reviewer runs it".
fetch_pinned() {
  local url="$1" want="$2" dest="$3" got
  require_cmd curl

  curl --fail --silent --show-error --location \
       --retry 3 --retry-delay 2 --output "$dest" "$url" \
    || die "could not download $url"

  got="$(sha256_of "$dest")"
  if [[ "$got" != "$want" ]]; then
    die "checksum mismatch for $url
       expected $want
       actual   $got
     Refusing to apply it. Either the upstream tag moved, or the download is
     corrupt. If the version was bumped on purpose, update scripts/versions.sh."
  fi
}

# The emulator's address on the cluster network. IPv4 explicitly: the kind
# network has IPv6 enabled, the container holds both addresses, and an
# EndpointSlice declares one address family per object.
localstack_cluster_ip() {
  docker inspect --format \
    '{{with index .NetworkSettings.Networks "kind"}}{{.IPAddress}}{{end}}' \
    "$LOCALSTACK_CONTAINER" 2>/dev/null
}

# Every compose invocation names the file explicitly, so the scripts work from
# any directory and do not depend on where make was run from.
compose() {
  docker compose --file "$REPO_ROOT/localstack/docker-compose.yml" "$@"
}

localstack_running() {
  [[ "$(docker inspect --format '{{.State.Running}}' "$LOCALSTACK_CONTAINER" 2>/dev/null)" == "true" ]]
}
