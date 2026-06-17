# Front-end Testing Setup — Design

- **Status:** Approved (design); implementation deferred (foundational — to be built as a dedicated slice)
- **Date:** 2026-06-17
- **Surface:** `apps/front`
- **Tracking issue:** #693
- **Reviewed by:** GPT-5.5 (xhigh) second-opinion pass — verdict "endorse-with-changes", folded in below

## Context & motivation

`apps/front` currently has **no test harness** — `package.json` has build/type-check scripts only, no Vitest/RTL/MSW/Playwright. The React Router 7.16.0 + v8-future-flags migration (#665) made the gap concrete: a CSP-nonce regression on prerendered pages was caught only by manual cross-model review, not by any automated test. The API side already has integration tests the team is happy with; this brings comparable, but appropriately different, confidence to the front end.

## Goals

- **A — CI regression gate:** a fast, deterministic suite that runs pre-merge.
- **B — Migration safety:** catch breakage from framework bumps (RR upgrades, etc.) at the loader/component/contract level.
- **C — Lock tricky logic:** pin the behavior of API-failure mapping, auth loaders, and cursor/keyset pagination.

## Non-goals (YAGNI)

- No blanket coverage target; no testing of trivial presentational components.
- No heavy per-worker real-API Playwright harness now (see Parallelization → deferred).
- Vitest is **not** expected to prove SSR streaming / CSP / nonce / prerender correctness — that is Playwright's job.

## Tooling

New `apps/front` devDependencies: **Vitest** (+ `@testing-library/react`, `@testing-library/user-event`, jsdom), **MSW**, **Playwright**.

## Architecture — three layers

### 1. Unit (Vitest)
Pure logic, no framework boot:
- `src/lib/api-failure/*` — `to-api-failure.ts` (classification), `map-validation-errors.ts` (RHF mapping), `schemas.ts` (keys off Kiota's `responseStatusCode` discriminator).
- `format-time` utilities, Zod schemas (incl. `packages/shared-ts`), small `lib/react-router` helpers.

### 2. Integration (Vitest) — split by environment via `test.projects`
- **`node` project — server loaders/actions invoked directly** (no SSR boot): `lib/react-router/server-data.server.ts` redirect-on-missing-token, `getServerLoader`/`getServerAction`.
- **`jsdom` project — components/hooks:** use React Router's `createRoutesStub` or direct loader/action invocation rather than booting the full SSR app. Targets:
  - **MSW only where the Kiota error-shape matters** (do NOT mock the generated client modules — brittle across `just generate-client` regen).
  - `components/query-display.tsx` loading/error/empty states.
  - `hooks/table/use-table-state.ts` — the generation-stamped cursor state machine (tested as a **hook**, since it's tangled with nuqs/URL/refs — not pure-unit).
  - RHF + Zod form behavior via the `Form`/`Field.*` wrappers.
  - **401-vs-403 React Query logout semantics:** central logout in `lib/react-query/query-client.tsx`; the auth surface intentionally does NOT log out on 401 (`routes/auth/_layout/auth-layout.tsx`).

### 3. E2E (Playwright) — kept thin
- **PR gate:** mocked-network smoke — login, accept-invitation — + a **CSP/nonce render check** of `/` and `/login` (the regression class #665 hit).
- **Separate / nightly (serial):** real-API smoke — login, invite — for genuine front↔backend confidence (hybrid decision).

## Test isolation discipline (from day one)

Highest-priority operational rule — without it the parallel suite goes order-dependent. There is module-global state in `lib/react-query/query-client.tsx`, `client-manager.ts`, and `lib/react-router/navigation-helper.ts`.

- Per-test `QueryClient`; per-test router wrapper.
- `server.resetHandlers()` after each test; MSW handlers test-local.
- Explicit reset of the singleton modules above, plus i18next, cookies, `localStorage`, and fake timers.

## Parallelization & CI

Reference — the **API** parallelization (verified): one Postgres Testcontainer per process, a seeded **template DB**, then **one cloned DB per xUnit test class** (`CREATE DATABASE ... TEMPLATE ...`), `MaxParallelThreads = 4`, isolation per-class, cookies off + per-request auth headers.

Front-end mapping:
- **Vitest unit + integration parallelize for free** — no shared DB; MSW is in-process per worker. Default worker pool, parallel by file; **no `test.concurrent`** on DOM/MSW/cookie tests.
- **Playwright PR-gate (mocked network):** parallel `workers` + `--shard` in CI; no DB.
- **Playwright real-API smoke:** run **serial / single-worker** (hybrid choice). **Deferred option** if it ever needs parallel real-stack: port the API design at worker scope — clone a DB per Playwright worker from a template + an API instance per worker on its own port + point the front at it.
- **PR gate = Vitest unit + Vitest integration + mocked Playwright smoke.** Real-API Playwright runs separately/nightly.

## Rollout

1. **Vertical slice through `login`** — test it at all three layers (failure mapping unit → loader/action + form integration → mocked + real-API E2E). This proves the entire toolchain on one flow and becomes the copy-paste template.
2. Stand up the shared harness as part of slice 1: Vitest config + env split, MSW server scaffold, isolation helpers, Playwright config, CI wiring.
3. Replicate the pattern per flow (accept-invitation, password reset, etc.) incrementally.

## Implementation outline (for the future plan)

- **Slice 1:** harness + isolation helpers + login vertical slice (all 3 layers) + CI gate wiring.
- **Slice 2+:** per-flow replication; grow unit coverage on `lib/*` logic opportunistically.

## Open questions / future

- Whether the real-API Playwright smoke graduates to parallel per-worker (only if the suite grows enough to justify the harness).
- CI runtime budget once the suite exists (revisit shard count).

