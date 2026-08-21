variable "app_name" {
  description = "The application these dependencies belong to. Every resource is named and tagged from it."
  type        = string

  validation {
    # Bucket names are global, DNS-shaped and immutable. Catching a bad name
    # at plan time is worth more than the error the API would give at apply.
    condition     = can(regex("^[a-z][a-z0-9-]{1,26}[a-z0-9]$", var.app_name))
    error_message = "app_name must be 3-28 characters of lowercase letters, digits and hyphens, starting with a letter — it becomes part of an S3 bucket name."
  }
}

variable "environment" {
  description = "Which environment this instance of the application is."
  type        = string
  default     = "local"

  validation {
    condition     = contains(["local", "staging", "production"], var.environment)
    error_message = "environment must be one of: local, staging, production."
  }
}

variable "config" {
  description = <<-EOT
    Configuration the application reads from S3, as object key to contents.
    Held in S3 rather than baked into the image so the same artefact runs in
    every environment, and read per request rather than at boot, so a change
    here takes effect on apply with no rebuild and no restart.

    Nothing here may be secret, and this module offers no alternative for the
    things that are: values land in plan output, in the state file and in a
    pull request diff, and no secrets mechanism exists anywhere in this
    platform. Handling one would mean keeping it out of git altogether —
    External Secrets, sealed-secrets, a cloud secret store, or the workload's
    own identity in place of a stored credential — and none of that is
    modelled here.
  EOT
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Extra tags merged over the ones the platform sets. Platform tags win, so ownership cannot be relabelled by a caller."
  type        = map(string)
  default     = {}
}
