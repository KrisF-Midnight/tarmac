#!/usr/bin/env bash
# Points the AWS tooling at the local stand-in instead of at AWS.
#
# Sourced, never executed. The important property is that almost everything
# LocalStack-specific lives in this file: the Terraform in infra/ and in the
# application repositories contains no endpoint override and no dummy
# credential, so it is the same Terraform that would run against a real
# account. Point these somewhere else and it does.
#
# These are the AWS SDK's own standard variables rather than anything this
# platform invented. The endpoint, region and credentials are honoured by the
# Terraform AWS provider and by the S3 state backend alike. Path style is the
# one that is not — see below.

# LocalStack accepts any credentials and validates none of them. Setting them
# here keeps a developer's real ~/.aws/credentials out of the path entirely:
# a mistake in this stack cannot reach an account that charges money.
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-localstack}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-localstack}"
export AWS_REGION="${AWS_REGION:-eu-west-1}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$AWS_REGION}"

export AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}"
export AWS_ENDPOINT_URL_S3="${AWS_ENDPOINT_URL_S3:-$AWS_ENDPOINT_URL}"

# Virtual-host addressing would resolve bucket-name.localhost, which does not
# exist. Path style is a supported S3 addressing mode rather than a LocalStack
# extension — the same flag addresses MinIO, or S3 through an interface VPC
# endpoint.
#
# This one is set for the AWS CLI and the SDKs, and it does NOT reach Terraform:
# neither the S3 backend nor the AWS provider reads this variable, though both
# read the endpoint variables directly above it. They are told separately, in
# each environment's backend config and tfvars. Worth knowing how that failed —
# plan passed, because plan only reads and lists, and the bucket name only moves
# into the host header on a write. The first apply hung retrying PUT /.
export AWS_S3_USE_PATH_STYLE="${AWS_S3_USE_PATH_STYLE:-true}"

# There is no IMDS and no STS worth asking. Without these, every plan pauses
# for the metadata endpoint to time out.
export AWS_EC2_METADATA_DISABLED="${AWS_EC2_METADATA_DISABLED:-true}"

# Where Terraform keeps its state. Created by the LocalStack init hook, because
# a backend cannot create its own bucket.
export TF_STATE_BUCKET="${TF_STATE_BUCKET:-tarmac-tfstate}"
