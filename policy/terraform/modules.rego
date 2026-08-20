package main

# Reported rather than blocked, for a reason with an expiry date on it.
#
# A module source that is neither a pinned ref nor a versioned registry entry
# means the caller builds against whatever happens to be checked out beside it.
# Change the module, and every consumer's next apply picks it up — including the
# consumers nobody told, and including the apply that was meant to be a no-op.
#
# This repository does exactly that today. The application's Terraform reaches
# the platform module by relative path, because the platform is not published
# and there is no ref to pin to; CI reproduces the laptop's directory layout to
# make the same path resolve in both places. It is an accepted cost, written
# down in the decision record, and it becomes a one-line change to
# `git::…//infra/modules/app-dependencies?ref=v1` the day the platform has a tag.
#
# Blocking it would fail the build for a state the platform has already decided
# to be in, which teaches everyone that a red policy check is something you
# route around. Warning states it every run and leaves the decision visible.
warn contains msg if {
	some name, blocks in input.module
	some block in blocks
	not pinned(block)
	msg := sprintf(
		"module %q sources %q, which is not pinned to a version — its contents can change under the caller",
		[name, block.source],
	)
}

# A git source pinned by ref, or a registry source with a version constraint.
# Nothing else counts: a bare path and a branch-tracking git URL are the same
# thing wearing different syntax.
pinned(block) if {
	contains(block.source, "?ref=")
}

pinned(block) if {
	block.version
}
