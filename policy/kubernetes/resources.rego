package main

# Requests and limits are two different controls and the platform requires both.
#
# Requests are what the *scheduler* reads. A container without them is placed as
# though it costs nothing, so a node accepts more work than it can run and the
# failure lands on whatever was already there.
#
# Limits are what the *kubelet* enforces. A container without them can take a
# node down with it, and the pod that gets evicted is frequently not the one
# that misbehaved.
#
# Pod Security Admission has nothing to say about either. This is not the same
# control as pod security wearing a different hat — it is the resource-exhaustion
# half of "one tenant cannot hurt another", which PSA does not cover at all.

required := {"cpu", "memory"}

deny contains msg if {
	some container in containers
	some resource in required
	not container.resources.requests[resource]
	msg := sprintf("%s: container %q declares no %s request", [subject, container.name, resource])
}

# CPU limits are the contested one — throttling a latency-sensitive service to
# stay under a limit it was never going to exceed is a real cost, and plenty of
# teams deliberately set only requests. This platform takes the strict side
# because of where it runs: a single-node cluster shares its CPU with the
# control plane, and a runaway container without a limit does not degrade a
# neighbour, it makes the API server unreachable.
deny contains msg if {
	some container in containers
	some resource in required
	not container.resources.limits[resource]
	msg := sprintf("%s: container %q declares no %s limit", [subject, container.name, resource])
}
