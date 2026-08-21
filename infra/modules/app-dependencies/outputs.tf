output "config_bucket" {
  description = "Name of the bucket holding the application's configuration."
  value       = aws_s3_bucket.config.id
}

output "config_bucket_arn" {
  description = "ARN of the configuration bucket. Nothing consumes it: there is no IAM in this platform at all, so no caller has a policy to write against it yet. Kept because the first one to grow a role will need exactly this, and an unused output costs nothing."
  value       = aws_s3_bucket.config.arn
}

output "config_keys" {
  description = "Object keys written to the configuration bucket. Also unconsumed — it is there so an apply can be read for what it wrote, not because anything downstream takes it as input."
  value       = sort(keys(var.config))
}
