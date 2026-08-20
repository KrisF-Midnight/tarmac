package main

test_a_provider_that_takes_credentials_from_the_environment_is_allowed if {
	count(deny) == 0 with input as {"provider": {"aws": [{"region": "${var.region}"}]}}
}

test_a_hardcoded_access_key_is_denied if {
	messages := deny with input as {"provider": {"aws": [{
		"region": "eu-west-1",
		"access_key": "AKIAIOSFODNN7EXAMPLE",
	}]}}

	reports(messages, "sets access_key")
}

test_a_hardcoded_secret_key_is_denied if {
	messages := deny with input as {"provider": {"aws": [{"secret_key": "wJalrXUtnFEMI"}]}}
	reports(messages, "sets secret_key")
}

test_a_session_token_is_denied_too if {
	messages := deny with input as {"provider": {"aws": [{"token": "FwoGZXIvYXdz"}]}}
	reports(messages, "sets token")
}

# A key sourced from a variable is still a key in the configuration: the value
# arrives from a tfvars file or the environment, but the plumbing that carries
# it is committed, and `terraform.tfvars` is a file people commit by accident.
# The rule is on the field being set at all, not on the value looking secret.
test_a_key_wired_to_a_variable_is_still_denied if {
	messages := deny with input as {"provider": {"aws": [{"access_key": "${var.access_key}"}]}}
	reports(messages, "sets access_key")
}

test_the_provider_is_named_in_the_message if {
	messages := deny with input as {"provider": {"aws": [{"access_key": "x"}]}}
	reports(messages, "provider \"aws\"")
}

test_a_local_backend_is_denied if {
	messages := deny with input as {"terraform": [{"backend": {"local": [{"path": "terraform.tfstate"}]}}]}
	reports(messages, "backend is `local`")
}

test_an_s3_backend_is_allowed if {
	count(deny) == 0 with input as {"terraform": [{"backend": {"s3": [{"bucket": "state"}]}}]}
}

test_a_terraform_block_with_no_backend_is_allowed if {
	count(deny) == 0 with input as {"terraform": [{"required_version": ">= 1.11"}]}
}
