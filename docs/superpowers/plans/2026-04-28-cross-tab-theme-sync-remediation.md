# Cross-Tab Theme Sync Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make theme/settings persistence deterministic, validated, and flash-resistant across reloads and tabs.

**Architecture:** Use `publyapp:app-settings` as the canonical full settings state and `publyapp:color-scheme` as the simple boot-time MUI mode key. Cross-tab sync listens to `storage` on the canonical settings key, applies only newer validated snapshots, and rehydrates from canonical state on visibility/page restore.

**Tech Stack:** React Router v7, React 19, MUI CSS variables, Zustand persist, browser `localStorage`/`storage` events.

---

### Task 1: Canonical Settings Snapshot Helpers

**Files:**
- Create: `apps/front/src/lib/settings/settings-sync-state.client.ts`

- [x] Implement explicit enum validation and default merging for persisted settings.
- [x] Parse Zustand's persisted payload into a canonical settings snapshot.
- [x] Compare snapshots by `revision`, then `updatedAt`, then `syncId`.

### Task 2: Version Settings Mutations

**Files:**
- Modify: `apps/front/src/lib/zustand/features/settings.slice.ts`
- Modify: `apps/front/src/lib/zustand/utils/middleware.ts`

- [x] Add `revision`, `updatedAt`, and `syncId` metadata to `settingsSlice`.
- [x] Increment metadata only for local settings mutations.
- [x] Sanitize persisted settings during Zustand `merge`.
- [x] Persist only `settingsSlice.state`, `settingsSlice.revision`, `settingsSlice.updatedAt`, and `settingsSlice.syncId`.

### Task 3: Replace Signal Sync With Canonical Storage Sync

**Files:**
- Modify: `apps/front/src/lib/settings/settings-tab-sync.client.ts`
- Modify: `apps/front/src/lib/mui/theme/settings-tab-sync-bridge.tsx`

- [x] Remove `BroadcastChannel` and `publyapp:app-settings:signal`.
- [x] Listen only to storage events for `publyapp:app-settings`.
- [x] On `visibilitychange` and `pageshow`, synchronously read `publyapp:app-settings`.
- [x] Apply only newer snapshots after setting `<html data-color-scheme>` synchronously.

### Task 4: Align MUI Boot And Provider

**Files:**
- Modify: `apps/front/src/components/settings/settings-config.ts`
- Modify: `apps/front/src/root.tsx`
- Modify: `apps/front/src/lib/mui/theme/theme-provider.tsx`

- [x] Add `COLOR_SCHEME_STORAGE_KEY = 'publyapp:color-scheme'`.
- [x] Add a tiny pre-MUI init script that migrates `colorScheme` from the canonical settings payload into the simple color-scheme key before MUI boot reads it.
- [x] Pass the same `modeStorageKey` and `defaultMode` to `InitColorSchemeScript` and `ThemeVarsProvider`.

### Task 5: Verification

**Files:**
- All changed files

- [x] Run `just tsc-front`.
- [x] Run `just check-write` if formatting/imports need normalization.
- [x] Run `npx -y react-doctor@latest . --verbose --diff` from `apps/front`.
- [x] Review the final diff for unrelated churn.
