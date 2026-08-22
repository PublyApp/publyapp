# Front Guide

`apps/front` is the durable TanStack Start + Base UI frontend for the front
migration. It is the new application engineers should build against during Phase 1 and
later migration work.

The disposable proof-of-concept was removed in #965 after its findings were
reimplemented. `apps/front` is the canonical application and reference.

AGENTS.md remains authoritative for repo-wide API/error/URL/logging conventions; this guide governs front styling/architecture specifics.

## Stack

- TanStack Start with TanStack Router
- `@base-ui/react` primitives wrapped by a local `components/ui/*` layer (`cva` + `tailwind-merge`)
- Tailwind v4
- React 19
- TanStack Query
- React Hook Form, Zod, and `@hookform/resolvers`
- Kiota-generated `@org/client-ts`
- Shared contracts and utilities from `@org/shared-ts`
- React Compiler (via `@vitejs/plugin-react` 6.1 + `oxc-transform-react`, `compiler: true`)
- Vitest

## Commands

Run commands from the repository root unless noted otherwise.

```bash
pnpm --filter front dev
pnpm --filter front build
pnpm --filter front start
pnpm --filter front typecheck
pnpm --filter front test
```

The package scripts in `apps/front/package.json` are the source of truth:

- `dev` starts the TanStack Start/Vite dev server.
- `build` builds the app.
- `start` runs `apps/front/server.mjs`.
- `typecheck` runs `tsc --noEmit`.
- `test` runs `vitest run`.

## Guide Set

- [`conventions.md`](conventions.md) — front styling, data, server-function boundary,
  locked conventions pending automation, URL-state, and error-boundary discipline.
