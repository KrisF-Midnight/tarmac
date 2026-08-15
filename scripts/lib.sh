#!/usr/bin/env bash
# Shared helpers. Sourced by the scripts in this directory, not run directly.

set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-tarmac}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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
