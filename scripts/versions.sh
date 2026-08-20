#!/usr/bin/env bash
# Pinned versions of everything the platform installs — into the cluster, and
# into the machine that runs the pipeline.
#
# One file so a bump is one reviewable diff, and so "which version are we on?"
# has an answer that is not `grep -r`. Each pin carries a checksum as well as a
# tag: a tag is a pointer and can be moved, and these manifests are fetched over
# the network at bootstrap. The checksum is the actual pin — it is what makes a
# newcomer's bootstrap the same as the one this repo was tested against.
#
# Sourced by lib.sh, not run directly.

# ingress-nginx. READ THIS BEFORE BUMPING: there is nothing to bump to. The
# project is retired — best-effort maintenance ended March 2026, and upstream
# states there will be no further releases, no bugfixes and no security updates.
# controller-v1.15.1 is the last tag that will ever exist, and its supported
# versions table stops at Kubernetes 1.35 while this cluster runs 1.36.
#
# Kept anyway, deliberately, and the reasoning is in docs/decisions.md. The short
# version: the manifest uses only GA API groups, so nothing in it is exposed to
# 1.36 API removals — the untested part is the controller's own client behaviour,
# against a local emulator with one workload and no traffic. A Gateway API
# migration is the real answer and is on the omissions list rather than pretended
# at here.
# shellcheck disable=SC2034
INGRESS_NGINX_VERSION="controller-v1.15.1"
# shellcheck disable=SC2034
INGRESS_NGINX_MANIFEST_URL="https://raw.githubusercontent.com/kubernetes/ingress-nginx/${INGRESS_NGINX_VERSION}/deploy/static/provider/kind/deploy.yaml"
# shellcheck disable=SC2034
INGRESS_NGINX_MANIFEST_SHA256="2a3ae008c8786431115502644e77ab398fdebfb721a5d1195ed3089cde3299df"

# Argo CD. v3.5 is the first line whose tested-versions table lists Kubernetes
# 1.36, which is what kind/cluster.yaml pins the cluster to; 3.4 and earlier stop
# at 1.35. Not a preference — the older lines are untested against this cluster.
# shellcheck disable=SC2034
ARGOCD_VERSION="v3.5.1"
# shellcheck disable=SC2034
ARGOCD_MANIFEST_URL="https://raw.githubusercontent.com/argoproj/argo-cd/${ARGOCD_VERSION}/manifests/install.yaml"
# shellcheck disable=SC2034
ARGOCD_MANIFEST_SHA256="795a3a972224da6a7f9d32c3e946445f062b60fb46028476715affeb688236e3"

# conftest, which runs the Rego in policy/ as the pipeline's first gate. Pinned
# here rather than installed by a marketplace action: this is the tool that
# decides whether a change is allowed to merge, so its provenance deserves the
# same checksum every other fetched artefact in this file gets.
#
# The checksum is of the Linux x86_64 tarball, because that is what the runner
# is. A laptop installs it from a package manager instead — see
# scripts/conftest-install.sh for why that asymmetry is deliberate.
# shellcheck disable=SC2034
CONFTEST_VERSION="0.69.0"
# shellcheck disable=SC2034
CONFTEST_URL="https://github.com/open-policy-agent/conftest/releases/download/v${CONFTEST_VERSION}/conftest_${CONFTEST_VERSION}_Linux_x86_64.tar.gz"
# shellcheck disable=SC2034
CONFTEST_SHA256="96fc2fbf11f0afde51256647127e6f00a64ce839a4d9a0a1aef2426c0e6f4b3f"

# trivy, which scans the built image for the security gate. Same treatment as
# conftest and for a weaker reason, stated plainly: this one does not decide
# whether a change may merge — the security gate is reporting, not blocking. It
# is pinned anyway because a scanner that silently changed what it looks for
# would change the report without changing the diff, and because "everything we
# fetch has a checksum" is a rule worth more than the exception would save.
#
# Note that pinning the binary does not pin the findings. Trivy fetches its
# vulnerability database at scan time, which is the point — a scanner frozen
# against the CVEs of the day it was released reports nothing useful. So the
# same commit scanned a month apart can produce different findings, and that is
# the behaviour that makes this gate reporting rather than blocking.
# shellcheck disable=SC2034
TRIVY_VERSION="0.74.0"
# shellcheck disable=SC2034
TRIVY_URL="https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz"
# shellcheck disable=SC2034
TRIVY_SHA256="2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a"

# terraform, which the infra gate runs as `fmt -check` and `validate`. Pinned
# and checksummed like the rest, and for conftest's reason rather than trivy's:
# this one blocks a merge.
#
# The checksum below was not copied from the release page. It was produced by
# downloading the artefact and hashing it, then compared against upstream's
# SHA256SUMS — which is the only ordering that catches the case where the
# published sums are the thing that moved.
#
# 1.15.9 against `required_version = ">= 1.11"` in both configurations. Note
# that a laptop is not held to this pin: fmt and validate are stable surfaces,
# and a developer on 1.14 gets the same answer. What must not differ is the
# configuration, which is in these repositories.
#
# On the licence, since a new joiner will ask: Terraform has been BUSL since 1.6,
# which restricts offering it as a competing product and not running it in your
# own pipeline. OpenTofu is the drop-in if that ever changes — the configuration
# here uses nothing specific to either, so the migration is this pin and the
# binary name.
# shellcheck disable=SC2034
TERRAFORM_VERSION="1.15.9"
# shellcheck disable=SC2034
TERRAFORM_URL="https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip"
# shellcheck disable=SC2034
TERRAFORM_SHA256="76edd0b22d2f27d3d2e097cd793209646f719cf60f02ff3af626b07361137da1"
