package main

namespace_with(labels) := {
	"kind": "Namespace",
	"metadata": {"name": "example", "labels": labels},
}

test_a_namespace_enforcing_restricted_is_allowed if {
	count(deny) == 0 with input as namespace_with({"pod-security.kubernetes.io/enforce": "restricted"})
}

# The failure this rule exists for. An unlabelled namespace is not a namespace
# with weak pod security — it is a namespace with none, and nothing inside the
# cluster will ever say so.
test_a_namespace_with_no_labels_at_all_is_denied if {
	messages := deny with input as {"kind": "Namespace", "metadata": {"name": "example"}}
	reports(messages, "no pod security at all")
}

test_a_namespace_with_labels_but_not_the_one_that_matters_is_denied if {
	messages := deny with input as namespace_with({"team": "platform"})
	reports(messages, "no pod security at all")
}

# `baseline` is the tempting near-miss: it is a real Pod Security Standard, it
# looks deliberate in a diff, and it permits running as root.
test_a_namespace_enforcing_baseline_is_denied if {
	messages := deny with input as namespace_with({"pod-security.kubernetes.io/enforce": "baseline"})
	reports(messages, "no pod security at all")
}

# Warn and audit modes report; only enforce rejects. A namespace that warns is a
# namespace that will run the workload anyway.
test_warn_and_audit_labels_do_not_substitute_for_enforce if {
	messages := deny with input as namespace_with({
		"pod-security.kubernetes.io/warn": "restricted",
		"pod-security.kubernetes.io/audit": "restricted",
	})

	reports(messages, "no pod security at all")
}

test_the_namespace_is_named_in_the_message if {
	messages := deny with input as {"kind": "Namespace", "metadata": {"name": "payments"}}
	reports(messages, "Namespace/payments")
}
