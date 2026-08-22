Status: Archived
Original location: docs/old-front/README.md
Archive reason: Retired apps/old-front on 2026-08-22; reference preserved before deletion (tag old-front-final).
Superseded by: none

# old-front archive (retired 2026-08-22)

This directory is the reference archive for `apps/old-front`, the retired React Router v7 + MUI frontend. The code is gone; product intent is preserved here for the three surfaces not yet ported to `apps/front`.

## What this archive is

- **Read-only reference** for porting. Not normative, not maintained. It captures what old-front did at retirement so the port has factual source, not memory.
- **Git tag for full source:** `old-front-final` — the captain creates this tag at the merge commit's parent. Check out that tag to browse the complete deleted tree:
  ```bash
  git fetch origin tag old-front-final
  git checkout old-front-final -- apps/old-front
  ```
  (or `git show old-front-final:apps/old-front/src/routes.ts` etc.)

## What's archived

- `routes.md` — every old-front route (path -> file -> loader/API calls -> i18n namespaces), generated from `apps/old-front/src/routes.ts` and `apps/old-front/src/routes/_tree/**`, not hand-typed.
- `screens/marketing.md` — marketing pages (home, pricing, about, contact, security, blog, changelog, privacy, terms, cookies): components, fields/columns/actions, validation (zod verbatim), states, feature flags.
- `screens/staff-tenant-users.md` — staff global tenant-users detail (general + organizations): components, fields/columns/actions, validation, states, feature flags, and API endpoints used.
- `screens/tenant-workspace.md` — tenant workspace (posts composition/calendar/queue/history, settings, account, organizations): components, fields/columns/actions, validation (none yet — static placeholders), states, feature flags.
- `i18n-keys.md` — old-front i18n keys per namespace that `apps/front` does NOT have yet (diff of JSON files), so the port knows what copy exists.

## Open issues that port from this archive

- **Marketing:** #368 "Marketing pre-launch: replace placeholder content + data across all marketing pages", #369 "Marketing forms: wire real backends for contact, newsletter, and changelog subscribe", #370 "Cookie consent banner — GDPR/CCPA-compliant", #372 "New marketing surfaces from AIDesigner batch (comparison, features, case studies, tools, help, roadmap)", #373 "Build /docs surface with DocsLayout (separate from MarketingLayout)", #374 "Marketing SEO infrastructure: sitemap.xml, robots.txt, structured data", #375 "Marketing analytics integration (provider + cookie-banner coupling)"
- **Tenant workspace:** #1127 "Epic: old-front -> front tenant parity — full-stack workspace surfaces" (covers posts composition/calendar/queue/history, settings, account, organizations)
- **Staff global tenant-users (detail + organizations):** 1161 — created for this archive (see below)

The staff tenant-users issue was created as part of this cutover because no open issue tracked that specific global surface (front only has tenant-scoped users).

## Staff tenant-users issue

Created via:

```bash
gh issue create --repo radandevist/publyapp --title 'front: port staff global tenant-users pages (detail + organizations) from old-front archive' (issue #1161)
```

Body carries the old route paths and API endpoints (from `screens/staff-tenant-users.md`):

- Routes: `/staff/tenant-users/details/:userId` (index redirect), `/staff/tenant-users/details/:userId/general`, `/staff/tenant-users/details/:userId/organizations`
- Layout: `tenant-user-details-layout.tsx` with `useGetTenantUserById`
- Endpoints: `GET /staff/tenant-users/{userId}`, `PATCH /staff/tenant-users/{userId}`, `GET /staff/tenant-users/{userId}/companies` (cursor), `POST /staff/tenant-users/{userId}/companies`, `DELETE /staff/tenant-users/{userId}/companies` (bulk, max 100), plus `GET /staff/tenants` for link-drawer options

## Verification

Archive route list count equals old-front route count: see `routes.md` header (77 unique route targets in tree files; 182 TSX files under routes including _parts/_layout helpers). Exact numbers are stated in the PR body alongside this archive.

## How to use

- Port `apps/front` from this archive, not from memory. Check `routes.md` for the URL, file, loader, and API columns; check the relevant `screens/*.md` for components, validation, and states.
- Copy zod schemas verbatim from fenced blocks (they are copied exactly from old-front source).
- For the full deleted tree, check out `old-front-final`.

