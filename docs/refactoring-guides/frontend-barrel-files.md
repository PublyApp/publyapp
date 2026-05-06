# Frontend Barrel File Cleanup

<!-- markdownlint-disable MD013 -->

Status: phase 3 implemented for issue #378, part of #77.

## Policy

Prefer direct imports from the concrete module file in `apps/front/src`.

Do not add new hand-written frontend barrel files by default. A barrel is allowed
only when it is an intentional, narrow public facade for a module that benefits
from one canonical import surface.

Generated client barrels are out of scope. Do not manually edit or delete
`packages/client-ts/**/index.ts`; Kiota generation owns those files.

When a facade remains, prefer explicit exports over broad `export *` unless the module
is intentionally exposing a large family of same-purpose helpers.

## Inventory Summary

Inventory command:

```powershell
rg --files apps/front/src | rg '(^|/|\\)index\.(ts|tsx)$'
```

Current counts:

- `apps/front/src`: 34 `index.ts` / `index.tsx` files.
- `apps/front/src`: 31 pure hand-written re-export barrels.
- `apps/front/src`: 3 `index.ts(x)` implementation or aggregate modules, not pure
  re-export barrels.
- `packages/client-ts/src`: 72 generated `index.ts` files, excluded from cleanup.

Classification values:

- **Remove**: migrate consumers to direct imports and delete the barrel when unused.
- **Narrow**: review in the relevant phase; keep only a documented, explicit facade.
- **Keep**: intentional public facade or not a barrel-file cleanup target.

## Keep

These are intentional facades or index-named implementation modules.

| Path | Reason |
| --- | --- |
| `apps/front/src/components/animate/variants/index.ts` | Canonical animation preset surface. Keep unless later phases prove direct imports are clearer. |
| `apps/front/src/components/hook-form/index.ts` | Canonical form component facade referenced by repo frontend standards. |
| `apps/front/src/components/snackbar/index.ts` | Central toast/snackbar facade with `sonner` integration. |
| `apps/front/src/layouts/components/notifications-drawer/index.tsx` | Implementation module, not a pure re-export barrel. |
| `apps/front/src/layouts/components/searchbar/index.tsx` | Implementation module, not a pure re-export barrel. |
| `apps/front/src/lib/api-failure/index.ts` | Canonical failure-message facade; already uses explicit exports. |
| `apps/front/src/lib/mui/theme/core/components/index.ts` | Theme component aggregate implementation, not a pure re-export barrel. |

## Removed In Phase 2

These low-risk, single-purpose barrels were removed in issue #377.

| Path |
| --- |
| `apps/front/src/assets/data/index.ts` |
| `apps/front/src/components/animate/scroll-progress/index.ts` |
| `apps/front/src/components/country-select/index.ts` |
| `apps/front/src/components/custom-dialog/index.ts` |
| `apps/front/src/components/custom-popover/index.ts` |
| `apps/front/src/components/custom-tabs/index.ts` |
| `apps/front/src/components/flag-icon/index.ts` |
| `apps/front/src/components/iconify/index.ts` |
| `apps/front/src/components/image/index.ts` |
| `apps/front/src/components/label/index.ts` |
| `apps/front/src/components/loading-screen/index.ts` |
| `apps/front/src/components/logo/index.ts` |
| `apps/front/src/components/number-input/index.ts` |
| `apps/front/src/components/phone-input/index.ts` |
| `apps/front/src/components/progress-bar/index.ts` |
| `apps/front/src/components/scrollbar/index.ts` |
| `apps/front/src/components/search-not-found/index.ts` |
| `apps/front/src/components/svg-color/index.ts` |

## Removed In Phase 3

These inherited template component barrels were removed in issue #378.

| Path |
| --- |
| `apps/front/src/assets/icons/index.ts` |
| `apps/front/src/components/address/index.ts` |
| `apps/front/src/components/animate/index.ts` |
| `apps/front/src/components/brand-switcher/index.ts` |
| `apps/front/src/components/custom-breadcrumbs/index.ts` |
| `apps/front/src/components/editor/index.ts` |
| `apps/front/src/components/empty-content/index.ts` |
| `apps/front/src/components/error/index.ts` |
| `apps/front/src/components/file-thumbnail/index.ts` |
| `apps/front/src/components/upload/index.ts` |

## Remove

No broad **Remove** candidates remain after phase 3. The remaining hand-written
frontend barrels are classified as **Keep** or **Narrow**.

## Narrow

These areas are more coupled. Treat them in the case-by-case phase: remove them if they
are only inherited convenience exports, or keep a small explicit public facade when it
protects a useful module boundary.

| Path | Current index refs | Suggested phase | Notes |
| --- | ---: | --- | --- |
| `apps/front/src/components/nav-basic/components/index.ts` | 0 | Phase 4 | Navigation internals. |
| `apps/front/src/components/nav-basic/desktop/index.ts` | 0 | Phase 4 | Navigation internals. |
| `apps/front/src/components/nav-basic/index.ts` | 0 | Phase 4 | Navigation facade. |
| `apps/front/src/components/nav-basic/mobile/index.ts` | 0 | Phase 4 | Navigation internals. |
| `apps/front/src/components/nav-basic/styles/index.ts` | 0 | Phase 4 | Navigation styling helpers. |
| `apps/front/src/components/nav-basic/utils/index.ts` | 0 | Phase 4 | Navigation utility helper. |
| `apps/front/src/components/nav-section/components/index.ts` | 1 | Phase 4 | Navigation internals. |
| `apps/front/src/components/nav-section/horizontal/index.ts` | 0 | Phase 4 | Navigation internals. |
| `apps/front/src/components/nav-section/index.ts` | 11 | Phase 4 | Heavily used navigation facade. |
| `apps/front/src/components/nav-section/mini/index.ts` | 0 | Phase 4 | Navigation internals. |
| `apps/front/src/components/nav-section/styles/index.ts` | 1 | Phase 4 | Navigation styling helpers. |
| `apps/front/src/components/nav-section/utils/index.ts` | 0 | Phase 4 | Navigation utility helper. |
| `apps/front/src/components/nav-section/vertical/index.ts` | 0 | Phase 4 | Navigation internals. |
| `apps/front/src/components/settings/drawer/index.ts` | 0 | Phase 4 | Settings submodule facade. |
| `apps/front/src/components/settings/index.ts` | 6 | Phase 4 | Settings facade used by app root/layouts. |
| `apps/front/src/layouts/auth-split/index.ts` | 0 | Phase 4 | Layout facade. |
| `apps/front/src/layouts/core/index.ts` | 0 | Phase 4 | Layout primitives facade. |
| `apps/front/src/layouts/dashboard/index.ts` | 0 | Phase 4 | Layout facade. |
| `apps/front/src/layouts/main/index.ts` | 0 | Phase 4 | Layout facade. |
| `apps/front/src/layouts/main/nav/components/index.ts` | 0 | Phase 4 | Main-nav internals. |
| `apps/front/src/layouts/main/nav/desktop/index.ts` | 0 | Phase 4 | Main-nav internals. |
| `apps/front/src/layouts/main/nav/mobile/index.ts` | 0 | Phase 4 | Main-nav internals. |
| `apps/front/src/layouts/simple/index.ts` | 0 | Phase 4 | Layout facade. |
| `apps/front/src/lib/cookies/index.ts` | 2 | Phase 4 | Mixed client/server cookie exports; split or make explicit. |
| `apps/front/src/lib/mui/theme/core/index.ts` | 0 | Phase 4 | Theme facade. |
| `apps/front/src/lib/mui/theme/core/mixins/index.ts` | 0 | Phase 4 | Theme helper facade. |
| `apps/front/src/lib/mui/theme/with-settings/index.ts` | 1 | Phase 4 | Theme settings facade. |

## Generated Client Exclusion

`packages/client-ts/src` currently has 72 generated `index.ts` files. Leave them alone
in this cleanup because `just generate-client` will recreate Kiota output. If the
generated import shape becomes a real problem, change the OpenAPI/Kiota generation setup
instead of editing generated files by hand.

## Phase Guidance

Phase 2 removed low-risk single-purpose barrels first. Consumers now import from the
concrete file and the PR remains mechanical.

Phase 3 removed inherited template component barrels with broader `export *`
surfaces. These were the main cleanup targets for dependency clarity.

Phase 4 should review layout, nav, settings, cookies, and theme facades case by case.
Do not delete these mechanically; decide whether the module boundary benefits from a
small explicit facade.

Phase 5 should add a guardrail that rejects new unapproved hand-written barrels under
`apps/front/src` while allowlisting generated client files and intentional facades.
