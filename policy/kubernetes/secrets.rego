package main

# Reported rather than blocked, and that is a decision rather than an oversight.
#
# A Secret with literal values in git is a genuine finding. Git has no expiry,
# no rotation and no record of who read it; `data:` being base64 changes who
# notices, not who can read it. In an environment that matters this should stop
# a merge.
#
# This repository has one. The local AWS stand-in's credentials are the string
# "localstack", against an emulator that accepts anything and reaches no account
# that can be billed — and having them in git is what lets the whole platform be
# run end to end with no cloud account, which is worth more than a clean report.
#
# The two ways to make the report clean are both worse than the warning. Deleting
# the capability trades a real property for a cosmetic one. Writing an exemption
# for this Secret starts an exemption list, and an exemption list is how a policy
# stops being read: the second entry is easier to add than the first, and by the
# fifth nobody checks whether the reasons still hold.
#
# So it warns, on every run, in front of everyone, and never blocks. The finding
# is accurate and the standing answer to it is written here. It becomes a `deny`
# the day there is a secret backend to point at — External Secrets or SOPS — and
# that is on the omissions list, not pretended at.
warn contains msg if {
	input.kind == "Secret"
	some field in {"data", "stringData"}
	input[field]
	msg := sprintf(
		"Secret/%s carries literal values in git (%s) — needs a secret backend before any environment that matters",
		[object.get(input, ["metadata", "name"], "<unnamed>"), field],
	)
}
