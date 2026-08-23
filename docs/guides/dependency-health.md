# Dependency health

How we keep vulnerable dependencies from landing or staying on `develop`.

## What Dependabot watches

`.github/dependabot.yml` (weekly, label `technical-debt`, security updates on):

- `devcontainers` at `/`
- `npm` at `/` — covers the pnpm workspace (root `pnpm-lock.yaml` + `apps/*`/`packages/*`; GitHub maps pnpm to the `npm` ecosystem)
- `nuget` at `/apps/api` and `/packages/scripts-cs`
- `github-actions` at `/`

`npm` version updates are grouped `minor`+`patch` (`groups.minor-and-patch`) so minor/patch bumps arrive as one PR per week; major bumps stay separate. All ecosystems use `commit-message.prefix: chore` + `include: scope`.

## When a Dependabot PR needs a human, and when it does not

Owner decision (2026-08-22, policy #1240):

- **Bot bumps with green CI are merged on CI alone.** A `dependabot[bot]` PR that passes every required check needs no linked tracking issue and no human review. The `Require Linked Issue` gate waives `dependabot[bot]` by that exact login (the waiver is keyed on the PR *author* login, not the runner actor and not a label, and is enforced by `scripts/require-linked-issue.test.mjs` so it cannot be broadened to arbitrary bots). Merge a green minor/patch bump once CI is green.
- **Major bumps** open as a separate Dependabot PR (not grouped). These go through a normal human PR: review the changelog, run the affected suite (`just ci`), link the issue that tracks the major, and merge after review.
- **Generated-code bumps** (anything that regenerates client/server code — e.g. an OpenAPI/Kiota toolchain bump) go through a human PR too. CI only re-checks what is checked in; a bump that silently changes generated output must be eyeballed, and the diff (including `packages/client-ts`) reviewed before merge.
- **CI-touching bumps** — a Dependabot update to a `github-actions` ecosystem entry, or to any dependency referenced by a workflow (actions, container images, composite actions) — go through a human PR. The gate that validates CI is itself CI, so a self-approving bot change to the pipeline is not trusted to self-verify. Review the action diff, confirm the workflow still pins what the local gate reconciles, and merge after review.

Rule of thumb: green-and-boring (minor/patch, no generated code, no CI config) → bot merges itself; anything that changes contracts, generated artifacts, or the pipeline → human PR with linked issue and review.

## What CI audits

`front supply-chain` (`supply-chain` job in `.github/workflows/front-ci.yml`) runs

```
pnpm audit --prod --audit-level=high
```

after `pnpm install --frozen-lockfile --ignore-scripts` + trusted `@org/shared-ts` postinstall. It **fails** on any `high` or `critical` in the production graph and **passes** otherwise. Rung 1 of #1187 (PR #1198) cleared the 4 high alerts that were open on `develop`, so the step is green from the day it lands; it fails loud on an unreachable registry as well (no silent pass).

## How to handle an alert

1. **Bump** the direct dependency (or its parent) so the vulnerable range is no longer pulled.
2. If a transitive cannot be reached by a bump, add a `pnpm.overrides` entry — document which alert it closes and why a bump is insufficient, and remove the override once upstream publishes a clean version.
3. Only as a last resort, document an accepted risk (alert ID, impact, expiry) — never silence without a written justification.

Same for NuGet: bump or override, never `ignore` without a note.

## How to run locally

```bash
pnpm audit --prod --audit-level=high   # what CI gates (fail on high+)
pnpm audit --prod --audit-level=critical  # today: passes (no critical in prod; highs remain until rung 1)
pnpm audit                              # full graph including dev

dotnet list apps/api/PublyApp.Api.csproj package --vulnerable --include-transitive
dotnet list packages/scripts-cs/PublyApp.Scripts.csproj package --vulnerable --include-transitive
```
