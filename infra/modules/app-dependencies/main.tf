# What an application on this road gets when it says "I need somewhere to keep
# my configuration". The application declares intent; the platform decides what
# a bucket has to look like to be acceptable.
#
# That division is the whole argument for a module rather than a snippet in a
# README. A team that copies a bucket resource between repositories eventually
# copies one written before the current defaults, and nobody notices until an
# audit. Here, the defaults are in one place and every caller moves when it does.

locals {
  bucket_name = "${var.app_name}-${var.environment}-config"

  # Caller tags first, so a caller cannot overwrite the ones the platform uses
  # to answer "who owns this and what created it".
  tags = merge(var.tags, {
    Application = var.app_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Platform    = "tarmac"
  })
}

resource "aws_s3_bucket" "config" {
  bucket = local.bucket_name
  tags   = local.tags
}

# The three settings below are not optional and are deliberately not exposed as
# variables. A caller that needs a public bucket needs a conversation, not a
# flag — and the policy layer asserts these independently, so turning them off
# here would fail the build rather than quietly ship.

resource "aws_s3_bucket_public_access_block" "config" {
  bucket = aws_s3_bucket.config.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "config" {
  bucket = aws_s3_bucket.config.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "config" {
  bucket = aws_s3_bucket.config.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_object" "config" {
  for_each = var.config

  bucket       = aws_s3_bucket.config.id
  key          = each.key
  content      = each.value
  content_type = "text/plain; charset=utf-8"
  tags         = local.tags

  # Terraform is free to create the object and the access block in either
  # order. Without this, there is a real if short window in which the object
  # exists in a bucket that is not yet blocked from being made public.
  depends_on = [aws_s3_bucket_public_access_block.config]
}

# The application is told where its configuration lives rather than having a
# bucket name compiled into it. One parameter read at boot and the same image
# runs in every environment, which is what lets the delivery pipeline promote
# an artefact rather than rebuild one.
resource "aws_ssm_parameter" "config_bucket" {
  name  = "/${var.app_name}/${var.environment}/config-bucket"
  type  = "String"
  value = aws_s3_bucket.config.id
  tags  = local.tags
}
