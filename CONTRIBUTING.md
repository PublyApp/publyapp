# Contributing to PublyApp

Thank you for your interest in contributing to PublyApp. This document covers
what belongs in the core, how to sign the CLA, and what to expect when you open
a pull request. For code-level conventions once you're inside the codebase, see
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

### What belongs to the paid modules

Paid modules are delivered in a fixed order (decided 2026-08-25, tracked in
[#1354](https://github.com/PublyApp/publyapp/issues/1354)):

| Order | Module | Concern |
|---|---|---|
| C | Publishing channels | External publication channels (e.g. social-network scheduling, syndication to third parties) |
| A | Analytics | Enhanced analytics beyond the core's basic metrics |
| B | AI assist | AI-powered assistance (suggestions, autofill, content analysis) |
| D | Enterprise | Enterprise-grade features (SSO, audit trails, advanced permissions, multi-org federation) |

### How to know which side a contribution falls on

**If your contribution touches any of these, it likely belongs to a paid module — do not
submit it as a PR against core:**

- Integration with an external API that publishes or syndicates content to a third-party
  channel → **module C**
- Any dashboard, query, or metric beyond the core's existing analytics primitives → **module A**
- Any AI/ML inference, LLM call, or AI-assisted UX (suggestions, autofill, content generation) → **module B**
- SSO, LDAP, SCIM, audit-log export, multi-org federation, or advanced role-based
  permissioning beyond the existing Staff/Tenant scope split → **module D**
- Any code that references or depends on a `publyapp-pro` assembly, a paid feature
  flag, or a licence-gate check → **module boundary**

**If your contribution stays within the existing core surface** — new endpoints under
the existing route groups (`/staff/...`, `/...`, `/auth/...`), standard CRUD on existing
entities, infrastructure wiring, lint rules, CI guards, tests, documentation — it belongs
in the core and is welcome here.

**Unclear?** Open an issue first and ask. We would rather redirect you to the right
track before you write code than reject a contribution after the fact. See
[#1906](https://github.com/PublyApp/publyapp/issues/1906) for the background on this
boundary.

> **Publishing-schedule boundary note:** the open-core split is by **module category**,
> not by surface area. Improving the *core's* existing publish-now scheduling UI, or
> fixing the job queue, is core. Adding a *new channel* to that scheduler is module C.
> The feature flags that gate module C behind a subscription live in the core, but the
> module's closed code does not.

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
At a minimum, every contribution must:

- **Pass CI** — tests, type-checking, lint, and the design-system guard all run
  as required checks.
- **Pair red/green proofs** — new code that fixes a bug must ship with a test
  that fails before the fix and passes after. See
  [`docs/guides/test-conventions.md`](docs/guides/test-conventions.md) §"Paired
  Red/Green Proofs".
- **Pin the real surface** — guards that assert against the real build artefact
  (not a model's reproduction of the expected chain) are mandatory where a
  guard exists. See [`docs/guides/local-ci-gate.md`](docs/guides/local-ci-gate.md).
- **Use the real components in tests** — never substitute an inert stub when a
  real component or seam can be exercised. A test that passes with a stub and
  would also pass with the defect in place is vacuous.
- **Carry a verdict header** — review artefacts must record the reviewer model
  alongside `REVIEWED_TIP`.

> **One-sentence summary:** *every failure the backend returns or persists must
> carry a transparent, human-readable cause.* See
> `docs/records/2026-08-22-spec-epic-d-publishing-scheduling.md` §1.7 and
> [`DESIGN.md`](DESIGN.md) (error states).

---

## 4. Opening a useful issue

Issues are triaged on a first-pass filter: valid problem + minimal reproduction.
A useful issue includes:

1. **A clear title** describing the symptom, not the proposed fix.
2. **Steps to reproduce** — what you did, what you expected, what happened.
3. **Environment** — local-dev, browser, or production context; the `just` recipe or
   test command that surfaces the problem.
4. **The actual error** — full message, or the failing test name and assertion.
5. **What you expected** — concrete, not "it should work better."

Issues that lack a reproduction may be tagged `needs-repro` and held until one
is provided.

### The follow-up queue

Issues opened by contributors are reviewed on the project's cadence. Maintainers
may close an issue as `not-planned` with a written reason when it falls outside
the core/paid-module scope (see §1 above), duplicates a known issue, or has been
superseded by a tracking plan. All closure reasons are stated in the closing
comment — never silently.

---

## 5. Pull requests

1. **Branch from `develop`** (or the issue's worktree if one exists).
2. **Sign the CLA** (see §2) — unsigned contributions are not merged.
3. **Keep the blast radius small** — one concern per PR. Large refactors must
   be pre-approved in an issue.
4. **Update the OpenAPI client** if you change the API contract — run
   `just build-api && just generate-client` so `packages/client-ts` stays
   in sync. Never edit the generated client by hand.
5. **Run the local CI gate** before pushing: `just ci` (no e2e) or `just ci-full`
   (with e2e). See [`docs/guides/local-ci-gate.md`](docs/guides/local-ci-gate.md).

---

## 6. Community

PublyApp's community standards are zero-tolerance for harassment or
discrimination of any kind. Be constructive, assume good faith, and ground
technical disagreements in evidence (a failing test, a profiling number, a
spec citation).
