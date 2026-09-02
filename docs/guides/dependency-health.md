# Dependency health

How we keep vulnerable dependencies from landing or staying on `develop`.

## What Dependabot watches

`.github/dependabot.yml` (weekly, label `technical-debt`, security updates on):

- `npm` at `/` — covers the pnpm workspace (root `pnpm-lock.yaml` + `apps/*`/`packages/*`; GitHub maps pnpm to the `npm` ecosystem)
- `nuget` at `/apps/api` and `/packages/scripts-cs`
- `github-actions` at `/`

`npm` version updates are grouped `minor`+`patch` (`groups.minor-and-patch`) so minor/patch bumps arrive as one PR per week; major bumps stay separate. All ecosystems use `commit-message.prefix: chore` + `include: scope`.

## When a Dependabot PR needs a human, and when it does not

Owner decision (2026-08-22, policy #1240):

- **Bot bumps with green CI are merged on CI alone.** A `dependabot[bot]` PR that passes every required check needs no linked tracking issue and no human review. The `Require Linked Issue` gate waives `dependabot[bot]` by that exact login (the waiver is keyed on the PR _author_ login, not the runner actor and not a label, and is enforced by `scripts/require-linked-issue.test.mjs` so it cannot be broadened to arbitrary bots). Merge a green minor/patch bump once CI is green.
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

The .NET side is audited by **Scan .NET packages for known vulnerabilities**
(`quality-gate.yml::quality`, mirrored locally by `just nuget-audit`, script
`packages/scripts-ts/src/nuget-audit.ts`). It scans every tracked `.csproj`
(`git ls-files '*.csproj'` — five projects, including the `lint-cs` pair that
`PublyApp.slnx` omits) with `dotnet list package --vulnerable
--include-transitive`, parsed from machine-readable JSON because
`TreatWarningsAsErrors` turns the text format's NU1903 warning into a build error
before a grep could match it. It fails loud on anything it cannot fully inspect:
an unreachable registry, an unrestored project, unparseable output, or a listed
package carrying an empty `vulnerabilities` array (#1348 — output dotnet never
emits today) is exit 1 (`could not inspect … <cause>`), never a silent pass.
Its scan-set discovery is committed-csproj-only by design (see the boundary note
on `parseGitLsFilesCsproj`).

Proven working, both directions, on 2026-08-25:

- **RED:** a scratch project pinned to genuinely vulnerable versions
  (Newtonsoft.Json 12.0.1, RestSharp 106.6.5, SixLabors.ImageSharp 2.1.0) makes
  the guard exit 1 naming every package, severity, and advisory URL.
  (This closes the live-proof gap PR #1199 recorded — the advisory database now
  flags those versions.)
- **GREEN:** the repo tree audits clean — five projects inspected, zero
  vulnerable, exit 0.

The scan-set contract itself is spec-pinned: `parseGitLsFilesCsproj` (exported,
covered by `nuget-audit.test.ts`) parses the `git ls-files` output, so a
regression cannot silently shrink which projects get audited.

Rung-3 record (issue #1197): at the rung's start (base `1ea296005`, 2026-08-25)
the audit already reported **zero vulnerable packages** across all five projects,
and GitHub's Dependabot alert list for the repository was empty (0 open, all
ecosystems). Earlier findings were closed on `develop` by direct bumps and
transitive security pins — e.g. `System.Security.Cryptography.Xml` `10.0.10` for
the DataProtection chain (advisories GHSA-37gx-xxp4-5rgx / GHSA-cvvh-rhrc-wg4q)
and `SSH.NET` `2026.0.0` (NU1903) — recorded in the `Directory.Packages.props`
comments. **Exit condition for any future finding:** direct bump, or a transitive
pin in the `TransitiveSecurityPins` group of `Directory.Packages.props`, with
`just nuget-audit` re-run green; an accepted risk, if one is ever unavoidable, is
documented here with the alert ID, impact, and expiry — never silenced without
that note.

## How to handle an alert

1. **Bump** the direct dependency (or its parent) so the vulnerable range is no longer pulled.
2. If a transitive cannot be reached by a bump, add a `pnpm.overrides` entry — document which alert it closes and why a bump is insufficient, and remove the override once upstream publishes a clean version.
3. Only as a last resort, document an accepted risk (alert ID, impact, expiry) — never silence without a written justification.

Same for NuGet: bump or override, never `ignore` without a note.

## How the #880 moderate advisories closed

Both moderate alerts tracked in #880 were already remediated on `develop` by the mechanisms
above; #880's closure adds the proof, not a new pin.

- **`@microsoft/kiota-http-fetchlibrary` (GHSA-396q-4vc8-28x9)** — closed by the direct exact
  pin: `apps/front/package.json` carries the patched
  `1.0.0-preview.103` (bump assessed in
  [`docs/records/2026-07-31-audit-kiota-cross-origin-redirect-header-leak.md`](../records/2026-07-31-audit-kiota-cross-origin-redirect-header-leak.md),
  landed with the Kiota 1.34.1 toolchain bump; `packages/client-ts/package.json` declares the rest of
  the pinned preview chain but not this fetch library). A pre-release patch line is acceptable here
  because the whole runtime chain is pinned preview-for-preview across both packages.
  This location claim is contract-checked by
  `packages/scripts-ts/src/dependency-health-pin-location.test.ts`, which reads the real manifests and
  fails when the doc names the wrong one. Guarded at runtime by
  `apps/front/src/lib/api-client/client-manager.redirect-scrub.test.ts`, which drives the real
  generated client through a cross-origin 302 and fails on any version in the vulnerable range.
- **`nanoid` (GHSA-mwcw-c2x4-8c55)** — two root `pnpm.overrides` caps existed:

  - **`nanoid@<3.3.18 → ^3.3.18` STAYS** (restored in commit for #1625 round 2; it
    was removed in `ec7089c99` but that removal was a security regression,
    flagged in review). The sole remaining consumer is transitive:
    `postcss@8.5.25` declares `nanoid: ^3.3.16` (a range that **includes**
    `3.3.16`/`3.3.17`, which are vulnerable; the fix is `3.3.18`). Today the lock
    resolves `3.3.18` only because of this cap — without it a lockfile
    regeneration could drop back to `3.3.16`. The cap is the **only** protection
    for this range: the validation audit is `pnpm audit --prod --audit-level=high`,
    and `postcss` is a **devDependency** of `apps/front`, so `--prod` does not
    inspect that graph at all. A vulnerable resolution would pass CI unseen. **Two
    reasons it stays:** (1) `postcss`'s declared range can still resolve a
    vulnerable version, and (2) the CI audit does not cover the dev graph. Either
    reason alone is sufficient; both are true today.
  - **`nanoid@>=4.0.0 <5.0.9 → ^5.1.16` REMOVED** (commit `ec7089c99`, issue
    #1623). The only direct declaration, `packages/shared-ts` `^5.1.16`, was also
    removed and no workspace source ever imported `nanoid`. After that removal,
    **no** consumer declares a range that can resolve `>=4.0.0 <5.0.9`: the only
    remaining `nanoid` in the tree is the transitive `3.3.18` under `postcss`, so
    the 4.x/5.x cap had nothing left to lift and was correctly dropped.

  **Verifiable removal condition for the `<3.3.18` cap** (judged on the _declared_
  range, not the resolved version): remove it only when **every** consumer that
  can reach `nanoid@3.x` declares a range whose lower bound is `>=3.3.18` (i.e. no
  declared range can resolve `3.3.16`/`3.3.17`) **and** the CI audit covers the
  graph that consumer lives in. `postcss` still declares `^3.3.16`, and `postcss`
  is dev-scoped, so neither condition holds — the cap stays. Judging on the
  resolved version (`3.3.18` today) instead of the declared range is what caused
  the round-1 regression; do not repeat that mistake.

CI's audit step (`pnpm audit --prod --audit-level=high`) stays the standing tripwire; run the
full-graph `pnpm audit --audit-level=moderate` when triaging Dependabot alerts.

## How the `browserslist@<=4.28.6` cap was added

Two advisories cover `browserslist` with affected range `<=4.28.6`, patched in
`4.28.7`: `GHSA-c83g-rgw3-j3cx` and `GHSA-73wf-gq98-2v4g`. `browserslist` is
transitive under `apps/front`'s build toolchain and no workspace package
imports it, so the fix lands via a root override:

```
"browserslist@<=4.28.6": "^4.28.7"
```

**Verifiable removal condition** (judged on the _declared_ range, not the
resolved version): remove the override only when **every** reachable parent's
declared lower bound is `>=4.28.7` **and** both the production-graph and
full-graph audits stay green without it. Today the cap stays.

## How the package-wide `fast-uri` override was added

Four high-severity advisories affect `fast-uri`: `GHSA-5jgf-p345-68v8` (host
confusion via skipped IDN canonicalization on scheme-relative references),
`GHSA-fph4-wmhf-6fwf` (SSRF via repeated hostname percent-decoding),
`GHSA-f65p-4m7j-42xc` (SSRF via malformed IPv6 normalization), and
`GHSA-jqff-g426-hqxp` (host confusion via percent-encoded scheme
normalization). The version the lockfile resolved, `3.1.5`, was affected by all
four, and `3.1.6` is the first version patched against all four.

`fast-uri` is transitive under `apps/front`'s `@hookform/resolvers@5.9.1`, which
declares two independent optional peers, `ajv` and `ajv-formats`. The vulnerable
path is the direct one: `@hookform/resolvers` → `ajv@8.20.0` → `fast-uri`,
where `ajv`'s own manifest depends on `fast-uri: ^3.0.1` — a range wide enough
to resolve a vulnerable release. `ajv-formats@2.1.1` (peer `ajv: ^8.0.0`) adds
no separate path; it reuses that same peer `ajv`. No workspace package imports
`fast-uri` directly.

A direct bump is not available: `ajv@8.20.0` is already the latest published
release on the 8.x line, and its own declared dependency stays `^3.0.1` —
there is no newer `ajv` to bump to that raises the `fast-uri` floor. The fix
goes through a package-wide root override (it pins every `fast-uri` resolution
in the tree, not just a vulnerable range):

```
"fast-uri": "^3.1.6"
```

The lockfile resolves `3.1.7`, which covers the same four advisories; `3.1.6`
is the first common patched version cited by the audit.

**Verifiable removal condition** (judged on the _declared_ range, not the
resolved version): remove the override only when **no** reachable parent
depends on `fast-uri` at all, **or** every reachable parent declares a
`fast-uri` floor of `>=3.1.6` — and, in either case, both the
production-graph and full-graph audits stay green without it. Today
`ajv@8.20.0` still declares `^3.0.1`, so the override stays.

## How to run locally

```bash
pnpm audit --prod --audit-level=high   # what CI gates (fail on high+)
pnpm audit --prod --audit-level=critical  # today: passes (no critical in prod)
pnpm audit                              # full graph including dev

just nuget-audit                        # the NuGet gate CI runs (all five csproj)

# Underlying commands the recipe wraps:
dotnet list apps/api/PublyApp.Api.csproj package --vulnerable --include-transitive
dotnet list packages/scripts-cs/PublyApp.Scripts.csproj package --vulnerable --include-transitive
```
