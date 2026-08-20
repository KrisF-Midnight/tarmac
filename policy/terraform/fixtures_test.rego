package main

# conftest hands Rego the HCL as parsed, not as Terraform would evaluate it, and
# the fixtures below reproduce that shape rather than an idealised one. Two
# details are load-bearing:
#
#   * every resource block arrives as a *list*, because HCL permits repeated
#     blocks with the same labels;
#   * references are left as unexpanded interpolation strings —
#     "${aws_s3_bucket.config.id}", not a resolved bucket name.
#
# A rule written against the tidier shape passes its tests and finds nothing in
# production, so the fixtures are deliberately the awkward shape.

compliant_bucket := {"resource": {
	"aws_s3_bucket": {"config": [{"bucket": "${local.bucket_name}"}]},
	"aws_s3_bucket_public_access_block": {"config": [{
		"bucket": "${aws_s3_bucket.config.id}",
		"block_public_acls": true,
		"block_public_policy": true,
		"ignore_public_acls": true,
		"restrict_public_buckets": true,
	}]},
	"aws_s3_bucket_versioning": {"config": [{
		"bucket": "${aws_s3_bucket.config.id}",
		"versioning_configuration": [{"status": "Enabled"}],
	}]},
	"aws_s3_bucket_server_side_encryption_configuration": {"config": [{
		"bucket": "${aws_s3_bucket.config.id}",
		"rule": [{"apply_server_side_encryption_by_default": [{"sse_algorithm": "AES256"}]}],
	}]},
}}

# The fixture minus one companion resource, so a test's diff from compliance is
# exactly the thing under test.
bucket_without(resource_type) := {"resource": object.remove(compliant_bucket.resource, [resource_type])}

reports(messages, fragment) if {
	some msg in messages
	contains(msg, fragment)
}
