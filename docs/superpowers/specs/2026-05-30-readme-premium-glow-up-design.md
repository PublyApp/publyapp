# README Premium Glow-Up — Design Spec (Second Pass)

- **Date:** 2026-05-30
- **Topic:** PublyApp `README.md` premium redesign — direction **A + C hybrid**
- **Status:** Spec only. This document does **not** edit `README.md`. It directs a future implementation pass.
- **Branch context:** `docs/readme-glow-up`
- **Repository nature:** Proprietary / private. No open-source/community framing, no redistribution language beyond the existing "all rights reserved".

---

## 1. Background & Problem

The current `README.md` (first rewrite) is accurate, well-structured, and already includes a centered hero, a badge row, quick links, a Mermaid architecture diagram, and clean tables. It is **good but not enough**: it reads like a competent technical README rather than a *premium product-and-architecture portal*. The visual rhythm is uniform (table after table after `---`), the hero does not yet feel like a product homepage, capabilities are presented as prose/bullets rather than a scannable grid, and the API-contract story — arguably PublyApp's most distinctive engineering trait — is visually indistinguishable from any other code block.

This second pass makes the README **significantly more visually impressive and GitHub-ready** while staying 100% accurate and respecting the proprietary nature of the repo.

### 1.1 Baseline gap analysis (what the current README does vs. what this pass adds)

| Area | Current state (baseline) | Target (this pass) |
| --- | --- | --- |
| Hero | Centered name + one-line pitch + badges + 4 quick links | Premium hero block: optional brand glyph/banner, sharper one-sentence positioning, tiered badge row (tech + trust/quality), richer quick-link row, optional "audience" sub-line |
| Positioning | "Multi-tenant social media scheduling & publishing…" | One crisp, confident sentence + a short "built for teams that…" framing |
| Capabilities | Prose ("Why it's built this way") + scope table | A scannable **capability grid/cards** (outcome-focused), kept alongside a tightened "Why" |
| Architecture | One Mermaid flowchart + short paragraph | Architecture **showcase**: the system map plus a request-lifecycle / scope-boundary framing that reads as "technical trust" |
| API contract | A normal fenced code block | A **visually distinct** contract-workflow section (numbered flow + diagram-style framing) so it stands out as the signature workflow |
| Onboarding | Quick Start + a contributors section | Two clearly separated paths: **humans** (run it) and **AI agents/contributors** (AGENTS.md + guides), each visually framed |
| Rhythm | Repeated `table + ---` cadence | Deliberate section rhythm: hero → narrative → visual → grid → action, with restrained dividers; not emoji-heavy, not starter-template-ish |

### 1.2 The A + C hybrid (approved direction)

- **A — Premium Product Landing.** Beautiful SaaS/product-first hero, outcome-focused capability cards, polished visual rhythm. The repo should *feel* like a serious product on first scroll.
- **C — Architecture Showcase.** Strong system map, distinctive API-contract workflow, technical-trust signals, and explicit contributor/AI-agent orientation. A senior engineer or an AI agent should immediately understand how the system fits together and where the rules live.

The hybrid sequences **A above the fold** (hook + product story + capabilities) and **C in the body** (system map → contract workflow → contributor/agent orientation), so the README serves a product-curious reader and a contributing engineer/agent in one top-to-bottom pass.

---

## 2. Goals & Non-Goals

### 2.1 Goals

1. Make the README visually premium and GitHub-ready — noticeably more impressive than the first rewrite.
2. Lead with a product-grade hero and an outcome-focused capability grid (direction A).
3. Showcase the architecture and the OpenAPI→Kiota contract workflow as signature engineering traits (direction C).
4. Provide clear, separate onboarding paths for **humans** and **AI agents/contributors**.
5. Keep every fact accurate and sourced from the repo; keep the tone proprietary/private.
6. Preserve and reuse what already works in the baseline (Mermaid diagram, badges, tables) rather than discarding it.

### 2.2 Non-Goals (YAGNI / explicitly out of scope)

- **No fabricated screenshots or external product imagery.** Do not invent or link UI screenshots/GIFs. Only existing in-repo assets may be embedded (see §5).
- **No CI/coverage/version badges that don't reflect real, verifiable state.** Badges must be either accurate tech-version badges (static, already used) or links — never aspirational status badges (e.g., a green "build passing" badge with no backing pipeline reference).
- **No open-source/community theater.** No "Contributors welcome", Discord/Slack invites, sponsorship, star-history, or redistribution framing. The repo is proprietary.
- **No secrets.** No tokens, credentials, connection strings, real env values, internal hostnames/IPs. `X-Session-Token` may be named as a header concept (it already is in the diagram) but never with a value.
- **No speculative roadmap/hosting options** beyond what already exists (`apps/jobs` may be noted as "future" exactly as the repo treats it).
- **No new heavy dependencies or build steps** introduced solely for the README.
- **No restructuring of `docs/guides/` or `AGENTS.md`.** They remain the source of truth; the README only links to them.

---

## 3. Target Section Blueprint

Top-to-bottom order. Each section lists intent and the visual treatment. Section copy must be tightened relative to the baseline — premium means *confident and concise*, not longer.

1. **Hero block (A)**
   - Centered: brand glyph/banner (optional, see §5), product name `PublyApp`, one-sentence positioning, optional one-line audience framing ("Built for teams that schedule and publish across many brands and projects.").
   - **Badge row, tiered:** technology badges (.NET 10, React 19, React Router 7, PostgreSQL 18, pnpm 10.13, Turborepo) — keep the baseline set — optionally followed by a small second tier of *link* badges (e.g., "API Docs → Scalar", "Conventions → AGENTS.md") styled consistently. Trust signal allowed: "Type-safe end-to-end" as a flat badge (static claim, verifiable from the contract workflow), not a build-status badge.
   - **Quick-link row:** Quick Start · Architecture · API Contract · For Contributors & AI Agents · Deployment.

2. **What is PublyApp? (A → bridges to C)**
   - 2–3 tight sentences of positioning, then the **Staff / Tenant / Project** scope table (keep — it's strong and distinctive). Keep the mutual-exclusivity note (one sentence).

3. **Capabilities grid (A)** — *new emphasis*
   - An outcome-focused grid/cards section (rendered as a clean two-column markdown table acting as cards, since GitHub markdown has no real cards). Group by capability, not by tech. Suggested cells:
     - **Multi-tenancy** — three nested scopes, strict tenant isolation.
     - **Auth & permissions** — session-based auth, route-level permission enforcement.
     - **Content & publishing** — scheduling/publishing pipelines across projects.
     - **Staff/admin tooling** — cross-tenant administration & support.
     - **Type-safe API contract** — OpenAPI → Kiota generated TS client, never hand-edited.
     - **Production-ready data layer** — PostgreSQL 18, UUID v7 PKs, soft deletes, audit timestamps, EF migrations.
   - Each cell: bold capability name + one outcome sentence. Restrained iconography only (see §6 emoji policy) — prefer none or a single consistent glyph set if used at all.

4. **Architecture / system map (C)**
   - Keep and refine the existing **Mermaid** flowchart (it is accurate). Add a short "request lifecycle / boundaries" framing in prose or a compact table: client → generated client (`@org/client-ts`) → minimal-API endpoints + permission filters → CQRS-lite handlers → domain services → PostgreSQL, with shared validation/i18n (`@org/shared-ts`) on both sides and the OpenAPI→Kiota generation arrow back to the client.
   - One-line "technical trust" callouts allowed: vertical-slice/domain-first backend, RFC 7807 errors, permission-driven access.

5. **API Contract Workflow (C)** — *must be visually distinct*
   - This is the signature section. Make it stand out from ordinary command blocks: use a **numbered 3-step flow** with short rationale per step, optionally a tiny Mermaid/ASCII sub-diagram (`build-api → generate-client → tsc-front`), and a callout box (blockquote) for the **never hand-edit `packages/client-ts/`** rule.
   - Commands must match `justfile` exactly: `just build-api` → `just generate-client` → `just tsc-front`.

6. **Quick Start (A, action)**
   - Prerequisites (Node ≥ 24, pnpm 10.13.1, .NET SDK 10.0, Docker, `just`), the get-running command sequence (`just install` → `just dev-db` → `just db-migrate` → `just dev-api` → `just dev-front`), the `just dev-setup` convenience note, and the **Local URLs** table (frontend `5050`, API `5000`, Scalar `/scalar/v1`, Postgres `5454`). Keep the Windows/pwsh note.

7. **Monorepo Map (C)**
   - Keep the tree, ensure it matches the real layout: `apps/api`, `apps/front`, (`apps/jobs` only if marked future/optional consistent with repo reality — see §4 verification), `packages/client-ts`, `packages/shared-ts`, `packages/lint-ts`, `packages/lint-cs`, `packages/scripts-cs`, `packages/_tsconfig`, plus `docs/guides/`, `justfile`, `turbo.json`, `docker-compose.services.yml`.

8. **Common Commands (A/C)**
   - Keep the category table but defer to `just --list` as authoritative (avoid stale mirrored dumps). Commands shown must exist in `justfile`.

9. **Testing & Quality (C)**
   - `just test-api`, `just test-analyzers`, `just check-write`, `just tsc-front`, `just knip`; the single-test filter example; Husky-on-commit note; links to the test guides.

10. **For Contributors & AI Agents (C)** — *dual onboarding path, visually framed*
    - A prominent callout that **`AGENTS.md` is the single source of truth** (and `CLAUDE.md` points to it). Then a curated `docs/guides/` link cluster grouped Backend / Frontend / Contracts & Workflows (keep the baseline grouping). A short "non-negotiables" list (MUI + `sx` only; RFC 7807 / 401-means-logout; new code under `Modules/<Domain>/`; regenerate-never-edit the client).
    - Make the human-vs-agent split explicit: humans → Quick Start; agents/contributors → AGENTS.md + guides.

11. **Deployment (C)**
    - Dokploy on Hostinger VPS → GHCR Docker images → Traefik SSL; `dokploy.yml` config;
      `just build-deploy`. Link the then-current deployment note only if it exists (verify in §4).

12. **Status & License**
    - "Active development." + "Proprietary — all rights reserved. Not licensed for redistribution or use outside the PublyApp project."

---

## 4. Accuracy Facts (single source for the rewrite)

The implementation pass must use these verified facts. Where a fact is uncertain at write time, it must be verified against the listed source before inclusion (do not guess).

| Fact | Value | Source |
| --- | --- | --- |
| Backend platform | .NET 10.0 (`net10.0`), ASP.NET Core Minimal APIs | `Directory.Build.props`, `apps/api/MainApi.csproj`, `AGENTS.md` |
| Backend libs | EF Core, FluentValidation, Serilog, Polly, Npgsql, Scalar, Resend, security headers | `apps/api/MainApi.csproj` |
| Frontend | React 19.1, React Router 7.14 (SSR), TypeScript, Vite | `apps/front/package.json` |
| UI stack | MUI 7, Emotion, MUI X (Data Grid / Date Pickers / Tree View), TipTap, Framer Motion | `apps/front/package.json` |
| Client state | TanStack Query, Zustand 4, nuqs, React Hook Form + Zod | `apps/front/package.json` |
| Database | PostgreSQL 18; UUID v7 PKs; soft deletes; audit timestamps | `AGENTS.md` |
| API contract | OpenAPI document → Microsoft Kiota → generated TS client; Scalar docs at `/scalar/v1` | `justfile` (`generate-client`), `AGENTS.md`, `apps/api/MainApi.csproj` |
| Generated client | `packages/client-ts` (`@org/client-ts`) — **never hand-edit** | `justfile`, `apps/front/package.json`, baseline README |
| Shared package | `packages/shared-ts` (`@org/shared-ts`) — validations & i18n | `apps/front/package.json`, `justfile` |
| Other packages | `packages/lint-ts`, `packages/lint-cs` (PublyApp.Analyzers), `packages/scripts-cs`, `packages/_tsconfig` | `packages/` listing, `justfile` |
| Monorepo tooling | Turborepo + pnpm workspaces; `pnpm@10.13.1`; Node `>=24` | `package.json`, `pnpm-workspace.yaml` |
| Quality tooling | oxlint + oxfmt, custom Roslyn analyzers + ESLint/oxlint rules, Husky, Knip | `package.json`, `justfile` |
| Task runner | `just` (Windows uses PowerShell 7 / `pwsh`) | `justfile` |
| Compose file | `docker-compose.services.yml` (NOT `docker-compose.yml`) | `justfile` (`dev-services`) |
| Local URLs | Frontend `5050`, API `5000`, Scalar `/scalar/v1`, Postgres `5454` | `AGENTS.md`, baseline README |
| Source of truth | `AGENTS.md` (+ `docs/guides/`); `CLAUDE.md` points to `AGENTS.md` | `CLAUDE.md`, `AGENTS.md` |
| License/status | Proprietary, all rights reserved; active development | baseline README |

**Implementation-time verification notes:**
- `apps/jobs/` is described as future/planned in `AGENTS.md`, but the directory is currently absent. Omit it from the tree or label it explicitly as planned; do not list it as an existing directory.
- `dokploy.yml` and the then-current deployment note exist and may be linked, but re-check before
  the final README patch in case the branch changes.
- npm scopes are currently verified as `@org/client-ts` and `@org/shared-ts`; re-check the package `name` fields before finalizing.

---

## 5. Asset / Banner Strategy

- **An in-repo brand asset exists:** the then-current logo draft — a monochrome flame glyph
  (`solar:fire-bold-duotone`, drawn with `fill="currentColor"`, 24×24). This is the only existing
  brand mark.
- **Optional (feasible) banner approach — preferred if a visual lift is wanted:** promote the existing flame glyph into a small, tasteful hero mark. Implementation options, in order of preference:
  1. **Inline the SVG** centered above the title (GitHub renders sanitized inline SVG in markdown
     via an `<img>` to a committed asset, not raw `<svg>` in markdown — so commit a proper asset
     file and reference it). Move/copy the glyph to a stable asset path (e.g. `docs/assets/` or
     `.github/assets/`) rather than referencing the draft directly; keep the original where it is.
  2. **A simple composed banner** (glyph + "PublyApp" wordmark) as a single committed SVG, light/dark friendly. Use `currentColor` or theme-neutral fills so it works in both GitHub themes. Optionally provide `<picture>` with `prefers-color-scheme` if a dark/light pair is produced.
- **Hard constraints on assets:**
  - No external image URLs for product screenshots; no fabricated UI imagery.
  - Any banner must be a **committed, self-contained SVG** (no external font/script/network dependencies in the SVG).
  - The banner is **optional**: if producing a clean asset is not feasible in the implementation pass, ship the premium text hero (title + positioning + badges + links) without it. The README must look premium with or without the banner.
  - Do not introduce a build step or image pipeline for this.

---

## 6. Visual & Design Requirements (explicit)

These are required outcomes of the rewrite:

1. **Premium GitHub hero block** — centered, with tiered badges (tech + trust/link) and a quick-link row. Must not look like a starter template.
2. **Stronger one-sentence positioning** — a single confident sentence that states what PublyApp is and who it's for; plus an optional one-line audience framing.
3. **Product capabilities grid/cards** — outcome-focused, scannable; rendered as a clean markdown table acting as cards (GitHub has no native cards). Bold capability + one outcome line each.
4. **Architecture / system map section** — refine the existing Mermaid diagram + a concise boundary/lifecycle framing; reads as technical trust.
5. **Visually distinct API-contract workflow** — numbered flow + rationale + a callout for the never-edit rule + optional tiny sub-diagram; must look different from ordinary command blocks.
6. **Dual onboarding path** — visually framed split: humans (Quick Start) vs AI agents/contributors (AGENTS.md + guides).
7. **Clean section rhythm** — deliberate cadence (hero → story → visual → grid → action → reference), restrained horizontal rules; avoid the monotone "table + `---`" repetition of the baseline.
8. **Emoji policy** — **not emoji-heavy.** Allow at most a small, consistent, purposeful set (or none). No emoji soup, no decorative emoji headers. Prefer typographic hierarchy, tables, blockquote callouts, and the Mermaid diagram to carry the visual weight.
9. **Restraint over decoration** — maturity signals (clear structure, accurate badges, real diagrams) beat clutter. No animated GIFs, no star-history, no marketing fluff.
10. **Light/dark friendliness** — diagrams and any banner must remain legible in both GitHub themes (Mermaid default is fine; SVG should use theme-neutral or `currentColor` fills, or a `<picture>` pair).

---

## 7. Acceptance Criteria

The rewrite is acceptable when **all** of the following hold:

- **AC1 — Hero:** README opens with a premium centered hero containing product name, a single strong positioning sentence, a tiered badge row, and a quick-link row. (Optional banner per §5 if feasible.)
- **AC2 — Direction A present:** An outcome-focused capability grid/cards section exists (≥ 6 capabilities), distinct from the tech-stack table.
- **AC3 — Direction C present:** A refined architecture/system-map section (Mermaid) and a **visually distinct** API-contract workflow section both exist.
- **AC4 — Dual onboarding:** Separate, clearly framed paths for humans (Quick Start) and AI agents/contributors (AGENTS.md + `docs/guides/`).
- **AC5 — Accuracy:** Every technology/version, package name, port, command, and file path matches §4 and the real repo. No invented facts. `apps/jobs`, `dokploy.yml`, deployment-guide link, and npm scope verified per §4 before inclusion.
- **AC6 — Commands valid:** Every `just …` command shown exists in `justfile`; the compose file is referenced as `docker-compose.services.yml`.
- **AC7 — Contract rule preserved:** The README states that `packages/client-ts` is generated via Kiota and must never be hand-edited, inside the visually distinct contract section.
- **AC8 — Proprietary tone:** No open-source/community/redistribution framing; Status & License reflect "active development" + "proprietary, all rights reserved".
- **AC9 — No secrets:** No tokens, credentials, connection strings, real env values, or internal hosts/IPs anywhere. `X-Session-Token`/`X-Tenant-Id` appear only as header *names/concepts*.
- **AC10 — Restraint:** Not emoji-heavy; deliberate section rhythm; no fabricated screenshots; no aspirational status badges; no new build steps.
- **AC11 — Renders cleanly:** Valid GitHub-flavored markdown; Mermaid diagram(s) render; tables and links are well-formed; any banner is a committed self-contained asset legible in light and dark themes.
- **AC12 — Better than baseline:** The result is demonstrably more visually impressive than the current first-rewrite README while remaining at least as accurate and as useful to contributors.

---

## 8. Verification Checklist (for the implementation pass)

Run/inspect before declaring the rewrite done:

- [ ] Cross-check every version/library against `Directory.Build.props`, `apps/api/MainApi.csproj`, `apps/front/package.json`, `package.json`.
- [ ] Confirm each `just` command appears in `justfile` (no invented recipes); spot-check `just --list`.
- [ ] Confirm package directory names against `packages/` listing; confirm displayed npm scope against the real `package.json` `name` fields.
- [ ] Verify `apps/jobs/` existence; currently absent, so omit or mark as planned rather than listing it as a real directory.
- [ ] Verify `dokploy.yml` and the then-current deployment note still exist before linking; they
  exist at spec-writing time.
- [ ] Confirm Local URLs (5050 / 5000 / `/scalar/v1` / 5454) against `AGENTS.md`.
- [ ] Grep the final README for secret-shaped content (tokens, passwords, connection strings, `postgres://`, real IPs) → none present.
- [ ] Validate Mermaid diagram(s) render on GitHub (no syntax errors); confirm legibility in light + dark.
- [ ] If a banner asset is added: confirm it is committed, self-contained (no external refs), and
  legible in both themes; original logo draft left intact.
- [ ] Confirm all relative doc links resolve (`AGENTS.md`, `docs/guides/*`, deployment guide).
- [ ] Markdownlint strategy chosen deliberately: either the final README is lint-clean, or any intentional GitHub README polish exceptions (for example inline HTML hero/badges and long badge/table lines) are handled with targeted disables/config and documented in the implementation summary. Link checks for local relative links pass.
- [ ] Read-through: emoji restraint respected; section rhythm varied; tone premium + proprietary.
- [ ] Side-by-side vs. baseline: confirm AC12 (visibly more impressive, not less accurate).

---

## 9. Open Questions / Decisions Deferred to Implementation

- **Banner vs. text-only hero:** default to producing the flame-glyph banner if it can be made clean and theme-safe; otherwise ship the premium text hero. Either satisfies the spec.
- **Capability count & wording:** the six in §3 (item 3, "Capabilities grid") are the baseline set; the implementer may merge/rename for punchiness but must keep ≥ 6 and stay outcome-focused.
- **Trust badges:** only "static, verifiable" trust badges allowed (e.g., "Type-safe end-to-end"); no CI/coverage badges unless a real, referenceable pipeline exists.

---

*This spec is intentionally implementation-agnostic about exact prose. It fixes structure, visual requirements, accuracy facts, and acceptance criteria; the implementation pass writes the final copy and (optionally) the banner asset. No `README.md` changes are part of this spec.*
