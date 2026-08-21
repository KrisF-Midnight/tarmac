package main

# The conditions below are written the way conftest hands them over: the whole
# expression wrapped in `${…}`, unevaluated.
environment_variable(condition) := {"variable": {"environment": [{
	"type": "${string}",
	"default": "local",
	"validation": [{
		"condition": condition,
		"error_message": "environment must be one of: local, staging, production.",
	}],
}]}}

test_the_list_the_other_copies_hold_is_allowed if {
	count(deny) == 0 with input as environment_variable(`${contains(["local", "staging", "production"], var.environment)}`)
}

# Order is not part of the agreement — the Kubernetes copy is a set.
test_the_same_list_in_another_order_is_allowed if {
	count(deny) == 0 with input as environment_variable(`${contains(["production", "local", "staging"], var.environment)}`)
}

# The failure this rule exists for: a new environment wanted, variables.tf
# widened, and the Kubernetes rule left enforcing the old three.
test_a_fourth_environment_is_denied if {
	messages := deny with input as environment_variable(`${contains(["local", "staging", "production", "sandbox"], var.environment)}`)
	count(messages) == 1
	reports(messages, "policy/kubernetes/config_bucket.rego")
	reports(messages, "sandbox")
}

test_an_environment_dropped_is_denied if {
	messages := deny with input as environment_variable(`${contains(["local", "production"], var.environment)}`)
	count(messages) == 1
}

test_an_environment_renamed_is_denied if {
	messages := deny with input as environment_variable(`${contains(["local", "staging", "prod"], var.environment)}`)
	count(messages) == 1
}

# A validation that no longer states a list states nothing this rule can compare,
# and saying nothing about it would look exactly like approving it.
test_a_validation_this_rule_cannot_read_is_denied if {
	messages := deny with input as environment_variable(`${can(regex("^(local|staging|production)$", var.environment))}`)
	count(messages) == 1
	reports(messages, "cannot read as a list of environments")
}

# The application's own Terraform: an `environment` variable that constrains
# nothing, because the module it is passed to does the constraining.
test_an_environment_variable_with_no_validation_is_allowed if {
	count(deny) == 0 with input as {"variable": {"environment": [{"type": "${string}", "default": "local"}]}}
}

test_terraform_with_no_variables_is_allowed if {
	count(deny) == 0 with input as compliant_bucket
}
