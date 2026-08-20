package main

test_a_git_source_pinned_by_ref_is_allowed if {
	count(warn) == 0 with input as {"module": {"dependencies": [{
		"source": "git::https://github.com/example/tarmac.git//infra/modules/app-dependencies?ref=v1",
	}]}}
}

test_a_registry_source_with_a_version_is_allowed if {
	count(warn) == 0 with input as {"module": {"vpc": [{
		"source": "terraform-aws-modules/vpc/aws",
		"version": "5.1.2",
	}]}}
}

test_a_relative_path_source_warns if {
	messages := warn with input as {"module": {"dependencies": [{
		"source": "../../tarmac/infra/modules/app-dependencies",
	}]}}

	reports(messages, "not pinned to a version")
}

# A git URL with no ref tracks the default branch. It looks pinned — it has a
# scheme, a host and a path — and it is not, which makes it the more dangerous
# of the two unpinned forms.
test_a_git_source_without_a_ref_warns if {
	messages := warn with input as {"module": {"dependencies": [{
		"source": "git::https://github.com/example/tarmac.git//infra/modules/app-dependencies",
	}]}}

	reports(messages, "not pinned to a version")
}

test_a_registry_source_without_a_version_warns if {
	messages := warn with input as {"module": {"vpc": [{"source": "terraform-aws-modules/vpc/aws"}]}}
	reports(messages, "not pinned to a version")
}

# The classification, asserted rather than left to the reader of the file. This
# repository's own application Terraform is the relative-path case, so flipping
# this to `deny` fails the platform's own pipeline — a decision to take
# deliberately, on the day the platform has a tag, not to discover on a red run.
test_the_unpinned_module_finding_never_blocks if {
	count(deny) == 0 with input as {"module": {"dependencies": [{
		"source": "../../tarmac/infra/modules/app-dependencies",
	}]}}
}

test_the_module_and_its_source_are_named_in_the_message if {
	messages := warn with input as {"module": {"dependencies": [{"source": "../../elsewhere"}]}}
	reports(messages, "module \"dependencies\"")
	reports(messages, "../../elsewhere")
}
