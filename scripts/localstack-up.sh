#!/usr/bin/env bash
# Start the local AWS stand-in and wait until it can actually answer.
# Idempotent: `docker compose up` on a running stack is a no-op.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker

log "starting the local AWS stand-in"
compose up --detach --wait --wait-timeout 120

# Attach it to the cluster's network too, so that a pod can reach it by
# container name later. Done here rather than in the compose file because the
# network is created by kind and does not exist until the cluster does — and
# this script has to work on its own, before there is a cluster.
if docker network inspect kind >/dev/null 2>&1; then
  if ! docker network inspect kind --format '{{range .Containers}}{{.Name}} {{end}}' | grep -qw "$LOCALSTACK_CONTAINER"; then
    log "attaching the stand-in to the cluster network"
    docker network connect kind "$LOCALSTACK_CONTAINER"
  fi
fi

# --wait already blocks on the healthcheck, so reaching here means the API is
# up. The init hook that creates the state bucket runs on the same signal, so
# confirm the bucket rather than assuming: a backend pointed at a bucket that
# does not exist fails with an error that says nothing useful.
if ! docker exec "$LOCALSTACK_CONTAINER" awslocal s3api head-bucket --bucket "$TF_STATE_BUCKET" >/dev/null 2>&1; then
  die "the stand-in is up but the state bucket '$TF_STATE_BUCKET' is missing. Check 'docker logs $LOCALSTACK_CONTAINER'."
fi

log "the local AWS stand-in is ready on $AWS_ENDPOINT_URL"
