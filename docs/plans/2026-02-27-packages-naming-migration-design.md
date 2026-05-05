# Package Naming Convention Migration Design

**Date:** 2026-02-27
**Status:** Approved

## Overview

Migrate `packages/` folder naming from generic names to language-specific names:
- `js-client` → `client-ts`
- `shared` → `shared-ts`
- Create `shared-cs` for future C# worker service

## Goals

1. Clear language signaling in folder names
2. Future-proof for multi-language support (PHP, Rust, etc.)
3. Prepare for C# background jobs/worker service

## Current State

| Folder | Status |
|--------|--------|
| `packages/js-client` | Has content (to migrate) |
| `packages/shared` | Has content (to migrate) |
| `packages/client-ts` | Empty (target) |
| `packages/shared-ts` | Empty (target) |
| `packages/shared-cs` | Empty (future use) |

## Changes Required

### 1. Package Names
- `@org/js-client` → `@org/client-ts`
- `@org/shared` → `@org/shared-ts`

### 2. Source File Imports (~35 files)
Update all TypeScript imports:
- `@org/shared/*` → `@org/shared-ts/*`
- `@org/js-client/*` → `@org/client-ts/*`

### 3. Configuration Files
| File | Change |
|------|--------|
| `Makefile` | Variables: `SHARED_DIR`, `JS_CLIENT_DIR` |
| `tsconfig.paths.json` | Path aliases |
| `biome.jsonc` | Ignore patterns |
| `.lintstagedrc.js` | Filter patterns |
| `apps/api/MainApi.csproj` | Translation JSON path |
| `apps/front/Dockerfile` | COPY paths |
| `apps/front/vite.config.ts` | Ignored paths |
| `apps/front/_vite/copy-i18n-files.ts` | i18n paths |
| `apps/front/_vite/generate-client.ts` | Client generation path |
| `AGENTS.md` | Documentation references |

### 4. Documentation
Docs can be updated incrementally or left as historical reference.

## Approach

**Option A - Full Migration** (Selected)
1. Move content from `js-client/*` → `client-ts/*`
2. Move content from `shared/*` → `shared-ts/*`
3. Update `package.json` names
4. Update all import references
5. Update all config file paths
6. Delete old folders
7. Run `pnpm install` to regenerate lockfile

## Rollback Plan

If issues occur:
1. Restore from git
2. Re-run `pnpm install`

## Testing

After migration:
1. `make build-api` - verify API builds
2. `make build-front` - verify frontend builds
3. `make generate-client` - verify client generation works
4. Run dev servers - verify runtime works
