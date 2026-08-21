package main

# What the Dockerfile builds *on*, and whether that reference still means the
# same bytes tomorrow.
#
# This closes a hole that the other two copies of the digest rule structurally
# cannot see. `policy/kubernetes/images.rego` and
# `policy/admission/require-pinned-images.yaml` both read container images out
# of Kubernetes objects, so they judge the image this platform publishes — and
# that one is pinned by construction, because the pipeline writes the digest it
# just pushed. Neither of them has ever read a Dockerfile. A base image changed
# from a digest to a mutable tag passes both, and every downstream digest is
# then a precise pin on bytes nobody reviewed.
#
# Note what this does not do: there is no registry allowlist here, unlike the
# Kubernetes rules. Base images legitimately come from Docker Hub and from
# vendor registries, and a list of permitted upstreams is a policy decision
# this platform has not made. The digest is the part that is not negotiable.

# The FROM lines, in file order.
#
# An array comprehension rather than a set, because two stages can legitimately
# be built from the same base — `deps` and `runtime` in the applications on this
# road both are — and a set would collapse them into one finding.
from_instructions := [instruction |
	some instruction in input
	instruction.Cmd == "from"
]

# `ARG NAME=value` declarations, as a name-to-default lookup.
#
# Every ARG in the file, not only the ones declared before the first FROM. The
# parser reports a global ARG as belonging to stage 0, so the two cannot be told
# apart here, and over-collecting is the safe direction: the worst case is that
# a rule resolves a name Docker would have left unset, which produces a finding
# about the wrong thing rather than silence about the right one.
arg_defaults[name] := value if {
	some instruction in input
	instruction.Cmd == "arg"
	some declaration in instruction.Value
	at := indexof(declaration, "=")
	at > 0
	name := substring(declaration, 0, at)
	value := substring(declaration, at + 1, -1)
}

# The stage names this file declares, lower-cased because `AS builder` and
# `as Builder` name the same stage as far as Docker is concerned.
stage_names contains lower(instruction.Value[2]) if {
	some instruction in from_instructions
	count(instruction.Value) > 2
	lower(instruction.Value[1]) == "as"
}

# The variable a base reference is, when it is nothing but a variable.
#
# `FROM ${BUN_IMAGE}` is the shape that matters: it is how a Dockerfile keeps
# one digest in one place and uses it in several stages, and it is what the
# applications on this road do. A reference that merely *contains* a variable —
# `FROM ${REGISTRY}/app:${TAG}` — is deliberately not resolved. Half-expanding
# it would produce a message quoting a string that appears nowhere in the file,
# and the digest test below already reaches the right verdict on it unexpanded.
variable_in(reference) := name if {
	matches := regex.find_all_string_submatch_n(`^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$`, reference, 1)
	name := matches[0][1]
}

# One level of substitution, and one only. An ARG whose default is written in
# terms of another ARG resolves to a string that still contains a `$`, which
# carries no digest and so is denied below rather than silently accepted.
#
# Undefined — deliberately — for a variable with no default in this file. That
# is what guards the second rule below against firing on the same line as the
# first, so the reader gets the message that explains the problem instead of
# both. Asserted in the tests rather than left to be rediscovered.
resolve(reference) := arg_defaults[variable_in(reference)]

resolve(reference) := reference if not variable_in(reference)

# Bases that have no digest to be pinned to, and are still legitimate.
#
# `scratch` is the empty image — it is a keyword, not a reference, and there is
# nothing in a registry for it to point at. A stage name is a reference to
# something built earlier in this same file, which is pinned transitively by
# whatever that stage was built from; Docker resolves a stage name in preference
# to a registry lookup, so this is the same thing Docker does.
exempt(base) if lower(base) == "scratch"

exempt(base) if lower(base) in stage_names

# A tag is a pointer somebody else can move. A digest is the bytes. The same
# test the Kubernetes rules apply, stated again here rather than shared, because
# the two run under different parsers against different inputs and a shared
# helper would only be shared until one of them needed to change.
digest_pinned(reference) if contains(reference, "@sha256:")

# How to name a stage in a message. Its own name when it has one, because that
# is what the author will search the file for; otherwise its position, counted
# from one — the parser counts from zero and no Dockerfile ever did.
stage_label(instruction) := sprintf("stage %q", [instruction.Value[2]]) if {
	count(instruction.Value) > 2
	lower(instruction.Value[1]) == "as"
} else := sprintf("stage %d", [instruction.Stage + 1])

# An ARG-parameterised base with no default in this file. The base image is then
# whatever `--build-arg` supplied, which means the file does not say what it
# builds on and review cannot tell.
deny contains msg if {
	some instruction in from_instructions
	reference := instruction.Value[0]
	name := variable_in(reference)
	not arg_defaults[name]
	msg := sprintf(
		"%s builds `FROM %s` — ARG %q has no default here, so the base image is chosen at build time",
		[stage_label(instruction), reference, name],
	)
}

# Guarded on the rule above — `resolve` is undefined for a base the rule above
# reports, so this one cannot also fire on it. Same guarding as the Kubernetes
# image rules, for the same reason: the second finding would send the reader off
# to add a digest to a string that is not an image reference.
deny contains msg if {
	some instruction in from_instructions
	reference := instruction.Value[0]
	base := resolve(reference)
	not exempt(base)
	not digest_pinned(base)
	msg := sprintf(
		"%s builds `FROM %s` — base images must be pinned by digest, not by tag",
		[stage_label(instruction), base],
	)
}
