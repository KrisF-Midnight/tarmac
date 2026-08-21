package main

test_a_base_pinned_by_digest_is_allowed if {
	count(deny) == 0 with input as dockerfile_with(pinned_base)
}

test_a_base_pinned_only_by_tag_is_denied if {
	messages := deny with input as dockerfile_with("oven/bun:1.3.14-alpine")
	reports(messages, "pinned by digest")
}

# `FROM node` is `node:latest` as far as the registry is concerned, and the
# absence of a tag reads to a human like there is nothing to move. There is.
test_a_base_with_no_tag_at_all_is_denied if {
	messages := deny with input as dockerfile_with("node")
	reports(messages, "pinned by digest")
}

test_the_latest_tag_is_denied_like_any_other_tag if {
	messages := deny with input as dockerfile_with("node:latest")
	reports(messages, "pinned by digest")
}

# `scratch` is the empty image: a keyword, not a reference. There is nothing in
# any registry for it to point at, so there is nothing that can move, and a rule
# that demanded a digest here would ban the most minimal base there is.
test_scratch_is_allowed_because_there_is_nothing_to_pin if {
	count(deny) == 0 with input as dockerfile_with("scratch")
}

test_scratch_is_recognised_whatever_its_case if {
	count(deny) == 0 with input as dockerfile_with("SCRATCH")
}

test_a_multi_stage_build_pinned_throughout_is_allowed if {
	count(deny) == 0 with input as multi_stage(pinned_base, pinned_base)
}

# The case the whole rule exists for. One stage of two left on a tag is still a
# mutable input to the image that ships, and a rule that only read the last
# FROM would call this file clean.
test_one_unpinned_stage_out_of_two_is_denied if {
	messages := deny with input as multi_stage("oven/bun:1.3.14-alpine", pinned_base)
	reports(messages, "pinned by digest")
}

test_an_unpinned_final_stage_is_denied_too if {
	messages := deny with input as multi_stage(pinned_base, "oven/bun:1.3.14-alpine")
	reports(messages, "pinned by digest")
}

test_each_unpinned_stage_is_reported_separately if {
	messages := deny with input as multi_stage("oven/bun:1", "oven/bun:2")
	count(messages) == 2
}

# The offending stage is named rather than numbered when it has a name, because
# that is the string the author will search the file for.
test_the_offending_stage_is_named_in_the_message if {
	messages := deny with input as multi_stage(pinned_base, "oven/bun:1.3.14-alpine")
	reports(messages, "stage \"runtime\"")
}

# And numbered from one when it has no name. The parser counts stages from zero;
# no Dockerfile ever did, and "stage 0" sends the reader to the wrong line.
test_an_unnamed_stage_is_numbered_from_one if {
	messages := deny with input as dockerfile_with("node:latest")
	reports(messages, "stage 1")
}

test_the_offending_base_is_quoted_in_the_message if {
	messages := deny with input as dockerfile_with("oven/bun:1.3.14-alpine")
	reports(messages, "FROM oven/bun:1.3.14-alpine")
}

# A stage built on an earlier stage in the same file. There is no digest to
# demand — the reference is internal, and what that stage was built from is
# already covered by its own FROM.
test_a_stage_built_on_an_earlier_stage_is_allowed if {
	count(deny) == 0 with input as multi_stage(pinned_base, "deps")
}

test_a_stage_reference_is_matched_case_insensitively if {
	count(deny) == 0 with input as multi_stage(pinned_base, "DEPS")
}

# ARG-parameterisation is how the applications on this road keep one digest in
# one place. The rule has to follow the substitution or it would deny every
# well-written Dockerfile in the estate.
test_an_arg_parameterised_base_resolves_to_its_default if {
	count(deny) == 0 with input as arg_parameterised(sprintf("BUN_IMAGE=%s", [pinned_base]))
}

test_an_arg_default_pinned_only_by_tag_is_denied if {
	messages := deny with input as arg_parameterised("BUN_IMAGE=oven/bun:1.3.14-alpine")
	reports(messages, "pinned by digest")
}

# Both stages use the same ARG, so both are wrong. Two findings, not one — the
# FROM lines are what gets edited, and there are two of them.
test_a_bad_arg_default_is_reported_at_every_stage_that_uses_it if {
	messages := deny with input as arg_parameterised("BUN_IMAGE=oven/bun:1.3.14-alpine")
	count(messages) == 2
}

# An ARG with no default means `--build-arg` decides the base image, and the
# file no longer says what it builds on. Denied with its own message, because
# "pin it by digest" is not the fix — giving the ARG a default is.
test_an_arg_with_no_default_is_denied if {
	messages := deny with input as arg_parameterised("BUN_IMAGE")
	reports(messages, "no default here")
}

# Guarded, the way the Kubernetes image rules are. Without it this is two
# findings for one mistake, and the second one asks the reader to add a digest
# to `${BUN_IMAGE}`, which is not an image reference.
test_an_arg_with_no_default_is_reported_once_per_stage if {
	messages := deny with input as arg_parameterised("BUN_IMAGE")
	count(messages) == 2
	not reports(messages, "pinned by digest")
}

# Not every use of a variable is a whole-value substitution, and this one is not
# resolved. It still has to be denied: there is no digest anywhere in it.
test_a_base_assembled_from_variables_is_denied if {
	messages := deny with input as dockerfile_with("${REGISTRY}/app:${TAG}")
	reports(messages, "pinned by digest")
}

# The `$NAME` form without braces is the same substitution and gets the same
# treatment. Worth asserting rather than assuming: a rule that only understood
# `${NAME}` would wave this through unresolved and then wave it through again
# for containing no digest to check.
test_the_unbraced_variable_form_is_resolved_too if {
	count(deny) == 0 with input as array.concat(
		[instruction(0, "arg", [sprintf("BUN_IMAGE=%s", [pinned_base])])],
		[instruction(0, "from", ["$BUN_IMAGE"])],
	)
}

# A file with no FROM at all is not a Dockerfile this platform will ever build,
# and it is not this rule's job to say so. Silence here rather than a finding
# about a file that has a different problem.
test_a_file_with_no_from_produces_nothing if {
	count(deny) == 0 with input as [instruction(0, "comment", ["nothing to see"])]
}
