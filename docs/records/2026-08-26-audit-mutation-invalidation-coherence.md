# Audit: Mutation Invalidation Coherence (#359)

Date: 2026-08-26. Branch: `lane/wt-359`. Rule of record: "Mutation Invalidation
Coherence (#359)" in `docs/guides/front/conventions.md` (introduced by PR #1554).

This record is the auditable deliverable behind the PR's claim that all
`invalidateQueries` sites were classified against the coherence rule. The
`.dump/recensement.md` scratch note is superseded by this in-repo artifact.

## Method

```
grep -rn "invalidateQueries" apps/front/src --include="*.ts" --include="*.tsx"
```

= **170 occurrences** (matches the issue count). Breakdown by nature:

| Nature | Occurrences | Role |
|---|---|---|
| Tests (`.test.tsx` / `.test.ts`) | 118 | Assertions that verify the wiring — they check the rule, they are not the rule's target |
| Production `lib/query/*.ts` | 33 | Per-module invalidation helpers + internal `onSuccess` |
| Production routes (`routes/**`) | 15 | Calls into the helpers from mutation handlers |
| `lib/tab-sync/tab-sync-listener.tsx` | 2 | Cross-tab resync (invalidate-all) |
| Named-signature `invalidateQueries` (`_details-actions.ts`) | 2 | Injects the callback; the real call lives in the route |

The 33 production `lib/query` sites, one per module:

## Modules with mutations -> conforming helpers

| Module | Mutations | On-success invalidation | Conform |
|---|---|---|---|
| `staff-users.ts` | suspend/reactivate/delete/update/email/profiles + bulk ×3 | `invalidateStaffUsers` = `scopedKey('staff', ['staff-users'])` covers list + details + assigned profiles; delete adds `removeStaffUserDetails` | Y |
| `staff-tenants.ts` | create/update/suspend/reactivate/delete + bulk ×3 | `invalidateStaffTenants` / `invalidateAllStaffTenantScopes` covers list, details, users, invitations, nested profiles | Y |
| `staff-tenant-users.ts` | invite/bulk-invite/update/suspend/reactivate/remove/bulk-remove/export | `invalidateStaffTenantUsers` = `scopedKey('staff', ['staff-tenants','users'])` covers list + details | Y |
| `staff-invitations.ts` | bulk-create/bulk-revoke/resend/revoke/link | `invalidateStaffInvitations` = `scopedKey('staff', ['staff-invitations'])` | Y |
| `staff-tenant-invitations.ts` | revoke | Route calls `invalidateAllStaffTenantScopes` (covers invitations + tenant counters) | Y |
| `staff-profiles.ts` | create/update/bulk-delete (+ users via another module) | `invalidateStaffProfiles` = `scopedKey('staff', ['staff-profiles'])` covers list + details + permission-keys | Y |
| `staff-profile-users.ts` | bulk-unassign | **Fixed in this PR (round 2).** New `invalidateStaffProfileUsers` = `scopedKey('staff', ['staff-profiles','users'])` covers the nested users list family; wired via `onSuccess` on `useBulkUnassignStaffProfileUsersMutation`. Pre-fix: no `onSuccess`, no invalidation — a live violation the original guard missed because it never imported this module. | Y (after fix) |
| `staff-global-tenant-users.ts` | update identity/link companies/bulk-unlink | `invalidateGlobalTenantUsers` = `scopedKey('staff', ['staff-global-tenant-users'])` | Y |
| `staff-tenant-profiles.ts` | create/update/delete/bulk-delete/assign+unassign perm/user | `invalidateStaffTenantProfiles` = `scopedKey('staff', ['staff-tenants','profiles'])` | Y |
| `social-accounts.ts` | connect/reconnect/disconnect/save-projects | Each `onSuccess` -> `invalidateSocialAccounts`, which reuses `socialAccountsQueryOptions.queryKey({ tenantId })` | Y |
| `tenant-posts.ts` | save/delete | **Fixed in round 1.** `invalidateTenantPosts(qc, tenantId)` awaits BOTH the list family and the details family `[...,'detail',tenantId,{postId}]`; pre-fix only covered the list family, leaving the post detail stale (the "line" half of the rule). | Y (after fix) |
| `tenant-post-images.ts` | attach/remove/alt | `useInvalidatePostImageCaches` -> `scopedKey('tenant', ['tenant-posts'])` (deliberately wide prefix, documented) | Y |
| `tenant-account-profile.ts` | update | `onSuccess` + helper -> `['tenant','account-profile',tenantId]` (self-bearing detail; no derived list) | Y* |
| `tenant-settings-general.ts` | update | `onSuccess` + helper -> `['tenant','tenant-settings-general',tenantId]` | Y* |

\* These two modules mutate a detail entity with no derived list/counter
projection, so the rule requires no list invalidation. The guard treats them as
"no-list mutation module" (documented in the guard registry).

## Production sites without an associated mutation (out of rule scope)

`tab-sync-listener.tsx` ×2 — login/logout broadcast across tabs -> global or
current-key invalidate-all. Not a domain mutation; invalidate-all is intended.

## Defects found and corrected

1. `tenant-posts.ts` (round 1): save/delete covered only the list family; the
   `'detail'` segment precedes `tenantId`, so the invalidated prefix could not
   reach `['tenant','tenant-posts','detail',tenantId,{postId}]`. Post detail
   stayed served from stale cache. Fixed by one `invalidateTenantPosts` helper
   awaiting both families. Red/green proof in `.dump/proof-red.md`.
2. `staff-profile-users.ts` (round 2, BLOQUANT 2): `useBulkUnassignStaffProfileUsers`
   had no `onSuccess`/invalidation. Unassign is a list-membership mutation under
   the rule's own wording. Fixed by `invalidateStaffProfileUsers` (nested
   `['staff','staff-profiles','users']` family) wired via `onSuccess`. Red/green
   proof in `.dump/proof-r2-red.txt` and `.dump/proof-r2-green.txt`; the red run
   carries the reverted-diff at its head.

## Residual structural observations (no action; documented as debt)

- `needs-reconnect-accounts.ts` (`staleTime: Infinity`) is refreshed on shell
  re-mount, not by the social mutations. Max impact one session. Out of #359
  scope (no list).
- `tenants-for-picker.ts` is not invalidated after a staff suspends a tenant;
  impact limited to a staff-in-tenant-scope cache, corrected on re-login. Known
  pre-existing debt, not a regression from this PR.

## The guard (tenability deliverable)

`apps/front/src/lib/query/mutation-invalidation.guard.test.ts` audits the REAL
artifact: it discovers mutation modules from the file system (`lib/query/`),
classifies each by whether it owns a `useMutation`, and cross-checks that set
against a registry. Any mutation module on disk missing from the registry — or
any registry entry pointing at a file that no longer exists — turns the guard
RED, naming the module (round-2 BLOQUANT 1 fix: no silent drift). For each
audited `list-family` module it imports the real module, captures every
`QueryClient.invalidateQueries` key via a real-`QueryClient` spy, and proves
with TanStack prefix matching that the module's own list query family is
covered. No source-text scanning; no conforming default when a module cannot be
analyzed. The adversarial rediscovery (drop the helper -> red, restore -> green)
is captured in `.dump/proof-r2-*.txt`.

## Proof artifacts (adversarial rediscovery)

The guard's sensitivity is proven by reverting the BLOQUANT-2 fix and watching
the guard turn RED, then restoring it to GREEN — captured verbatim:

- `.dump/proof-r2-red.txt` — guard run with `invalidateStaffProfileUsers` removed
  (the real fix diff is at the head of the file). The guard reddens naming
  `staff-profile-users.ts`.
- `.dump/proof-r2-green.txt` — guard run with the fix restored. 18/18 pass.

These are local scratch evidence (under `.dump/`, git-ignored); the in-repo
guard test plus this record are the durable deliverables.
