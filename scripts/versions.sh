#!/usr/bin/env bash
# Pinned versions of everything the platform installs into the cluster.
#
# One file so a bump is one reviewable diff, and so "which version are we on?"
# has an answer that is not `grep -r`. Each pin carries a checksum as well as a
# tag: a tag is a pointer and can be moved, and these manifests are fetched over
# the network at bootstrap. The checksum is the actual pin — it is what makes a
# reviewer's bootstrap the same as the one this repo was tested against.
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
