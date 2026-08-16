output "config_bucket" {
  description = "Name of the bucket holding the application's configuration."
  value       = aws_s3_bucket.config.id
}

output "config_bucket_arn" {
  description = "ARN of the configuration bucket, for callers that need to write a policy against it."
  value       = aws_s3_bucket.config.arn
}

output "config_bucket_parameter" {
  description = "SSM parameter the application reads at boot to discover its configuration bucket."
  value       = aws_ssm_parameter.config_bucket.name
}

output "config_keys" {
  description = "Object keys written to the configuration bucket."
  value       = sort(keys(var.config))
}
