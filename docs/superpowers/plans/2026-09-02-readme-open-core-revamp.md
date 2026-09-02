# README Open-Core Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the root README with a concise, accurate landing page for
PublyApp's Apache-2.0 open core.

**Architecture:** Keep the README as an orientation layer, not a duplicate of
the repository guides. Every factual claim is grounded in the current legal,
runtime, and contributor documents; detailed procedures remain behind links.

**Tech Stack:** GitHub-flavoured Markdown, Mermaid, existing repository
documentation checks.

---

### Task 1: Rewrite the repository landing page

**Files:**
- Modify: `README.md`

- [x] **Step 1: Replace the positioning and badge rows**

  Present PublyApp as an Apache-2.0 open-core foundation for multi-tenant
  social-content operations. Keep the existing mark and a short stack badge
  row; add an Apache-2.0 badge linked to `LICENSE`.

- [x] **Step 2: Separate delivered scope from product direction**

  List only repository-backed capabilities as delivered: tenant isolation,
  session authentication and permissions, staff/tenant/project boundaries,
  user and invitation workflows, the working post/publishing pipeline,
  social-account connections, auditability, generated API client, and the
  API/worker/migrator/front topology. Put richer calendar, queue, multi-network,
  and review experiences in an explicitly labelled direction paragraph.

- [x] **Step 3: Put the supported quick start near the top**

  State Node 24+, pnpm 10.13.1, .NET 10, Docker, and `just` as prerequisites.
  Use these canonical commands:

  ```bash
  cp .env.example .env.development
  just install
  just dev-db
  just db-migrate
  ```

  Explain that `just dev-db` remains attached and migrations run in a second
  terminal. Link to `AGENTS.md` for environment details.

- [x] **Step 4: Keep one compact architecture view**

  Show `apps/front` calling the generated Kiota client, the .NET API flowing
  through handlers and services to PostgreSQL, plus the separate worker and
  migrator roles. Use the current `X-Session-Token` and `X-Tenant-Id` names.

- [x] **Step 5: Add concise development, contribution, deployment, and licence sections**

  Link to `AGENTS.md`, the focused frontend/backend guides, deployment
  runbooks, `CONTRIBUTING.md`, `CLA.md`, `LICENSE`, and `NOTICE`. State that
  this repository is Apache-2.0 and separately distributed paid modules are
  outside that licence.

### Task 2: Verify the result

**Files:**
- Verify: `README.md`

- [x] **Step 1: Scan for known stale or contradictory language**

  Run:

  ```bash
  rg -n 'Proprietary|all rights reserved|X-PublyApp-TenantId|online CI never ran|future content operations' README.md
  ```

  Expected: no matches.

- [x] **Step 2: Run the repository documentation gate**

  Run:

  ```bash
  just ci-doc-links
  ```

  Expected: all doc-link, fixture, and prune-inventory checks pass.

- [x] **Step 3: Inspect the final Markdown and diff**

  Run:

  ```bash
  git diff --check
  git diff --stat origin/develop...HEAD
  ```

  Expected: no whitespace errors; changes are limited to the approved design,
  implementation plan, and root README.

- [ ] **Step 4: Commit the rewrite**

  ```bash
  git add README.md docs/superpowers/plans/2026-09-02-readme-open-core-revamp.md
  git commit -m "docs: revamp open-core README"
  ```
