#!/usr/bin/env bash
# Install the pinned terraform onto a CI runner.
#
# Same shape as scripts/conftest-install.sh, and the same reasoning: pinned
# version, checksum enforced, no marketplace action. This one gates a merge, so
# it gets conftest's treatment rather than trivy's — see scripts/versions.sh.
#
# Linux x86_64 only, on purpose. A laptop installs it from a package manager
# (`brew install terraform`) and is not held to the pin; see versions.sh for why
# that asymmetry is safe for fmt and validate specifically.
#
# HashiCorp ships a zip rather than a tarball, so this needs unzip where the
# other two need tar. That is the only difference.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

dest="${1:-/usr/local/bin}"

[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]] || die \
  "this installs the Linux x86_64 build only. On a laptop: brew install terraform"

require_cmd unzip "It ships on the GitHub-hosted runners; on a slim image, apt-get install unzip."

workdir="$(mktemp -d -t terraform.XXXXXX)"
# shellcheck disable=SC2064
trap "rm -rf '$workdir'" EXIT

log "fetching terraform $TERRAFORM_VERSION"
fetch_pinned "$TERRAFORM_URL" "$TERRAFORM_SHA256" "$workdir/terraform.zip"

unzip -q -o "$workdir/terraform.zip" terraform -d "$workdir"
install -m 0755 "$workdir/terraform" "$dest/terraform"

log "installed $("$dest/terraform" version | head -1)"
