package main

# The environment enum, and the one thing that can be done about it being copied.
#
# It exists three times: as an HCL validation in
# `infra/modules/app-dependencies/variables.tf`, as a Rego set in
# `policy/kubernetes/config_bucket.rego`, and — because conftest runs each policy
# directory as its own program with its own document — as the copy below. There
# is no shared definition available to the three of them: Rego cannot read HCL,
# and the two policy directories cannot import each other. Restructuring to
# remove the duplication is not on the table; what is on the table is removing
# the silence around it.
#
# The Kubernetes rule builds the set of bucket names a Deployment may name from
# its own copy of this list. Add a fourth environment to variables.tf and that
# rule keeps enforcing three: it keeps passing, and it rejects a manifest for an
# environment the module will happily build a bucket for. Nothing in that run
# says a list went stale. This rule reads the validation out of the parsed HCL
# and fails the moment it stops saying what the other two copies say, so the
# divergence is reported by the change that causes it rather than by whoever
# meets it next.

# The list the other two copies hold. Changing it here is half of the edit; the
# other half is `policy/kubernetes/config_bucket.rego`, and this rule exists to
# make skipping either half loud.
environments := {"local", "staging", "production"}

# The other two copies, named in the message so the reader is told where the rest
# of the edit is rather than left to find out.
mirrors := "policy/kubernetes/config_bucket.rego and policy/terraform/environments.rego"

# The `environment` variable's validation conditions, as conftest parses them:
# one string each, with the interpolation markers still attached. A list, because
# HCL permits several validation blocks on one variable.
environment_conditions contains condition if {
	some block in input.variable.environment
	some validation in block.validation
	condition := validation.condition
}

# The values a `contains([…], var.environment)` condition allows. Undefined for a
# condition written any other way, which is what the second rule below is for —
# the alternative is a rule that silently stops checking the moment somebody
# rewrites the validation as a regex.
allowed_by(condition) := values if {
	captures := regex.find_all_string_submatch_n(
		`contains\(\s*\[([^\]]*)\]\s*,\s*var\.environment\s*\)`,
		condition,
		1,
	)

	# Bound out here rather than inside the comprehension below, and that is not a
	# style choice: a comprehension whose body never succeeds is an empty set, not
	# an undefined one, so leaving the lookup inside would turn "this condition is
	# not a list" into "this condition lists nothing" and report the wrong thing.
	list_text := captures[0][1]

	values := {value |
		some quoted in regex.find_all_string_submatch_n(`"([^"]*)"`, list_text, -1)
		value := quoted[1]
	}
}

deny contains msg if {
	some condition in environment_conditions
	allowed := allowed_by(condition)
	allowed != environments
	msg := sprintf(
		"the environment validation allows %s, but %s mirror %s — a list that only moves in one of the three is a check that passes while enforcing something else",
		[as_text(allowed), mirrors, as_text(environments)],
	)
}

# A validation this rule cannot read is not a validation this rule has approved.
# Reported rather than ignored, because "no message" has to keep meaning "checked
# and clean" for the rule to be worth having at all.
deny contains msg if {
	some condition in environment_conditions
	not allowed_by(condition)
	msg := sprintf(
		"the environment validation is %q, which this rule cannot read as a list of environments — it checks that list against the copies in %s, and cannot do so here",
		[condition, mirrors],
	)
}

as_text(values) := concat(", ", sort(values))

# What this does not catch:
#
#   - A variable named `environment` that has no validation at all. The
#     application's own Terraform declares one and passes it straight through to
#     the module, which is where the constraint belongs; requiring it in both
#     places would fail every caller for restating nothing.
#   - The Kubernetes copy being edited on its own. Nothing in the Terraform
#     document can see that file. This rule catches the half of the divergence
#     that starts here, which is the half that actually happens — the enum is
#     changed because a new environment is wanted, and variables.tf is where it
#     gets wanted first.
