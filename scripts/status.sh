#!/usr/bin/env bash
# What is actually running right now. Grows as the platform does; today it
# reports the cluster only.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_cmd kind "brew install kind"

if ! docker info >/dev/null 2>&1; then
  echo "docker    not running"
  exit 0
fi

if cluster_exists; then
  echo "cluster   up ($CLUSTER_NAME)"
  kubectl --context "kind-$CLUSTER_NAME" get nodes \
    --no-headers -o custom-columns=':metadata.name,:status.conditions[-1].type' 2>/dev/null \
    | sed 's/^/          /'
else
  echo "cluster   down"
fi
