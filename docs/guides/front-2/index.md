# Front-2 Guide

`apps/front-2` is the durable TanStack Start + Base UI frontend for the front-2
migration. It is the new application engineers should build against during Phase 1 and
later migration work.

`apps/front-2-spike` is disposable reference only. Use it to understand harvested patterns
and prior de-risking work, but do not treat spike code as canonical. Do not copy it
verbatim; reimplement selected patterns after applying the Phase 1 cleanup rules.

AGENTS.md remains authoritative for repo-wide API/error/URL/logging conventions; this guide governs front-2 styling/architecture specifics.

## Stack

- TanStack Start with TanStack Router
- `@base-ui/react` primitives wrapped by a local `components/ui/*` layer (`cva` + `tailwind-merge`)
- Tailwind v4
- React 19
- TanStack Query
- React Hook Form, Zod, and `@hookform/resolvers`
- Kiota-generated `@org/client-ts`
- Shared contracts and utilities from `@org/shared-ts`
- Vitest

## Commands

Run commands from the repository root unless noted otherwise.

```bash
pnpm --filter front-2 dev
pnpm --filter front-2 build
pnpm --filter front-2 start
pnpm --filter front-2 typecheck
pnpm --filter front-2 test
```

The package scripts in `apps/front-2/package.json` are the source of truth:

- `dev` starts the TanStack Start/Vite dev server.
- `build` builds the app.
- `start` runs `apps/front-2/server.mjs`.
- `typecheck` runs `tsc --noEmit`.
- `test` runs `vitest run`.

## Guide Set

- [`conventions.md`](conventions.md) — front-2 styling, data, server-function boundary,
  locked conventions pending automation, URL-state, and error-boundary discipline.
