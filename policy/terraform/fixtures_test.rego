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

# The objects `var.config` becomes. Kept out of `compliant_bucket` because only
# the name rule needs them — they are what identifies the app-dependencies module
# rather than any other bucket.
config_objects := {"aws_s3_object": {"config": [{
	"bucket": "${aws_s3_bucket.config.id}",
	"for_each": "${var.config}",
	"key": "${each.key}",
	"content": "${each.value}",
}]}}

# The app-dependencies module as conftest parses it: the compliant bucket above,
# its config objects, and the `locals` block that supplies its name. Built from
# the compliant fixture so that a test of the name expression counts messages
# about the name expression and nothing else.
config_bucket_module(expression) := config_bucket_module_named("bucket_name", expression)

# The same module with the name held under a different identifier. A parameter of
# the fixture rather than a fact about the module, because the rule follows the
# bucket's reference to find the local instead of knowing what it is called.
#
# `locals` is a *list* here for the same reason resources are — HCL permits
# several blocks and Terraform merges them.
config_bucket_module_named(local_name, expression) := {
	"locals": [{local_name: expression}],
	"resource": object.union(
		object.union(compliant_bucket.resource, config_objects),
		{"aws_s3_bucket": {"config": [{"bucket": sprintf("${local.%s}", [local_name])}]}},
	),
}

reports(messages, fragment) if {
	some msg in messages
	contains(msg, fragment)
}
