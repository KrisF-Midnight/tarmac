package main

test_the_convention_the_kubernetes_rule_mirrors_is_allowed if {
	count(deny) == 0 with input as config_bucket_module("${var.app_name}-${var.environment}-config")
}

test_a_different_suffix_is_denied if {
	messages := deny with input as config_bucket_module("${var.app_name}-${var.environment}-settings")
	count(messages) == 1
	reports(messages, "policy/kubernetes/config_bucket.rego")
}

# The failure this pairing is most likely to have: a segment added, by someone
# who has never read the Kubernetes rule and has no reason to.
test_an_extra_segment_is_denied if {
	messages := deny with input as config_bucket_module("tarmac-${var.app_name}-${var.environment}-config")
	count(messages) == 1
	reports(messages, "the CONFIG_BUCKET env var")
}

test_the_segments_in_the_other_order_are_denied if {
	messages := deny with input as config_bucket_module("${var.environment}-${var.app_name}-config")
	count(messages) == 1
}

test_a_name_built_from_something_else_entirely_is_denied if {
	messages := deny with input as config_bucket_module("${var.app_name}-config")
	count(messages) == 1
}

# Legal HCL, untouched by `terraform fmt`, and the same string at apply time.
# Reporting it would be reporting formatting as a policy violation.
test_whitespace_inside_the_interpolation_is_allowed if {
	count(deny) == 0 with input as config_bucket_module("${ var.app_name }-${ var.environment }-config")
}

# The bypass the earlier version of this rule had, and the reason it mattered:
# renaming a local is a tidy-up anybody might do, changing the convention is not,
# and a rule that stops running on the first can no longer catch the second.
test_renaming_the_local_does_not_take_the_rule_out_of_scope if {
	messages := deny with input as config_bucket_module_named("config_bucket_name", "${var.app_name}-${var.environment}-settings")
	count(messages) == 1
	reports(messages, "local.config_bucket_name")
	reports(messages, "policy/kubernetes/config_bucket.rego")
}

test_a_renamed_local_still_building_the_convention_is_allowed if {
	count(deny) == 0 with input as config_bucket_module_named("config_bucket_name", "${var.app_name}-${var.environment}-config")
}

# Scope. The rule reads the local the bucket actually names, so a `bucket_name`
# local sitting beside it that nothing references is somebody else's variable with
# an unlucky name, not this module's.
test_a_bucket_name_local_no_bucket_uses_is_ignored if {
	input_doc := object.union(
		config_bucket_module_named("config_bucket_name", "${var.app_name}-${var.environment}-config"),
		{"locals": [{
			"config_bucket_name": "${var.app_name}-${var.environment}-config",
			"bucket_name": "whatever-you-like",
		}]},
	)

	messages := deny with input as input_doc
	not reports(messages, "policy/kubernetes/config_bucket.rego")
}

# Scope from the other side: a bucket named from a local, but none of the config
# objects that say which module this is, is not held to this module's convention.
test_a_bucket_without_the_config_objects_is_out_of_scope if {
	input_doc := object.union(
		compliant_bucket,
		{"locals": [{"bucket_name": "some-other-bucket"}]},
	)

	count(deny) == 0 with input as input_doc
}

# Terraform with no locals at all must not trip the rule, and must not error
# either: `input.locals` is simply absent in most files.
test_terraform_with_no_locals_is_allowed if {
	count(deny) == 0 with input as compliant_bucket
}
