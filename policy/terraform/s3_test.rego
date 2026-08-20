package main

test_a_bucket_with_all_three_companions_is_allowed if {
	count(deny) == 0 with input as compliant_bucket
}

test_a_bucket_with_no_public_access_block_is_denied if {
	messages := deny with input as bucket_without("aws_s3_bucket_public_access_block")
	count(messages) == 1
	reports(messages, "is not blocked from being made public")
}

test_a_bucket_with_no_versioning_is_denied if {
	messages := deny with input as bucket_without("aws_s3_bucket_versioning")
	count(messages) == 1
	reports(messages, "has no versioning")
}

test_a_bucket_with_no_encryption_is_denied if {
	messages := deny with input as bucket_without("aws_s3_bucket_server_side_encryption_configuration")
	count(messages) == 1
	reports(messages, "is not encrypted at rest")
}

test_a_bare_bucket_is_denied_on_all_three_counts if {
	messages := deny with input as {"resource": {"aws_s3_bucket": {"config": [{"bucket": "x"}]}}}
	count(messages) == 3
}

# The rule matches companions by what they reference, not by whether they share
# the bucket's local name. This is the case that separates the two: a companion
# that exists, is named identically, and points at a different bucket.
test_a_companion_pointing_at_another_bucket_does_not_count if {
	input_doc := {"resource": {
		"aws_s3_bucket": {"config": [{"bucket": "x"}]},
		"aws_s3_bucket_public_access_block": {"config": [{
			"bucket": "${aws_s3_bucket.somewhere_else.id}",
			"block_public_acls": true,
			"block_public_policy": true,
			"ignore_public_acls": true,
			"restrict_public_buckets": true,
		}]},
	}}

	messages := deny with input as input_doc
	reports(messages, "is not blocked from being made public")
}

# The mirror image, and the reason the rule is written this way round: a
# correctly wired pair whose local names differ must pass.
test_a_companion_with_a_different_local_name_still_counts if {
	input_doc := {"resource": {
		"aws_s3_bucket": {"config": [{"bucket": "x"}]},
		"aws_s3_bucket_public_access_block": {"lockdown": [{
			"bucket": "${aws_s3_bucket.config.id}",
			"block_public_acls": true,
			"block_public_policy": true,
			"ignore_public_acls": true,
			"restrict_public_buckets": true,
		}]},
	}}

	messages := deny with input as input_doc
	not reports(messages, "is not blocked from being made public")
}

test_an_access_block_with_a_setting_switched_off_is_denied if {
	input_doc := object.union(compliant_bucket, {"resource": {"aws_s3_bucket_public_access_block": {"config": [{
		"bucket": "${aws_s3_bucket.config.id}",
		"block_public_acls": true,
		"block_public_policy": false,
		"ignore_public_acls": true,
		"restrict_public_buckets": true,
	}]}}})

	messages := deny with input as input_doc
	count(messages) == 1
	reports(messages, "does not set block_public_policy")
}

# Absent is not the same as false to a reader and is exactly the same to AWS.
# The resource's own defaults are false, so an omitted setting permits what the
# resource is named for preventing.
test_an_access_block_with_a_setting_omitted_is_denied if {
	input_doc := object.union(compliant_bucket, {"resource": {"aws_s3_bucket_public_access_block": {"config": [{
		"bucket": "${aws_s3_bucket.config.id}",
		"block_public_acls": true,
		"block_public_policy": true,
		"ignore_public_acls": true,
	}]}}})

	messages := deny with input as input_doc
	count(messages) == 1
	reports(messages, "does not set restrict_public_buckets")
}

test_force_destroy_is_denied if {
	input_doc := object.union(compliant_bucket, {"resource": {"aws_s3_bucket": {"config": [{
		"bucket": "${local.bucket_name}",
		"force_destroy": true,
	}]}}})

	messages := deny with input as input_doc
	count(messages) == 1
	reports(messages, "sets force_destroy")
}

test_force_destroy_set_to_false_is_allowed if {
	input_doc := object.union(compliant_bucket, {"resource": {"aws_s3_bucket": {"config": [{
		"bucket": "${local.bucket_name}",
		"force_destroy": false,
	}]}}})

	count(deny) == 0 with input as input_doc
}

# Terraform that creates no bucket has nothing to answer for. Worth asserting:
# most files in a repository are this case, and a rule that fires on them is a
# rule everyone learns to ignore.
test_terraform_with_no_buckets_is_allowed if {
	count(deny) == 0 with input as {"variable": {"environment": [{"type": "${string}"}]}}
}
