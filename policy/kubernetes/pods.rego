package main

# Where a pod template hides, per workload kind.
#
# Anything not listed here has no containers to police, so `pod_spec` is
# undefined and every rule built on it is undefined too. That is how a Service,
# an Ingress or an Argo CD Application passes without being special-cased —
# there is no "kinds we ignore" list to keep current, which is the list that
# always goes stale.

pod_spec := input.spec if {
	input.kind == "Pod"
}

pod_spec := input.spec.template.spec if {
	input.kind in {"Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"}
}

pod_spec := input.spec.jobTemplate.spec.template.spec if {
	input.kind == "CronJob"
}

# initContainers are held to the same standard. They run earlier, more often as
# a privileged setup step, and an unpinned one is the same supply-chain hole as
# an unpinned app container — with less attention on it.
containers contains container if {
	some container in pod_spec.containers
}

containers contains container if {
	some container in pod_spec.initContainers
}

# What to call the object in a message. A manifest with no name is a manifest
# somebody is about to have a bad time with, so it gets a placeholder rather
# than making the rule that found the real problem go undefined.
subject := sprintf("%s/%s", [input.kind, object.get(input, ["metadata", "name"], "<unnamed>")])
