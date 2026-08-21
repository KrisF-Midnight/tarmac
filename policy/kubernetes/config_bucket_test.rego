package main

test_a_bucket_named_the_way_the_module_names_it_is_allowed if {
	count(deny) == 0 with input as deployment_with([compliant_container])
}

# All three named, so that adding a fourth environment to the module's
# variables.tf without adding it here fails a test rather than a deploy.
test_every_environment_the_module_accepts_is_accepted_here if {
	count(deny) == 0 with input as deployment_with([container_with_config_bucket("example-local-config")])
	count(deny) == 0 with input as deployment_with([container_with_config_bucket("example-staging-config")])
	count(deny) == 0 with input as deployment_with([container_with_config_bucket("example-production-config")])
}

test_a_bucket_belonging_to_another_application_is_denied if {
	messages := deny with input as deployment_with([container_with_config_bucket("other-local-config")])
	reports(messages, "<app>-<environment>-config")
}

# The failure this rule was written for: a typo in the middle segment produces a
# name that reads correctly and refers to nothing.
test_an_environment_the_module_would_reject_is_denied if {
	messages := deny with input as deployment_with([container_with_config_bucket("example-lcoal-config")])
	reports(messages, "<app>-<environment>-config")
}

test_a_name_missing_the_config_suffix_is_denied if {
	messages := deny with input as deployment_with([container_with_config_bucket("example-local")])
	reports(messages, "<app>-<environment>-config")
}

test_an_empty_value_is_denied if {
	messages := deny with input as deployment_with([container_with_config_bucket("")])
	reports(messages, "<app>-<environment>-config")
}

test_the_offending_value_is_named_in_the_message if {
	messages := deny with input as deployment_with([container_with_config_bucket("example-lcoal-config")])
	reports(messages, "example-lcoal-config")
}

# A message that says only "wrong" sends the reader to the Terraform to work out
# what right would have been. The acceptable names are cheap to compute, so the
# rule computes them.
test_the_message_lists_the_names_that_would_have_passed if {
	messages := deny with input as deployment_with([container_with_config_bucket("nope")])
	reports(messages, "example-local-config")
	reports(messages, "example-production-config")
	reports(messages, "example-staging-config")
}

test_other_environment_variables_are_not_this_rules_business if {
	container := container_with_env([
		{"name": "AWS_ENDPOINT_URL_S3", "value": "http://aws:4566"},
		{"name": "CONFIG_BUCKET", "value": "example-local-config"},
	])

	count(deny) == 0 with input as deployment_with([container])
}

test_init_containers_are_held_to_the_same_standard if {
	workload := object.union(deployment_with([compliant_container]), {"spec": {"template": {"spec": {"initContainers": [container_with_config_bucket("example-lcoal-config")]}}}})

	messages := deny with input as workload
	reports(messages, "example-lcoal-config")
}

# The rule binds its expectation to the app label, so a workload without one
# cannot be checked. It is denied rather than skipped: a check that silently
# passes when the thing it needs is missing is a check anyone can switch off for
# their own workload by deleting a line.
test_a_workload_with_no_app_label_cannot_be_checked_and_is_denied if {
	messages := deny with input as deployment_without_app_label([compliant_container])
	reports(messages, "nothing binds that bucket to an application")
}

# Guarded for the same reason the digest rule is guarded on the registry rule:
# without the guard this is two findings for one mistake, and the second one
# lists expected names built from an app name that was never there.
test_a_workload_with_no_app_label_is_reported_once if {
	messages := deny with input as deployment_without_app_label([compliant_container])
	count(messages) == 1
}

# A documented gap, asserted so that it stays a decision rather than becoming a
# surprise. The value is not in this object — it is in a ConfigMap that conftest
# scans separately — so there is nothing here to compare against.
test_a_bucket_supplied_by_reference_is_not_checked if {
	container := container_with_env([{
		"name": "CONFIG_BUCKET",
		"valueFrom": {"configMapKeyRef": {"name": "greeter", "key": "bucket"}},
	}])

	count(deny) == 0 with input as deployment_with([container])
}

# Kinds with no pod template have no containers, so the rule is undefined for
# them rather than being kept correct by a list of exemptions.
test_an_object_with_no_containers_is_not_reached if {
	count(deny) == 0 with input as {
		"kind": "Service",
		"metadata": {"name": "example"},
		"spec": {"ports": [{"port": 80}]},
	}
}
