#!/usr/bin/env bash
# Install the pinned conftest onto a CI runner.
#
# conftest is what the policy gate shells out to, which makes it the tool that
# decides whether a change may merge. So it is fetched at a pinned version and
# refused unless its checksum matches — the same treatment scripts/versions.sh
# gives every other artefact this platform downloads. A marketplace action would
# be shorter and would move that decision to somebody else's repository.
#
# Linux x86_64 only, on purpose. This is a runner script; a laptop should
# install conftest from its package manager (`brew install conftest`), because
# a developer who cannot upgrade their own tools will not, and a second set of
# checksums for two more platforms is upkeep with nothing behind it. The
# version a laptop gets can differ — what both must agree on is the policy
# files, which are in this repository, not the binary.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

dest="${1:-/usr/local/bin}"

[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]] || die \
  "this installs the Linux x86_64 build only. On a laptop: brew install conftest"

workdir="$(mktemp -d -t conftest.XXXXXX)"
# shellcheck disable=SC2064
trap "rm -rf '$workdir'" EXIT

log "fetching conftest $CONFTEST_VERSION"
fetch_pinned "$CONFTEST_URL" "$CONFTEST_SHA256" "$workdir/conftest.tar.gz"

tar -xzf "$workdir/conftest.tar.gz" -C "$workdir" conftest
install -m 0755 "$workdir/conftest" "$dest/conftest"

log "installed $("$dest/conftest" --version | head -1)"
