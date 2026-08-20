package main

# Which kinds carry a pod template, tested directly.
#
# This is the part of the policy set most likely to be silently wrong. Every
# rule in this directory is built on `containers`, so a kind these rules fail to
# unwrap does not produce a wrong answer — it produces *no* answer, and conftest
# reports a clean pass for a manifest it never looked inside.

bad_container := container_with_image("docker.io/library/nginx:latest")

test_a_bare_pod_is_inspected if {
	messages := deny with input as {
		"kind": "Pod",
		"metadata": {"name": "example"},
		"spec": {"containers": [bad_container]},
	}

	reports(messages, "must come from")
}

test_a_daemonset_is_inspected if {
	messages := deny with input as {
		"kind": "DaemonSet",
		"metadata": {"name": "example"},
		"spec": {"template": {"spec": {"containers": [bad_container]}}},
	}

	reports(messages, "must come from")
}

test_a_statefulset_is_inspected if {
	messages := deny with input as {
		"kind": "StatefulSet",
		"metadata": {"name": "example"},
		"spec": {"template": {"spec": {"containers": [bad_container]}}},
	}

	reports(messages, "must come from")
}

test_a_job_is_inspected if {
	messages := deny with input as {
		"kind": "Job",
		"metadata": {"name": "example"},
		"spec": {"template": {"spec": {"containers": [bad_container]}}},
	}

	reports(messages, "must come from")
}

# A CronJob buries its pod template one level deeper than everything else, which
# is exactly the sort of difference a policy set gets wrong and never notices.
test_a_cronjob_is_inspected_despite_the_extra_nesting if {
	messages := deny with input as {
		"kind": "CronJob",
		"metadata": {"name": "example"},
		"spec": {"jobTemplate": {"spec": {"template": {"spec": {"containers": [bad_container]}}}}},
	}

	reports(messages, "must come from")
}

# The other half of the contract: kinds with no containers must pass without
# being listed anywhere. There is no "kinds we ignore" list to keep current,
# because that is the list that goes stale.
test_a_service_is_not_a_workload if {
	count(deny) == 0 with input as {
		"kind": "Service",
		"metadata": {"name": "greeter"},
		"spec": {"ports": [{"port": 80}]},
	}
}

test_an_ingress_is_not_a_workload if {
	count(deny) == 0 with input as {
		"kind": "Ingress",
		"metadata": {"name": "greeter"},
		"spec": {"rules": []},
	}
}

test_an_argocd_application_is_not_a_workload if {
	count(deny) == 0 with input as {
		"apiVersion": "argoproj.io/v1alpha1",
		"kind": "Application",
		"metadata": {"name": "greeter"},
		"spec": {"source": {"path": "gitops/greeter"}},
	}
}
