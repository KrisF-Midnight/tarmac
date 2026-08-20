package main

test_digest_pinned_image_from_the_platform_registry_is_allowed if {
	count(deny) == 0 with input as deployment_with([compliant_container])
}

test_an_image_pinned_only_by_tag_is_denied if {
	messages := deny with input as deployment_with([container_with_image("ghcr.io/example/app:v1.2.3")])
	reports(messages, "pinned by digest")
}

test_the_latest_tag_is_denied_like_any_other_tag if {
	messages := deny with input as deployment_with([container_with_image("ghcr.io/example/app:latest")])
	reports(messages, "pinned by digest")
}

test_an_image_from_another_registry_is_denied if {
	messages := deny with input as deployment_with([container_with_image("docker.io/library/nginx@sha256:abc")])
	reports(messages, "must come from")
}

# The digest rule is guarded on the registry rule so that an image failing both
# produces the message that explains the problem, not both messages. Asserted
# rather than assumed: without the guard this is two findings for one mistake,
# and the second one sends the reader off to add a digest to an image they
# should not be running at all.
test_an_unpinned_image_from_another_registry_is_reported_once if {
	messages := deny with input as deployment_with([container_with_image("docker.io/library/nginx:latest")])
	count(messages) == 1
	reports(messages, "must come from")
}

test_init_containers_are_held_to_the_same_standard if {
	workload := {
		"kind": "Deployment",
		"metadata": {"name": "example"},
		"spec": {"template": {"spec": {
			"containers": [compliant_container],
			"initContainers": [container_with_image("ghcr.io/example/setup:v1")],
		}}},
	}

	messages := deny with input as workload
	reports(messages, "pinned by digest")
}

test_the_offending_image_is_named_in_the_message if {
	messages := deny with input as deployment_with([container_with_image("ghcr.io/example/app:v1.2.3")])
	reports(messages, "ghcr.io/example/app:v1.2.3")
}
