package main

# The one value in the manifest that the platform, not the application, decides.
#
# `infra/modules/app-dependencies` names the config bucket
# `<app_name>-<environment>-config`, and the Deployment repeats the resulting
# literal as CONFIG_BUCKET. Two files, one convention, no link between them:
# rename the convention, or point an environment somewhere else, and the manifest
# keeps a name that no longer refers to anything.
#
# It does fail — 404 on the object, exception on the greeting path, 503 from
# /readyz, rollout stalls with the old pods still serving. That is the good
# version of the failure and it is still the wrong place for it, because by then
# the change is merged and the person reading the alert is not the person who
# made it. This rule moves it to the diff.
#
# What is asserted is the *shape* of the name, not the existence of the bucket.
# Nothing in a manifest can prove that an S3 bucket exists; a rule that claimed
# to would be lying about which failures it removes. See the closing note.

bucket_var := "CONFIG_BUCKET"

# The label the expected name is bound to. Not invented for this rule —
# `app.kubernetes.io/name` is the standard recommended label and every workload
# in this repository already carries it. A rule that needed a new annotation to
# work would be a rule that only ever checks manifests written after it.
app_label := "app.kubernetes.io/name"

# Mirrors the `environment` validation in the module's variables.tf. Duplicated
# on purpose and duplicated knowingly: Rego cannot read HCL, so the alternative
# is accepting any middle segment, which accepts `greeter-lcoal-config`. The cost
# is that adding a fourth environment means editing two files, and the tests
# below name all three so the omission is loud.
environments := {"local", "staging", "production"}

# The app this object says it belongs to. Undefined when the label is absent,
# which is the case the first rule below exists for.
declared_app := input.metadata.labels[app_label]

# Every name the module could have produced for this app.
expected_names := {name |
	some environment in environments
	name := sprintf("%s-%s-config", [declared_app, environment])
}

# Literal CONFIG_BUCKET settings, gathered once so the two rules below cannot
# disagree about what they are looking at.
#
# `env.value` only. An entry with `valueFrom` has no value here to compare — the
# name lives in a ConfigMap or Secret, which conftest scans as its own object.
# That is a real gap and it is listed in the closing note rather than papered
# over by denying a legitimate pattern.
config_bucket_settings contains setting if {
	some container in containers
	some env in container.env
	env.name == bucket_var
	env.value
	setting := {"container": container.name, "value": env.value}
}

# The object sets the variable and withholds what is needed to check it.
#
# Denied rather than skipped, because the alternative is a policy that anybody
# can switch off for their own workload by deleting a label — and switch off
# silently, since a skipped check and a passing check look identical in the run.
deny contains msg if {
	some setting in config_bucket_settings
	not declared_app
	msg := sprintf(
		"%s: container %q sets %s=%q, but the object carries no %s label — nothing binds that bucket to an application",
		[subject, setting.container, bucket_var, setting.value, app_label],
	)
}

# The name does not match anything the module would have created for this app.
#
# Guarded on `declared_app` so a workload missing the label produces the message
# above and not both: the second one would tell the reader to pick from a list of
# expected names built out of an empty app name.
deny contains msg if {
	some setting in config_bucket_settings
	declared_app
	not expected_names[setting.value]
	msg := sprintf(
		"%s: container %q sets %s=%q — the app-dependencies module names it <app>-<environment>-config, so this must be one of: %s",
		[subject, setting.container, bucket_var, setting.value, concat(", ", sort(expected_names))],
	)
}

# What this does not catch, stated where the next person to trust it will read it:
#
#   - Which environment. The manifest genuinely does not know — the same
#     directory is what a staging overlay would be built from — so
#     `greeter-production-config` in the local deployment passes. Binding the
#     environment would need a new label, and inventing one to make the rule look
#     stronger buys nothing: the label would be written by the same hand, in the
#     same file, as the value it is supposed to check.
#   - Whether the bucket exists, is reachable, or holds the object the
#     application reads. This is a string-shape assertion. The readiness probe is
#     still the thing that finds out.
#   - A CONFIG_BUCKET arriving through `envFrom` or `valueFrom`. The value is
#     elsewhere in git, not here.
#   - The module changing its convention. Rego cannot read the HCL, so this file
#     mirrors it; the mirror going stale is the failure mode this rule has
#     instead of the one it removes.
