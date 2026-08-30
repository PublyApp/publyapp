# Contributing to PublyApp

Thank you for your interest in contributing to PublyApp. This document covers
what belongs in the core, how to sign the CLA, what the project expects from
contributions, and what to do when you open a pull request. For code-level
conventions once you're inside the codebase, see
[`AGENTS.md`](AGENTS.md), which is the single source of truth for engineering,
architecture, and process rules.

---

## 1. Core vs. paid modules — the boundary

PublyApp is an **open-core** project. This repository contains the **core** —
the open-source Apache-2.0 application (the .NET API, the React frontend, and
all shared packages). Paid features live in **closed-source modules** that ship
separately as signed bundles loaded by the core at startup; they are developed
in a private monorepo and are **not** accepted as contributions here.

### What the core contains

The core is everything in this repository: `apps/api`, `apps/front`,
`packages/`, `docs/`, and configuration files at the root. All code you write
as a contributor targets the core.

### Rule of precedence — what this list is and what it is not

The category list below classifies what is **not** already shipped in this
repository. **What is already shipped in this repository is core, full stop,
regardless of which category it would fall into below.** If a contribution
touches code that this repository already delivers — `BlueskyPublishProvider`,
the `Publishing` module, the `SocialAccounts` module, the planning UI, the
scheduler, the job queue — it is in core and is welcome here. The list below
only governs contributions that would add **new** capability not already in
core.

Concretely: a contribution that improves the publish scheduler (the job queue,
the schedule UI, the time-zone handling, the cancel/edit behaviour, the
retry/dead-letter pipeline) is core, because that scheduler is already shipped
in core. Adding a **new** external channel to that scheduler is module C,
because the new channel itself is not shipped in core. This is the answer to
the owner question recorded in
[#1906](https://github.com/PublyApp/publyapp/issues/1906) ("does a contribution
improving publish scheduling fall in the core or in module C?") — **core**.

### What belongs to the paid modules

Paid modules are delivered in a fixed order (decided 2026-08-25, tracked in
[#1354](https://github.com/PublyApp/publyapp/issues/1354)):

| Order | Module | Concern |
|---|---|---|
| C | Publishing channels | New external publication channels (e.g. syndication to a third party **not** already wired in core) |
| A | Analytics | Enhanced analytics beyond the core's existing metrics |
| B | AI assist | AI-powered assistance (suggestions, autofill, content analysis) |
| D | Enterprise | Enterprise-grade features (SSO, audit trails, advanced permissions, multi-org federation) |

The delivery order itself is recorded in #1354; this table restates it so a
contributor can see the boundary at a glance.

### How to know which side a contribution falls on

**If your contribution adds any of these and the capability is NOT already
shipped in core, it belongs to a paid module — do not submit it as a PR
against core:**

- A new external channel for syndication to a third party **that is not
  already wired in core** → **module C**
- Any dashboard, query, or metric beyond the core's existing analytics
  primitives → **module A**
- Any AI/ML inference, LLM call, or AI-assisted UX (suggestions, autofill,
  content generation) → **module B**
- SSO, LDAP, SCIM, audit-log export, multi-org federation, or advanced
  role-based permissioning beyond the existing Staff/Tenant scope split →
  **module D**
- Any code that references or depends on a `publyapp-pro` assembly, a paid
  feature flag, or a licence-gate check → **module boundary**

**If your contribution stays within the existing core surface** — improving
existing endpoints under the existing route groups (`/staff/...`, `/...`,
`/auth/...`), standard CRUD on existing entities, infrastructure wiring,
lint rules, CI guards, tests, documentation — it belongs in the core and is
welcome here.

**Unclear?** Open an issue first and ask. We would rather redirect you to the
right track before you write code than reject a contribution after the fact. See
[#1906](https://github.com/PublyApp/publyapp/issues/1906) for the background on
this boundary.

> **Publishing-schedule boundary note:** the open-core split is by **module
> category**, not by surface area. Improving the *core's* existing
> publish-now scheduling UI, the due-scan job, the calendar, or the queue is
> core — those modules are already shipped here
> (`apps/api/Modules/Publishing/`). Adding a *new channel* to that scheduler
> is module C. The feature flags that gate module C behind a subscription
> live in the core, but the module's closed code does not.

---

## 2. Contributor License Agreement (CLA)

Before a code contribution can be merged, you must sign the
[CLA](CLA.md) by adding your name to
[`CLA-SIGNATURES.md`](CLA-SIGNATURES.md) and stating in your PR body:

> I have read the PublyApp Contributor License Agreement and I accept it for
> my present and future contributions to this repository.

The CLA covers all past and future contributions. If you contribute on behalf
of an employer, your employer may need to sign separately — see the
[CLA's company section](CLA.md#contributing-on-behalf-of-a-company).

---

## 3. Quality expectations

The engineering standards are documented in full in [`AGENTS.md`](AGENTS.md).
This section names the four expectations a contribution must meet; each one
points at the committed document and section that carries the full rule, so a
contributor never has to take this file's word for it.

- **Pass CI.** Tests, type-checking, lint, and the design-system guard all run
  as required checks. See [`AGENTS.md`](AGENTS.md) §"## Code Quality" and
  §"### Running Tests" for the local recipes (`just ci`, `pnpm --filter front
  typecheck`).

- **Pair red/green proofs** — a bug-fix must ship with a paired proof test
  that is kept red against the corrected code and replayed with inverted
  semantics. The red test lives under
  `apps/front/tests/proofs/<issue>/<descriptive-name>.test.ts`; the green
  suite excludes that directory, and the proof runs only on demand. See
  [`docs/guides/test-conventions.md`](docs/guides/test-conventions.md)
  §"Paired Red/Green Proofs".

- **Carry the transparent-cause rule.** Every failure the backend returns or
  persists must carry a transparent, human-readable cause. Backend rule in
  [`AGENTS.md`](AGENTS.md) §"Project Conventions" (bullet "Transparent
  failure causes (owner product rule, 2026-08-22)") and in
  [`docs/records/2026-08-22-spec-epic-d-publishing-scheduling.md`](docs/records/2026-08-22-spec-epic-d-publishing-scheduling.md)
  §1 (decision row 7); UI rule in [`DESIGN.md`](DESIGN.md) §"Empty / error
  / loading states".

- **Automated review artefacts** (machine reviewers only) must record the
  reviewer model alongside `REVIEWED_TIP`. **Human contributors are not
  expected to name a reviewer model** — this is internal orchestration
  vocabulary used by automated review lanes, not a public expectation.

---

## 4. Opening a useful issue

Issues are triaged on a first-pass filter: valid problem + minimal
reproduction. A useful issue includes:

1. **A clear title** describing the symptom, not the proposed fix.
2. **Steps to reproduce** — what you did, what you expected, what happened.
3. **Environment** — local-dev, browser, or production context; the `just`
   recipe or test command that surfaces the problem.
4. **The actual error** — full message, or the failing test name and
   assertion.
5. **What you expected** — concrete, not "it should work better."

Maintainers may add one of the **follow-up depth labels** to track the work
without losing it. These are the labels the repository actually uses
(verified `gh label list -L 100` 2026-08-30):

- `follow-up` — deferred work spun out of a completed lane.
- `follow-up lv1` — follow-up of an origin task (review/finding), to be
  resolved **in parallel** with the train.
- `follow-up lv2` — follow-up of a follow-up; the issue is kept but set
  aside (owner rule 2026-08-26).
- `follow-up lv3` — third-level follow-up; set aside.

These labels exist alongside the regular domain and severity labels
(`bug`, `documentation`, `enhancement`, `good first issue`,
`gravite:critique`, `gravite:majeur`, `gravite:mineur`, `P0`–`P3`,
`type:fonctionnalite`, etc.).

### Closing an issue

Maintainers may close an issue with a stated reason when it falls outside the
core/paid-module scope (see §1 above), duplicates a known issue, or has been
superseded by a tracking plan. The repository's closure label is `wontfix`;
the GitHub close-reason menu also lists "Not planned" — these are two
distinct surfaces, and the labelled `wontfix` is what shows up on the issue's
history. All closure reasons are stated in the closing comment — never
silently.

---

## 5. Develop, test, and react to a red CI

The day-to-day development loop is documented in
[`AGENTS.md`](AGENTS.md) §"## Development Commands" and §"### Running Tests".
This section points at those sections by name so a contributor knows where
to look, and adds the one piece of guidance AGENTS.md does not carry:
**what to do when the CI goes red**.

### Local development

Run the full stack with `just dev-db` (Aspire AppHost; Postgres on
`localhost:5454`, API on `localhost:5000`, worker, and the front dev server
on `localhost:5050`). For the API or the front in isolation, see
`AGENTS.md` §"## Development Commands".

### Local CI gate

Before pushing, run the **fast pre-push barrier** — about 80 seconds total,
and the same checks the CI will re-execute:

```
just ci-format              # ~2 s
just ci-lint                # ~11 s
just ci-no-ignored-tracked  # ~1 s
just ci-doc-links           # ~12 s
just ci-drift               # ~48 s
pnpm --filter front typecheck   # ~5 s, if you touched the front
```

These commands **verify**, they do not repair. `just ci-format` failing means
"files are misformatted" — run `pnpm format:write` to repair. Then
`git push` and read the CI.

For the full set of recipes, including the slower gates (`just ci-front`,
`just ci-quality-dotnet`, `just test-api`), see
[`docs/guides/local-ci-gate.md`](docs/guides/local-ci-gate.md).

### When the CI is red

1. Run `gh pr checks <N>` (or `gh pr view <N> --json statusCheckRollup`) and
   read the **total** check count; a partial rollup is not a measurement.
2. For each red check, read its job log — the failing step names the file
   and line, and `just ci-doc-links`, `just ci-front`, etc. reproduce the
   exact check locally.
3. Fix, recommit with `Part of #N` (never `Closes #N`, `Fixes #N`, or
   `Resolves #N` in a commit body — these auto-close the issue on merge),
   and `git push`.
4. Read the CI again. Do not poll the integration; the checks report when
   they finish.

If a CI check fails on something the local barrier did **not** cover
(a workflow change, a CI manifest drift, a new required check), the local
barrier is the wrong tool for that change — push the fix and let the CI
judge. See
[`docs/guides/local-ci-gate.md`](docs/guides/local-ci-gate.md) for which
cases warrant a local `just ci` instead of pushing.

---

## 6. Pull requests

1. **Branch from `develop`** (or the issue's worktree if one exists).
2. **Sign the CLA** (see §2) — unsigned contributions are not merged.
3. **Keep the blast radius small** — one concern per PR. Large refactors
   must be pre-approved in an issue.
4. **Update the OpenAPI client** if you change the API contract — run
   `just build-api && just generate-client` so `packages/client-ts` stays
   in sync. Never edit the generated client by hand.
5. **Run the local CI gate** before pushing — see §5 above for the fast
   pre-push barrier; see
   [`docs/guides/local-ci-gate.md`](docs/guides/local-ci-gate.md) for the
   full set of recipes.

---

## 7. Community

PublyApp's community standards are zero-tolerance for harassment or
discrimination of any kind. Be constructive, assume good faith, and ground
technical disagreements in evidence (a failing test, a profiling number, a
spec citation).