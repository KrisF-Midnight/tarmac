#!/usr/bin/env bash
# Install the pinned trivy onto a CI runner.
#
# Same shape as scripts/conftest-install.sh, and the same reasoning: pinned
# version, checksum enforced, no marketplace action. See scripts/versions.sh for
# why trivy is pinned even though the gate it feeds does not block.
#
# Linux x86_64 only, on purpose — a laptop installs it from a package manager
# (`brew install trivy`). Upstream calls this build `Linux-64bit` rather than
# `Linux_x86_64`; the two mean the same machine.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

dest="${1:-/usr/local/bin}"

[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]] || die \
  "this installs the Linux x86_64 build only. On a laptop: brew install trivy"

workdir="$(mktemp -d -t trivy.XXXXXX)"
# shellcheck disable=SC2064
trap "rm -rf '$workdir'" EXIT

log "fetching trivy $TRIVY_VERSION"
fetch_pinned "$TRIVY_URL" "$TRIVY_SHA256" "$workdir/trivy.tar.gz"

tar -xzf "$workdir/trivy.tar.gz" -C "$workdir" trivy
install -m 0755 "$workdir/trivy" "$dest/trivy"

log "installed $("$dest/trivy" --version | head -1)"
