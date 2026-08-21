# app-dependencies

Somewhere for an application to keep the configuration it reads at run time.

The application says what it needs. The platform decides what that has to look
like: versioned, encrypted, blocked from public access, and tagged with its
owner. The bucket name is not compiled into the image — it reaches the pod as
an environment variable in the deployment manifest, so the same artefact runs
in every environment.

## Usage

```hcl
module "dependencies" {
  source = "../../tarmac/infra/modules/app-dependencies"

  app_name    = "greeter"
  environment = "local"

  config = {
    "greeting" = "Hello from the paved road"
  }
}
```

## What it creates

| Resource | Why |
|---|---|
| S3 bucket `<app>-<env>-config` | Holds the configuration objects |
| Public access block | Not exposed as a variable — a bucket that needs to be public needs a conversation, not a flag |
| Versioning | A bad config push is recoverable rather than terminal |
| Server-side encryption | Default-on, so no application has to remember |
| One object per `config` entry | The values themselves |

## What it deliberately does not do

**Secrets.** `config` values end up in plan output, in the state file and in a
pull request diff, so nothing put here is secret. There is no separate mechanism
either — this platform has none, and the one Kubernetes Secret it does carry is
plaintext in git precisely because the emulator's credentials are not secrets.
Handling real ones means keeping them out of git altogether: External Secrets,
sealed-secrets or a cloud secret store delivering the value at deploy time, or
the workload's own identity in place of a stored credential. None of that is
modelled here, and this module should not be read as promising it.

**A per-caller choice about the security settings.** They are constants, not
variables. The policy layer asserts them independently, so a module that made
them configurable would produce plans that fail the build.

## Inputs

| Name | Type | Default | Description |
|---|---|---|---|
| `app_name` | `string` | — | Names and tags every resource. Validated at plan time against 3-28 characters of lowercase letters, digits and hyphens, starting with a letter — stricter than S3, which allows 3-63, because the rest of the name is appended to it |
| `environment` | `string` | `"local"` | One of `local`, `staging`, `production` |
| `config` | `map(string)` | `{}` | Object key to contents |
| `tags` | `map(string)` | `{}` | Merged *under* the platform's tags, which win |

## Outputs

`config_bucket`, `config_bucket_arn`, `config_keys`. Only `config_bucket` has a
consumer — the application's own Terraform re-exports it for a human to read
after an apply. The other two are unused; see `outputs.tf` for why they are
still there.
