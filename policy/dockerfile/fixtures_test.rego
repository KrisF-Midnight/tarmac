package main

# conftest's dockerfile parser hands Rego a flat list of instructions in file
# order — not a tree of stages — with the stage number as a field on each one
# and the whole of a FROM line as `Value`, tokenised: `["node:20", "AS",
# "build"]`. The fixtures reproduce that shape rather than an idealised one, for
# the reason the Terraform fixtures give at more length: a rule written against
# the tidier shape passes its tests and finds nothing in a real file.

# A digest that is the right shape and points at nothing. Sixty-four zeroes,
# because a plausible-looking digest in a fixture is one somebody eventually
# copies into a real Dockerfile.
zero_digest := "sha256:0000000000000000000000000000000000000000000000000000000000000000"

pinned_base := sprintf("oven/bun:1.3.14-alpine@%s", [zero_digest])

# One instruction, in the parser's shape. `Flags` and `SubCmd` are carried even
# though no rule here reads them, so that a rule which later does is written
# against the real input and not against what the fixtures happened to include.
instruction(stage, cmd, value) := {
	"Cmd": cmd,
	"Flags": [],
	"JSON": false,
	"Stage": stage,
	"SubCmd": "",
	"Value": value,
}

# The single-stage shape: one FROM and enough around it that a rule iterating
# `input` has to pick the FROM out rather than being handed it.
dockerfile_with(base) := [
	instruction(0, "from", [base]),
	instruction(0, "workdir", ["/app"]),
	instruction(0, "cmd", ["bun", "src/server.ts"]),
]

# The multi-stage shape the applications on this road actually use: a
# dependency stage and a runtime stage, each named, each with its own FROM.
multi_stage(deps_base, runtime_base) := [
	instruction(0, "from", [deps_base, "AS", "deps"]),
	instruction(0, "run", ["bun install --frozen-lockfile --production"]),
	instruction(1, "from", [runtime_base, "AS", "runtime"]),
	instruction(1, "copy", ["/app/node_modules", "./node_modules"]),
	instruction(1, "cmd", ["bun", "src/server.ts"]),
]

# The ARG-parameterised form, which is how one digest is written once and used
# by several stages. The declaration is passed in whole so a test can supply
# `BUN_IMAGE=<something>` or a bare `BUN_IMAGE` with no default at all.
arg_parameterised(declaration) := array.concat(
	[instruction(0, "arg", [declaration])],
	multi_stage("${BUN_IMAGE}", "${BUN_IMAGE}"),
)

# Whether any message in a result set names the problem under test. Tests match
# on a fragment of the message rather than on the size of the set, because a
# fixture that trips two rules at once should still let each test say which of
# the two it meant.
reports(messages, fragment) if {
	some msg in messages
	contains(msg, fragment)
}
