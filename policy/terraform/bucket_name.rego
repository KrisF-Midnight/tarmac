package main

# The other half of `policy/kubernetes/config_bucket.rego`, which is the reason
# this rule exists at all.
#
# That rule asserts a Deployment's CONFIG_BUCKET reads `<app>-<environment>-config`.
# It cannot derive that shape — Rego is handed parsed manifests, never the HCL —
# so it hard-codes a copy of the expression this module builds the name from. A
# copy with no link back to the original is a copy that goes stale silently: change
# the convention here and the Kubernetes rule keeps enforcing the old one, keeps
# passing, and passes manifests naming a bucket Terraform no longer creates. It is
# not a rule that stops working, it is a rule that starts being confidently wrong,
# which is worse.
#
# So the pairing is asserted from this side, where the expression is a literal
# string in the parsed input and can be read directly.

# What the module must build, and the only shape the Kubernetes rule knows how to
# check a CONFIG_BUCKET value against.
canonical_bucket_name := "${var.app_name}-${var.environment}-config"

# Matched as a pattern rather than by string equality, so that `${ var.app_name }`
# is not reported as a change of convention — it is legal HCL and `terraform fmt`
# does not reformat inside an interpolation, so it would survive every other check
# in the pipeline. Everything that the Kubernetes rule depends on is still fixed:
# the app variable, a hyphen, the environment variable, a hyphen, `config`, and
# nothing after it.
canonical_pattern := `^\$\{\s*var\.app_name\s*\}-\$\{\s*var\.environment\s*\}-config$`

deny contains msg if {
	some local_name in config_bucket_name_locals
	some block in input.locals
	expr := block[local_name]
	not regex.match(canonical_pattern, expr)
	msg := sprintf(
		"local.%s is %q — policy/kubernetes/config_bucket.rego mirrors this expression as %q to check the CONFIG_BUCKET env var, and cannot read HCL to notice it moved. Change both files together, or neither",
		[local_name, expr, canonical_bucket_name],
	)
}

# Which local holds the name, found by following the bucket's own reference.
#
# Scoped by structure, because conftest gives Rego no filename: without
# `--combine` the input document is one parsed file and nothing in it says which
# one, so "only fire inside app-dependencies/" is not expressible. The stand-in is
# the module's own shape — a bucket that takes its name from a local and that the
# `var.config` objects are written into. Unrelated Terraform holding a bucket for
# some other purpose is left alone, and a copy of this module living somewhere
# else is not, which is the right way round.
#
# Anchored on the resources rather than on the identifier for a reason worth
# stating: the earlier version matched a local *called* `bucket_name`, so renaming
# it to `config_bucket_name` took the rule out of scope and it reported nothing —
# a bypass available to anyone doing a tidy-up, with no sign in the run that a
# check had stopped running. Following the reference costs nothing and holds the
# scope narrow, because it is the config objects, not the bucket, that say which
# module this is.
config_bucket_name_locals contains local_name if {
	some bucket, blocks in input.resource.aws_s3_bucket
	some block in blocks
	local_name := local_reference(block.bucket)
	holds_the_config_objects(bucket)
}

# The identifier a `${local.x}` reference names, and undefined for a bucket named
# any other way. Whitespace is tolerated for `canonical_pattern`'s reason: it is
# legal HCL that `terraform fmt` leaves alone.
local_reference(expr) := name if {
	captures := regex.find_all_string_submatch_n(`^\$\{\s*local\.([A-Za-z0-9_-]+)\s*\}$`, expr, 1)
	name := captures[0][1]
}

# The module's signature: the objects `var.config` becomes, written into this
# bucket. A bucket without them is somebody else's bucket, whatever its name is
# built from.
holds_the_config_objects(bucket) if {
	some _, blocks in input.resource.aws_s3_object
	some block in blocks
	contains(block.bucket, sprintf("aws_s3_bucket.%s.", [bucket]))
	regex.match(`^\$\{\s*var\.config\s*\}$`, block.for_each)
}

# What this does not catch:
#
#   - The name being built inline on the resource, or by `format()`, or joined from
#     a list. Only a plain `${local.…}` reference is followed.
#   - The config objects being sourced from something other than `var.config`, or
#     addressed at a bucket other than by reference. Either takes the module out of
#     scope, and both are larger edits than the rename this rule now survives.
#   - The environment enum. `variables.tf` restricts it to local/staging/production
#     and the Kubernetes rule repeats that list; both mirrors are of the same
#     expression, but this rule only reads main.tf. `environments.rego` is what
#     reports a fourth environment being added to the enum without the Kubernetes
#     list moving with it.
#   - That the two rules agree. This asserts the Terraform side has not moved, not
#     that the Rego on the other side is correct.
