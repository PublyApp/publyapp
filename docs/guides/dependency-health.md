# Dependency health

How we keep vulnerable dependencies from landing or staying on `develop`.

## What Dependabot watches

`.github/dependabot.yml` (weekly, label `technical-debt`, security updates on):

- `devcontainers` at `/`
- `npm` at `/` — covers the pnpm workspace (root `pnpm-lock.yaml` + `apps/*`/`packages/*`; GitHub maps pnpm to the `npm` ecosystem)
- `nuget` at `/apps/api` and `/packages/scripts-cs`
- `github-actions` at `/`

`npm` version updates are grouped `minor`+`patch` (`groups.minor-and-patch`) so minor/patch bumps arrive as one PR per week; major bumps stay separate. All ecosystems use `commit-message.prefix: chore` + `include: scope`.

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
