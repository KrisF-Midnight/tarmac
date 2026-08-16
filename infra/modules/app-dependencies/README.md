# app-dependencies

Somewhere for an application to keep the configuration it reads at boot.

The application says what it needs. The platform decides what that has to look
like: versioned, encrypted, blocked from public access, tagged with its owner,
and discoverable through SSM rather than through a bucket name compiled into
the image.

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
| SSM parameter `/<app>/<env>/config-bucket` | So the application discovers the bucket instead of hard-coding it |

## What it deliberately does not do

**Secrets.** `config` values end up in plan output and in the state file. There
is a separate mechanism for anything that must not; putting a secret here would
put it in a pull request diff.

**A per-caller choice about the security settings.** They are constants, not
variables. The policy layer asserts them independently, so a module that made
them configurable would produce plans that fail the build.

## Inputs

| Name | Type | Default | Description |
|---|---|---|---|
| `app_name` | `string` | — | Names and tags every resource. Validated against S3's naming rules at plan time |
| `environment` | `string` | `"local"` | One of `local`, `staging`, `production` |
| `config` | `map(string)` | `{}` | Object key to contents |
| `tags` | `map(string)` | `{}` | Merged *under* the platform's tags, which win |

## Outputs

`config_bucket`, `config_bucket_arn`, `config_bucket_parameter`, `config_keys`.
