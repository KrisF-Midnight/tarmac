package main

# One object that satisfies every rule in this directory, and constructors that
# break it in one place at a time.
#
# Tests are written as a diff from this fixture rather than as bespoke objects,
# for a reason that matters more than tidiness: when a new rule lands with a
# wider reach than its author intended, it fails *every* allow test at once
# instead of quietly passing because each test happened to omit the field the
# new rule inspects. The blast radius is the signal.

compliant_container := {
	"name": "app",
	"image": "ghcr.io/example/app@sha256:0000000000000000000000000000000000000000000000000000000000000000",
	"resources": {
		"requests": {"cpu": "25m", "memory": "64Mi"},
		"limits": {"cpu": "500m", "memory": "256Mi"},
	},
}

deployment_with(containers) := {
	"kind": "Deployment",
	"metadata": {"name": "example"},
	"spec": {"template": {"spec": {"containers": containers}}},
}

# A container that is compliant except for the one field named.
container_without(field) := object.remove(compliant_container, [field])

container_with_image(image) := object.union(compliant_container, {"image": image})

# Replaces the resources block wholesale. `object.union` merges deeply, so
# unioning a narrower `resources` onto the fixture would quietly keep the
# fixture's other entries — and a test that meant to remove the limits would
# assert against a container that still has them.
container_with_resources(resources) := object.union(
	object.remove(compliant_container, ["resources"]),
	{"resources": resources},
)

# Whether any message in a result set names the problem under test. Tests match
# on a fragment of the message rather than on the size of the set, because a
# fixture that trips two rules at once should still let each test say which of
# the two it meant.
reports(messages, fragment) if {
	some msg in messages
	contains(msg, fragment)
}
