# Onboarding an application

Everything here is one-time setup. Once it is done, an application's CI is the six lines in
[Riding the road](../README.md#riding-the-road) and nothing else — no per-application
configuration, no copied YAML.

Two of these steps are clicks in a web UI rather than Terraform. That is not an oversight, and
each one says below why it cannot be automated.

## Once per organisation: the deployment identity

CI has to write one line into this repository — the image digest Argo CD then reconciles. It
must do that as an identity that is **not** the application repository's own `GITHUB_TOKEN`,
for two reasons:

- `GITHUB_TOKEN` is scoped to the repository it runs in, so it cannot write to `tarmac` at all.
- A commit made with `GITHUB_TOKEN` does not trigger workflows. The platform's own gates would
  silently never run on the commit CI just made.

A GitHub App solves both. Create it once, install it on `tarmac` only, and hand its credentials
to each application repository.

| Field | Value |
|---|---|
| Name | anything; `tarmac-deploy` reads well in the commit author |
| Homepage URL | the `tarmac` repository URL |
| Webhook | **uncheck Active** — nothing listens |
| Repository permission | **Contents: Read and write**, and nothing else |
| Where installed | **Only select repositories** → `tarmac` |

Contents write is the entire permission set. The App can commit to `tarmac` and do nothing
else — it cannot read application source, cannot touch the registry, and cannot reach a
cluster.

Then generate a private key (**Generate a private key**, which downloads a `.pem`) and note
the numeric **App ID**.

## Once per application repository

### 1. Store the App credentials as secrets

In the application repository, under *Settings → Secrets and variables → Actions*:

| Secret | Value |
|---|---|
| `PLATFORM_APP_ID` | the App's numeric ID |
| `PLATFORM_APP_PRIVATE_KEY` | the whole `.pem`, including the `BEGIN`/`END` lines |

The workflow exchanges these for a token scoped to `tarmac` that expires in an hour. The
long-lived credential is the private key; what CI actually holds is short-lived.

Pass them to the platform by name, never with `secrets: inherit`. Inheriting hands the called
workflow every secret the repository holds — including ones added later, for unrelated
reasons, by someone who never read this page. Naming them keeps the list auditable from the
caller.

### 2. Add the caller workflow

```yaml
permissions:
  contents: read
  packages: write

jobs:
  ci:
    uses: <owner>/tarmac/.github/workflows/ci.yml@v1
    with:
      platform-ref: v1
    secrets:
      PLATFORM_APP_ID: ${{ secrets.PLATFORM_APP_ID }}
      PLATFORM_APP_PRIVATE_KEY: ${{ secrets.PLATFORM_APP_PRIVATE_KEY }}
```

`platform-ref` must match the ref in `uses:`. GitHub does not expose the ref a reusable
workflow was called at, so the platform cannot infer it; the duplication is deliberate and
cannot currently be removed.

### 3. Make the published package public

**Do this after the first green run on `main`, and before the first cluster sync.**

The package does not exist until CI has published it once, and GitHub creates it **private**.
A private package means the cluster's first pull fails with `ImagePullBackOff` — a failure
that surfaces far from its cause, in the cluster, long after the pipeline went green.

Go to `https://github.com/users/<owner>/packages/container/<app>/settings` →
*Danger Zone* → *Change visibility* → **Public**.

There is no REST endpoint that changes container package visibility, which is why this is not
a Terraform resource and not a step in the pipeline. It is genuinely a click.

The alternative is keeping the package private and giving every cluster an image pull secret.
Public was chosen because the image contains no secret, and the pull secret would be a
long-lived registry credential distributed to every node that runs the application — a
standing credential in exchange for hiding a public application's bytes.

## Verifying it worked

Push to the application's `main` and watch three things, in order:

| Where | What proves it |
|---|---|
| the application's Actions tab | the run is green and the release job published a digest |
| `tarmac`'s commit history | a commit authored by the App, changing exactly one image line |
| the cluster | Argo CD reports the application `Synced` and `Healthy` |

Then push nothing and re-run the same workflow. A re-run of an unchanged commit must produce
**no** new commit in `tarmac` — the image is built once per commit and re-runs reuse it. A
second commit appearing here means the reuse path is broken; it would roll the pods for an
application whose source never changed.
