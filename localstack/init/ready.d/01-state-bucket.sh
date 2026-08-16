#!/bin/bash
# Runs inside the LocalStack container, once the emulated services are ready.
#
# Terraform's S3 backend cannot create the bucket it keeps state in, so this is
# the one piece of infrastructure that cannot be Terraform's. Every team meets
# this and most solve it with a README step that a new joiner skips. Making it
# a container init hook means it is impossible to skip and needs nothing
# installed on the host.
#
# Idempotent on purpose: the volume persists, so on every run after the first
# the bucket is already here.
set -euo pipefail

BUCKET="${TF_STATE_BUCKET:-tarmac-tfstate}"
REGION="${AWS_DEFAULT_REGION:-eu-west-1}"

if awslocal s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  echo "tarmac: state bucket $BUCKET already exists"
  exit 0
fi

awslocal s3api create-bucket \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null

# Not decoration. Versioning is the only thing that makes a truncated or
# half-written state file recoverable, and state is the one object here whose
# loss cannot be fixed by re-running anything.
awslocal s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

echo "tarmac: created state bucket $BUCKET"
