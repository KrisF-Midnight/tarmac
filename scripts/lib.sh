#!/usr/bin/env bash
# Shared helpers. Sourced by the scripts in this directory, not run directly.

set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-tarmac}"
LOCALSTACK_CONTAINER="${LOCALSTACK_CONTAINER:-tarmac-localstack}"

# Read by the scripts that source this file, which is invisible to a linter
# looking at lib.sh on its own.
# shellcheck disable=SC2034
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Endpoint, region and dummy credentials for the local AWS stand-in. Sourced
# rather than duplicated so that the scripts, the Terraform and the running
# application all agree on where "AWS" is.
# shellcheck source=localstack/env.sh
source "$REPO_ROOT/localstack/env.sh"

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

# Every compose invocation names the file explicitly, so the scripts work from
# any directory and do not depend on where make was run from.
compose() {
  docker compose --file "$REPO_ROOT/localstack/docker-compose.yml" "$@"
}

localstack_running() {
  [[ "$(docker inspect --format '{{.State.Running}}' "$LOCALSTACK_CONTAINER" 2>/dev/null)" == "true" ]]
}
