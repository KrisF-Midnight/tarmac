package main

# Where an image came from, and whether the reference still means the same
# bytes tomorrow.
#
# This is the half of pod security that Pod Security Admission does not cover
# and structurally cannot: PSA reasons about what a container is permitted to
# *do* once it is running — privilege, capabilities, host access — and has
# nothing to say about provenance. A perfectly restricted pod running an
# arbitrary image from an arbitrary registry passes PSA cleanly.

# The registries this platform will run code from. Not a security boundary on
# its own — anyone can push to a public registry — but it is the boundary that
# makes the digest rule below mean something, because it says which namespace
# of names we are pinning within.
allowed_registries := {"ghcr.io/"}

deny contains msg if {
	some container in containers
	not from_allowed_registry(container.image)
	msg := sprintf(
		"%s: container %q pulls %q — images must come from %s",
		[subject, container.name, container.image, concat(", ", allowed_registries)],
	)
}

# Guarded on the registry check so an image that fails both rules produces one
# message rather than two. The second finding is not wrong, it is just noise on
# top of the finding that already explains the problem.
deny contains msg if {
	some container in containers
	from_allowed_registry(container.image)
	not digest_pinned(container.image)
	msg := sprintf(
		"%s: container %q pulls %q — images must be pinned by digest, not by tag",
		[subject, container.name, container.image],
	)
}

from_allowed_registry(image) if {
	some prefix in allowed_registries
	startswith(image, prefix)
}

# A tag is a pointer somebody else can move. A digest is the bytes. The whole
# delivery pipeline is built on writing a digest into git, so a manifest that
# reintroduces a tag quietly undoes the property the pipeline exists to provide.
digest_pinned(image) if {
	contains(image, "@sha256:")
}
