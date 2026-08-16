terraform {
  # 1.11 is where S3-native state locking (`use_lockfile`) became stable and
  # the DynamoDB lock table stopped being necessary. Callers use that backend,
  # so requiring it here fails fast rather than at the first concurrent apply.
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
