# Staff-tenants: design-002 package vs current front-2 — gap analysis (2026-07-12)

Package: `.dump/staff-tenants-design-002/` (8 screens byte-identical to the 001 bundle; what's new is the textual contract). Current code: branch `feat/front-2-full-parity-handoff` @ `538b8ed9` (TEN-1…TEN-5 + BE-1 + TEN-4/5 restorations). Evidence: deep code scout over the actual render code, 29 checkpoints.

## A — Already matching the design (no work)
- Identity header: brand tile, status chip, meta line `publyapp.com/<code> · N members · N owners · Since <date>`.
- Basics: 4 stat cards incl. Owners avatar-stack + pending-invites expire-soon chip; Organization card; Users preview (latest 5, level+status chips, View all); Owners card (≤5, amber chips, See all → users `?level=admin`); Danger zone (suspend/reactivate + delete-gated-until-suspended, ConfirmDialogs).
- Users tab: search + All levels + All statuses filters; `level` URL param; amber admin chip.
- Invitations: Invitee/Profile/Invited-by/Expires(amber <48h)/Status/⋯Revoke-pending-only; status filter.
- Profiles: 3-col card grid, tinted icon tiles, Default/Custom chip, member count, delete-disabled-on-default.
- Create: two-pane + sticky preview (Status=Active per owner decision), owner slots (Primary tag), CSV/XLSX dropzone + template + parsed summary + manual slots, seed-default-profile switch (real), SSO switch (disabled + "coming soon" per owner decision), sticky action bar.
- Cursor pagination + snake_case URL state everywhere; rail-only detail/create routes; tabs as route segments.

## B — Front-end-only gaps (honest today; no arbitrage needed — conventions already ratified)
1. **Tab title counts**: Profiles + Invitations headers lack "· N" — now honest via BE-1's `profilesCount`/`pendingInvitationsCount` (Users already shows its count).
2. **Invite user is a full page** (`users-invite.tsx`) — front-2's own ratified conventions mandate right-side drawers for invite flows. Convert to Drawer.
3. **New/Edit profile are full pages with name+description only** — convert to Drawer **with grouped permissions checklist**: the contract already supports it (`profiles.post` accepts `permissionKeys`; catalog via `client.staff.permissions.scopes.tenant.get`). Grouping by permission-key prefix.
4. **Create submit confirmation** (rich summary dialog) — absent; pure FE.
5. **Copy-to-clipboard** on Slug / Tenant ID (tooltips) — absent; pure FE.
6. **Edit tenant form** is a minimal single card (name/maxUsers/logoUrl), not the create form family — align layout/anatomy (fields stay honest).
7. **Empty states**: users/invitations tabs pass plain strings to DataTable instead of the unified 48px StateView scale (profiles tab already uses StateSurface).
8. **Users-tab selection machinery** exists in DataTable but is unwired (bulk semantics = arbitrage item C3).

## C — Requires backend or owner arbitrage
1. **Header extras**: "Open portal" (no portal URL concept anywhere), ⋯ menu (no defined content), Transfer ownership (no API op).
2. **Role taxonomy**: design shows Owner/Admin/Editor/Viewer; contract has levels `admin`/`user` only. Invitations "Role" column: the list item carries `profileName` (rendered today), not a role; the entity has `AccountLevel` the backend could expose + filter.
3. **Users bulk toolbar** (checkbox column → Export / Remove selected): no bulk endpoints and no CSV-export endpoint for tenant users. Options: client-side (export from loaded rows; remove = per-user delete loop), new backend, or drop.
4. **Missing display fields**: Legal name (no field), Last active (no field — would require session-activity tracking), profile **permissions count** on list items (backend could add, BE-1-style), profile **System vs Custom** naming (contract only has `isDefault` → currently "Default/Custom").

## D — Already owner-decided (stands; do not re-open)
- Preview status chip = **Active** (not Trial). SSO switch = disabled + "coming soon".
- Body grid = shared DetailGrid (1fr/420px owner-approved).
- Malformed ids → 404; hairline/ring elevation; radii scale; drawers-vs-modals split.
