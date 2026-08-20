package main

test_a_container_declaring_both_requests_and_limits_is_allowed if {
	count(deny) == 0 with input as deployment_with([compliant_container])
}

test_a_container_with_no_resources_at_all_is_denied_on_every_count if {
	messages := deny with input as deployment_with([container_without("resources")])
	count(messages) == 4
	reports(messages, "no cpu request")
	reports(messages, "no memory request")
	reports(messages, "no cpu limit")
	reports(messages, "no memory limit")
}

test_requests_without_limits_is_denied if {
	container := container_with_resources({"requests": {"cpu": "25m", "memory": "64Mi"}})
	messages := deny with input as deployment_with([container])

	count(messages) == 2
	reports(messages, "no cpu limit")
	reports(messages, "no memory limit")
}

# The half-configured case, which is the one that actually happens: somebody
# sets memory because they were told to and leaves CPU because it was harder to
# guess. Named separately so the rule cannot be satisfied by checking that a
# `limits` block merely exists.
test_a_limits_block_missing_one_resource_is_denied if {
	container := container_with_resources({
		"requests": {"cpu": "25m", "memory": "64Mi"},
		"limits": {"memory": "256Mi"},
	})

	messages := deny with input as deployment_with([container])
	count(messages) == 1
	reports(messages, "no cpu limit")
}

test_the_offending_container_is_named_in_the_message if {
	container := object.union(container_without("resources"), {"name": "sidecar"})
	messages := deny with input as deployment_with([container])
	reports(messages, "\"sidecar\"")
}
