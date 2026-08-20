package main

# Credentials reach this platform through the standard AWS_* environment
# variables and through nothing else. That is what lets the same configuration
# run against the local emulator and against a real account without a branch on
# environment anywhere in the tree.
#
# A key in a provider block breaks both halves of that at once: it is committed,
# so everyone with read access to the repository has it and no rotation can find
# it; and it is configuration, so the file now knows which account it belongs to.
credential_fields := {"access_key", "secret_key", "token"}

deny contains msg if {
	some name, blocks in input.provider
	some block in blocks
	some field in credential_fields
	block[field]
	msg := sprintf(
		"provider %q sets %s — credentials belong in the environment, not in the configuration",
		[name, field],
	)
}

# A `local` backend means the state file lives on whichever laptop ran apply
# last. There is no locking, so two applies race; there is no history, so a lost
# file is a rebuild from scratch; and the state contains every value the
# configuration touched, unencrypted, in a directory nobody backs up.
deny contains msg if {
	some block in input.terraform
	block.backend.local
	msg := "terraform backend is `local` — state must live somewhere shared, versioned and lockable"
}
