#!/usr/bin/env bash
# Provision an application's cloud dependencies.
#
# Deliberately not part of the CI pipeline. CI's copy of the stand-in dies with
# the job, so an apply there would provision something and then destroy it in
# the same breath; what CI runs is a plan and a module test. The real apply is
# this, run once by whoever brings the platform up. Terraform owns what lives
# outside the cluster, Argo owns what lives inside it.

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_cmd terraform "brew install terraform"

APP_DIR="${1:?usage: infra-apply.sh <app-dir> [environment]}"
ENVIRONMENT="${2:-local}"

infra_dir="$(cd "$APP_DIR" 2>/dev/null && pwd)/infra" || die "no such application directory: $APP_DIR"
[[ -d "$infra_dir" ]] || die "$APP_DIR has no infra/ directory, so it declares no cloud dependencies."

backend_config="$infra_dir/env/$ENVIRONMENT.backend.hcl"
var_file="$infra_dir/env/$ENVIRONMENT.tfvars"
[[ -f "$backend_config" ]] || die "no backend config for environment '$ENVIRONMENT' at $backend_config"
[[ -f "$var_file" ]] || die "no variables for environment '$ENVIRONMENT' at $var_file"

localstack_running || die "the local AWS stand-in is not running. Run 'make up' first."

log "initialising terraform for $(basename "$APP_DIR") ($ENVIRONMENT)"
# -reconfigure rather than -migrate-state: switching environments here means
# pointing at different state, never copying one environment's state onto
# another's. Terraform offers to do the latter and it is never what was meant.
terraform -chdir="$infra_dir" init -input=false -reconfigure \
  -backend-config="$backend_config" >/dev/null

log "applying"
terraform -chdir="$infra_dir" apply -input=false -auto-approve \
  -var-file="$var_file"

log "provisioned:"
terraform -chdir="$infra_dir" output
