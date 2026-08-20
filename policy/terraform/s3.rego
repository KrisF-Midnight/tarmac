package main

# The bucket module asserts in a comment that "the policy layer asserts these
# independently, so turning them off here would fail the build rather than
# quietly ship". This file is what makes that sentence true.
#
# Asserted rather than trusted, because the module's own source is the thing
# under review. A change that drops the public access block passes `terraform
# validate`, passes `fmt`, plans cleanly, and is exactly the change nobody
# catches in a diff that also moves forty lines of tags around.

# Every companion resource a bucket is required to have, and how to describe its
# absence in a way that says what is wrong rather than which rule fired.
required_companions := {
	"aws_s3_bucket_public_access_block": "is not blocked from being made public",
	"aws_s3_bucket_versioning": "has no versioning, so an overwrite is unrecoverable",
	"aws_s3_bucket_server_side_encryption_configuration": "is not encrypted at rest",
}

deny contains msg if {
	some bucket, _ in input.resource.aws_s3_bucket
	some resource_type, complaint in required_companions
	not companion_for(resource_type, bucket)
	msg := sprintf("aws_s3_bucket.%s %s — add a %s", [bucket, complaint, resource_type])
}

# Matched by what the companion *references*, not by whether it happens to share
# the bucket's local name. Same-name is only a convention, and a rule that
# depends on a convention reports success the moment somebody renames one half
# of a pair — which is the moment it most needed to report failure.
companion_for(resource_type, bucket) if {
	some _, blocks in input.resource[resource_type]
	some block in blocks
	contains(block.bucket, sprintf("aws_s3_bucket.%s.", [bucket]))
}

# The access block exists but is switched off. Worth its own rule: a resource
# that is present and set to false reads as "handled" in a diff, and it is the
# harder of the two failures to see.
public_access_settings := {
	"block_public_acls",
	"block_public_policy",
	"ignore_public_acls",
	"restrict_public_buckets",
}

deny contains msg if {
	some name, blocks in input.resource.aws_s3_bucket_public_access_block
	some block in blocks
	some setting in public_access_settings
	not block[setting] == true
	msg := sprintf(
		"aws_s3_bucket_public_access_block.%s does not set %s — it defaults to false, which permits exactly what the resource is named for preventing",
		[name, setting],
	)
}

deny contains msg if {
	some name, blocks in input.resource.aws_s3_bucket
	some block in blocks
	block.force_destroy == true
	msg := sprintf(
		"aws_s3_bucket.%s sets force_destroy — a `terraform destroy` would take the contents with it, and versioning cannot help once the bucket is gone",
		[name],
	)
}
