package main

test_a_secret_with_literal_stringdata_warns if {
	messages := warn with input as {
		"kind": "Secret",
		"metadata": {"name": "aws-credentials"},
		"stringData": {"AWS_ACCESS_KEY_ID": "localstack"},
	}

	reports(messages, "carries literal values in git")
}

# base64 is an encoding, not a protection. The `data` form has to be caught too,
# and it is the form that looks safe to a reviewer skimming a diff.
test_a_secret_with_base64_data_warns if {
	messages := warn with input as {
		"kind": "Secret",
		"metadata": {"name": "aws-credentials"},
		"data": {"AWS_ACCESS_KEY_ID": "bG9jYWxzdGFjaw=="},
	}

	reports(messages, "carries literal values in git")
}

# The classification is the point of this rule, so it is asserted rather than
# left to the reader of the file. If this ever flips to `deny`, the repository's
# own local-AWS credentials fail the build — which is a decision to take on
# purpose, not to discover on a red pipeline.
test_the_secret_finding_never_blocks if {
	count(deny) == 0 with input as {
		"kind": "Secret",
		"metadata": {"name": "aws-credentials"},
		"stringData": {"AWS_ACCESS_KEY_ID": "localstack"},
	}
}

test_a_secret_that_only_references_an_external_store_does_not_warn if {
	count(warn) == 0 with input as {
		"kind": "Secret",
		"metadata": {"name": "aws-credentials"},
		"type": "Opaque",
	}
}

test_a_configmap_is_not_a_secret if {
	count(warn) == 0 with input as {
		"kind": "ConfigMap",
		"metadata": {"name": "settings"},
		"data": {"greeting": "hello"},
	}
}
