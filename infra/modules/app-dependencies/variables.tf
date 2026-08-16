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
    Configuration the application reads at boot, as object key to contents.
    Held in S3 rather than baked into the image so the same artefact runs in
    every environment. Values are not secret — there is a separate mechanism
    for those, and putting one here would put it in plan output and in git.
  EOT
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Extra tags merged over the ones the platform sets. Platform tags win, so ownership cannot be relabelled by a caller."
  type        = map(string)
  default     = {}
}
