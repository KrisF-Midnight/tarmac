# What was left out, and why

A platform is defined as much by what it refuses to build as by what it ships. This is the list of
things that were considered and deliberately not built, with the reasoning in each case. It is not
a wish list — a wish list says everything is valuable and nothing was decided.

The test applied to every line was the same: **does this add value proportional to its cost, here,
at this size?** Two things fell out of applying it that were not obvious going in. Most of what was
left over turned out to be *presentation* of problems already solved rather than problems still
open. And the largest genuine gap — policy and its tests — was sitting underneath a queue of work
that would have looked busier and proved less.

The decisions that shaped what *was* built are in [decisions.md](decisions.md), including the
accepted cost of each. This document is the other half: the roads not taken.

## Cut before the work started

These were never in scope. They are here because "we didn't think of it" and "we decided against
it" are different answers, and only one of them is a decision.

| Not built | Why |
|---|---|
| A real cloud account | The whole road has to run on a laptop with no account, no credentials and no bill. That constraint shapes the design rather than limiting it — see [decisions.md](decisions.md) entry 13. |
| Service mesh | The cost of a mesh is justified by traffic policy, mTLS between many services, and observability across them. There is one stateless service. It would be infrastructure with nothing to do. |
| Multi-region and DR | Cannot be demonstrated on one machine. Building the manifests without the failure they defend against is theatre — the config exists, the property does not. |
| Chaos engineering | Same objection, sharper. There is nothing meaningful to break in a stateless hello-world, so any experiment would be constructed to pass. |
| A developer portal | Weeks of setup to produce a page that restates what `make` and the README already say. The developer-facing surface here is the sixteen lines of CI an application writes, and `docs/onboarding.md`. |
| Progressive delivery | Canary and blue-green need real traffic to be honest. Without it you ship a rollout strategy that has never made a decision — a config file impersonating a capability. |
| Preview environments | Genuinely good developer experience, and genuinely too heavy to stand up per pull request on a laptop. Named as the thing to build once there is a cluster that outlives a `make down`. |
| A separate deployments repository | The textbook answer, and the right one at fifty services. At one, it is a fourth repository whose only content is a directory that already exists here. |
| Apply-on-merge promotion | There is no persistent shared environment to promote *into*. The stage would provision nothing and then report success, which is worse than not having it. |
| Infrastructure drift detection | Same reason: nothing durable to drift from. A drift check against state that is recreated on every `make up` can only ever say "no drift". |

## Cut with the work in reach

This is the more interesting half. Each of these could have been built with what already exists,
and each was chosen against.

**A post-deploy smoke test.** The proof already exists twice on the live cluster: the ingress
answers, and the greeting comes back from a bucket Terraform created. Automating a proof is not the
same as having one, and only the second was ever missing.

**Automatic post-deploy verification.** Cut because no honest trigger exists. CI cannot reach a
kind cluster on someone's laptop, and the deploy happens minutes after CI has exited. The only
candidate is an Argo CD `PostSync` hook, and it can fire while the previous version's pods are
still terminating — so it passes against the old release and reports the new one healthy
([argo-cd#17408](https://github.com/argoproj/argo-cd/issues/17408)). A check whose failure mode is
a false green is worse than a documented absence.

**Rollback, exercised.** Rollback here is `git revert` down exactly the path a promotion already
takes, and that path is exercised by every merge to the default branch. Demonstrating it separately
would be one more proof of the same mechanism, presented as a new capability.

**A sticky pull-request comment.** The step summary already carries the verdict, and
[decisions.md](decisions.md) entry 6 records why pull requests from forks cannot have a comment at
all. Building it would improve the presentation of a solved problem while leaving the real
limitation exactly where it is.

**`terraform plan` on the pull request.** It needs the local AWS stand-in running inside CI. `fmt
-check` and `validate` need neither a backend nor credentials, so those are what the Infrastructure
gate runs. This one is named in the README as a gap rather than dressed up as a decision — a change
to a shared module can still reach `main` without a plan having been read.

**`terraform test` over the shared module.** The most defensible of the three, because it is the
one that would say something new: `validate` proves the module parses and resolves against the
provider schema, not that a bucket comes out encrypted. But that second assertion is the one
`policy/terraform/` already makes, from the other side, with unit tests of its own. The marginal
cover is thin. It is the honest next step for this area rather than a hole.

**Branch protection as required checks.** Doing this properly means the Terraform GitHub provider,
a token and somewhere to keep state, in order to configure two repositories. Doing it by hand
instead puts a guardrail in the account and nothing in the repository, where nobody can review it
or reproduce it — which is worse than not having it, because it looks like it is there.

**A scaffolder and a second generated service.** Reuse is already demonstrated by the thing that
actually matters: `greeter`'s entire CI is sixteen lines calling `@v1`, with no per-application
configuration file anywhere. A generator would prove the same claim at roughly ten times the cost.

**A fast local inner loop.** This one was *removed*, not skipped. It was a second path into the
cluster with no gate in front of it, which is precisely the thing the platform exists to prevent.
[decisions.md](decisions.md) entry 39 carries the reasoning, and entry 45 carries the correction to
the claim that made about `kubectl`.

**SBOM generation and artifact signing.** Signing pays off when something verifies the signature,
and verifying at admission needs a policy engine this cluster does not run — the admission layer is
CEL in the API server, which cannot check a signature. Building it now ships a signature nothing
reads.

**Sealed secrets.** The repository has both the defect and the fix, and the thing that demonstrates
understanding is a policy that *detects* a plaintext secret, not an installation that hides one.
It became a policy deny case instead, with tests.

**A policy waiver mechanism.** The right answer the moment these policies meet a team that
disagrees with one. Building it now is scaffolding for an argument nobody is having, over policies
nobody has yet needed to waive.

**Environment promotion.** It would promote from a kind cluster to the same kind cluster. A
directory rename presented as a capability.

## Observability, which is the one to build first

Of everything on this page, an SLO and the dashboards under it are the largest real loss, and the
easiest to mistake for low value because it was cut for cost. It is not low value. A service
getting a dashboard, an alert and an error budget *for free*, because it shipped on the road rather
than beside it, is the entire argument for having a paved road, compressed into one deliverable.

It was cut because a metrics stack is expensive on a laptop already running a cluster, a registry
pull, an ingress controller, Argo CD and a local AWS stand-in — and because an SLO over a service
with no traffic is a number that never moves. Both of those objections disappear the moment this
runs somewhere real, which is exactly why it is first in the queue and not on the list above.

## Gaps rather than decisions

These are missing without a defence, and they are listed separately because pretending a gap is a
decision is the failure mode this document exists to avoid. Each is referenced from the entry in
[decisions.md](decisions.md) that ran into it.

| Gap | What it means in practice |
|---|---|
| No `terraform plan` on the pull request | A change to a shared module can reach `main` without anyone having read what it would do. |
| No `terraform test` over the shared module | The module is proved to parse and resolve, not to produce what it claims. |
| No RBAC restricting direct workload creation | The admission policies constrain *what* may be created; nothing yet constrains *who* may create it directly rather than through git. Denying `create` on workload resources to every subject except Argo's service account is the honest answer, and it is not implemented. |
| No drift detection, and no IAM | Both are properties of running against a local stand-in rather than an account: there is no shared environment to drift from, and the stand-in does not enforce IAM, so the policies covering it are untested against the thing that would actually refuse. |
| CODEOWNERS states intent, it does not enforce | With a single maintainer, required reviews would block every pull request, so they are off. The file records who owns what; it does not stop anyone. |
| No secret scanning of image layers | The Rego catches secrets in source, which is where this platform's would come from. A credential baked into a layer of a built image is not caught by anything here. |
| Still on ingress-nginx, not the Gateway API | The Gateway API is where this is going; the migration is real work and has not been done. The current controller is a deliberate choice for today, not a claim about tomorrow. |
