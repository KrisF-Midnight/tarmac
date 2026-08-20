package main

# The rule that exists because Pod Security Admission cannot enforce its own
# adoption.
#
# PSA is switched on by a label on the namespace. A namespace shipped without
# that label gets no pod security at all — not a warning, not an audit entry,
# nothing. The cluster looks exactly the same as one where every workload is
# compliant, because the check that would have said otherwise was never asked to
# run. It is the only control in this platform whose absence is invisible from
# inside the cluster.
#
# Something upstream has to notice, and "upstream" means before the namespace
# exists. That is this rule, and it is the reason the manifest carries the
# labels rather than Argo CD's `CreateNamespace=true` creating a bare one.

enforce_label := "pod-security.kubernetes.io/enforce"

deny contains msg if {
	input.kind == "Namespace"
	not restricted_enforced
	msg := sprintf(
		"Namespace/%s does not set %s=restricted — workloads in it would face no pod security at all",
		[input.metadata.name, enforce_label],
	)
}

restricted_enforced if {
	input.metadata.labels[enforce_label] == "restricted"
}
