# #1862 — empty/null failure reason falls back to "other"

The bulk-revoke outcome classifier in
`apps/front/src/routes/authed/staff/invitations/_list-bulk-actions.tsx`
(`describeBulkRevokeFailureReasons`) maps per-item failure reasons to
translations. A null or empty reason was not handled — it would fall through
to the raw key and render a broken product message.

## Step 1: GREEN before (all 15 tests pass)

```
$ pnpm --filter front exec vitest run src/routes/authed/staff/invitations/invitations-bulk-revoke-routing.test.tsx --reporter=verbose
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

## Step 2: BREAK — replace `?? ''` with `|| 'already_accepted'`

```bash
sed -i "s/const reason = item.reason ?? '';/const reason = item.reason || 'already_accepted';/" \
  apps/front/src/routes/authed/staff/invitations/_list-bulk-actions.tsx
```

## Step 3: RED — mutation + new fixtures

```
$ pnpm --filter front exec vitest run src/routes/authed/staff/invitations/invitations-bulk-revoke-routing.test.tsx --reporter=verbose
 × src/routes/authed/staff/invitations/invitations-bulk-revoke-routing.test.tsx > #1387 invitations selection-mode bulk revoke (real router) > 'a failure with null reason falls back…' response clears the selection, invalidates the list, and renders the outcome 25322ms
 × src/routes/authed/staff/invitations/invitations-bulk-revoke-routing.test.tsx > #1387 invitations selection-mode bulk revoke (real router) > 'a failure with empty reason falls bac…' response clears the selection, invalidates the list, and renders the outcome 25449ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/routes/authed/staff/invitations/invitations-bulk-revoke-routing.test.tsx > #1387 invitations selection-mode bulk revoke (real router) > 'a failure with null reason falls back…' response clears the selection, invalidates the list, and renders the outcome
 FAIL  src/routes/authed/staff/invitations/invitations-bulk-revoke-routing.test.tsx > #1387 invitations selection-mode bulk revoke (real router) > 'a failure with empty reason falls bac…' response clears the selection, invalidates the list, and renders the outcome
 Test Files  1 failed (1)
      Tests  2 failed | 13 passed (15)
```

Both new cases fail — the null/empty reason renders a wrong known case
instead of the generic fallback.

## Step 4: REPAIR — restore `?? ''` fallback

```bash
cp /tmp/lba-backup.tsx apps/front/src/routes/authed/staff/invitations/_list-bulk-actions.tsx
```

## Step 5: GREEN after repair

```
$ pnpm --filter front exec vitest run src/routes/authed/staff/invitations/invitations-bulk-revoke-routing.test.tsx --reporter=verbose
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

## Files changed

- `apps/front/src/routes/authed/staff/invitations/invitations-bulk-revoke-routing.test.tsx`
  — added 2 cases covering null and empty failure reasons.
