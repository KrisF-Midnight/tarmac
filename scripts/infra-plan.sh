#!/usr/bin/env bash
# What provisioning would change, without changing it.
#
# The plan is also written out as JSON, because that is the artefact the policy
# layer reads: asserting on rendered plan output is asserting on a string, and
# the string changes with the Terraform version.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_cmd terraform "brew install terraform"

APP_DIR="${1:?usage: infra-plan.sh <app-dir> [environment]}"
ENVIRONMENT="${2:-local}"

infra_dir="$(cd "$APP_DIR" 2>/dev/null && pwd)/infra" || die "no such application directory: $APP_DIR"
[[ -d "$infra_dir" ]] || die "$APP_DIR has no infra/ directory, so it declares no cloud dependencies."

backend_config="$infra_dir/env/$ENVIRONMENT.backend.hcl"
var_file="$infra_dir/env/$ENVIRONMENT.tfvars"
[[ -f "$backend_config" ]] || die "no backend config for environment '$ENVIRONMENT' at $backend_config"
[[ -f "$var_file" ]] || die "no variables for environment '$ENVIRONMENT' at $var_file"

localstack_running || die "the local AWS stand-in is not running. Run 'make up' first."

log "initialising terraform for $(basename "$APP_DIR") ($ENVIRONMENT)"
terraform -chdir="$infra_dir" init -input=false -reconfigure \
  -backend-config="$backend_config" >/dev/null

log "planning"
terraform -chdir="$infra_dir" plan -input=false -lock=false \
  -var-file="$var_file" \
  -out=plan.tfplan

terraform -chdir="$infra_dir" show -json plan.tfplan > "$infra_dir/plan.json"
log "machine-readable plan written to $infra_dir/plan.json"
