# PublyApp — Solo Developer MVP Plan (2–3 months)

## 1) Project focus & niche

Start with LinkedIn-only scheduling for freelancers and small agencies. Rationale:

- Business audience already on LinkedIn; simpler API surface vs. TikTok/IG media rules.
- Validates core value (schedule → reliable publish) with one integration.
- Faster to ship solo; expand to other networks post‑MVP.

## 2) MVP goals

- Users connect a LinkedIn account (Page or Profile where API allows).
- Compose text + single image and schedule for a future time.
- Background job publishes reliably at the scheduled time and records status/URL.
- Minimal UI: queue (upcoming) + history (published/failed) with basic filters.
- Success criteria: ≥95% jobs fire ±60s; ≥99% success excluding auth/media errors; 5+ external users complete end‑to‑end flow.

## 3) Lean feature scope (must‑have)

Backend:

- LinkedIn OAuth connect/reconnect; encrypted token + refresh handling.
- Entities: SocialAccount, SocialPost, Schedule, PublishJob; MediaAsset (single image only, with validation).
- Endpoints: connect/list/revoke accounts; create/update post; schedule; list queue/history; retry failed publish.
- Scheduling: Hangfire with PostgreSQL storage; server hosted inside the API for MVP; protected Hangfire Dashboard for staff only. Benefits: persistent jobs, automatic retries/backoff, visibility.
- Validation: basic media constraints (MIME/size), per‑tenant isolation via existing filters.

Frontend:

- Connection wizard (LinkedIn only).
- Simple Composer (text, single image, schedule datetime, account selector).
- Queue & History views (list/table), status pills, retry action.

Out of scope for MVP:

- Multi‑network posting; approvals; drag‑drop calendar; Slack/email notifications; best‑time heuristics; analytics ingestion; hashtag sets; media library; billing.

## 4) Deferred / post‑MVP features

- Networks: Facebook Pages, Instagram professional, Pinterest, TikTok (flag behind config), YouTube.
- Calendar UI with drag/drop, bulk actions.
- Approvals & RBAC workflow using existing profiles/permissions.
- Notifications (email/Slack) for failures and approvals.
- Analytics ingestion + exports; evergreen queues; hashtag sets; saved captions.
- Stripe billing (Free/Pro/Agency) with usage caps.

## 5) Simplified technical plan

### Architecture

- Keep current API (`apps/api`) and host Hangfire Server inside it for MVP (no separate worker service initially).
- Use EF Core 9 with existing tenant filtering; add new tenant‑scoped entities.
- Storage: S3‑compatible bucket for single‑image uploads.

### Scheduling (Hangfire)

- Configure Hangfire with PostgreSQL storage.
- Use recurring/background jobs to execute due schedules; retries with exponential backoff; idempotent by `scheduleId`.
- Expose Hangfire Dashboard under a protected staff‑only route.

### APIs (tenant routes)

- `POST /tenant/social-accounts/linkedin/connect` (start OAuth); `GET /tenant/social-accounts`; `DELETE /tenant/social-accounts/{id}`
- `POST /tenant/posts` (draft); `PUT /tenant/posts/{id}`
- `POST /tenant/posts/{id}/schedule` (datetime, accountId)
- `GET /tenant/queue?from&to&status&accountId`; `GET /tenant/history?from&to&status&accountId`
- `POST /tenant/schedules/{id}/retry`

### Data model (new)

- SocialAccount: id, tenantId, provider='linkedin', externalAccountId, name, token(enc), refreshToken(enc), expiresAt, scopes, status
- SocialPost: id, tenantId, body, status(draft|scheduled|published|failed), mediaRef?, createdBy, createdAt, updatedAt, lastPublishUrl?
- Schedule: id, tenantId, postId, accountId, scheduledAt(UTC), timeZone(IANA id), status
- PublishJob: id, scheduleId, attempt, status, errorCode?, errorMessage?, externalPostId?, externalUrl?, publishedAt?
- MediaAsset (single image only): id, tenantId, storageKey, mimeType (image/*), size, width/height (validate limits)

### Security (MVP simplification)

- Use .NET Data Protection with a persisted key ring (PostgreSQL or filesystem) for token encryption and refresh data.
- Plan to migrate to cloud KMS post‑MVP.
- Keep rate limiting and provider ToS compliance.

### Time zones

- Users schedule in their local time zone; backend converts to UTC for storage.
- Store the IANA time zone id on `Schedule`.
- Display queue/history in the user’s local zone; handle DST correctly.
- Frontend uses date‑fns‑tz or Luxon; backend uses NodaTime or TZConvert as needed.

### Observability

- Correlated logs per publish; counters for success/fail/retries; error taxonomy for provider issues.

## 6) UI / UX plan

- Settings → LinkedIn connection (connect/revoke; account list + status). Show a banner if a LinkedIn token is expired/expiring soon.
- Compose modal: text (2k char cap), single image upload, datetime picker, account selector.
- Queue view: upcoming items (time, account, snippet, status, actions: edit/cancel). Filters: date range, status (scheduled/published/failed), account.
- History view: published/failed with external link. For failed items, show error message and provide a retry action.

## 7) Week‑by‑week plan

- Weeks 1–2: Entities/migrations; LinkedIn OAuth + token refresh; Data Protection setup.
- Weeks 3–4: Post & schedule endpoints; Composer UI; single‑image upload + validation.
- Weeks 5–6: Hangfire setup (PG storage + dashboard); publish pipeline; retries/backoff; external URL capture.
- Weeks 7–8: Queue/History views with filters; failure visibility (errors + token banner); UX polish.
- Weeks 9–10: Beta (5–10 users); edge‑case fixes; launch prep.

## 8) Acceptance criteria (MVP)

- Connect LinkedIn; schedule; publish; see success with external URL; retry failures.
- Timing accuracy within ±60s for ≥95% of jobs.
- Idempotent retry (no duplicate publishes on same schedule).
- Timezone conversions are correct (no DST misfires); UI times match user locale.
- Tenancy isolation enforced on all new entities and queries.

## 9) Risks & mitigations

- Provider quirks/limits → start with strict validation; robust error surfacing.
- Token expiry/scope issues → proactive refresh; clear UI status banner.
- Worker reliability → Hangfire persistence + retries; idempotency on scheduleId.
- Solo bandwidth → defer calendar/analytics/approvals; ship minimal UI to learn quickly.

## 10) Mapping to current codebase

- Reuse: `UseCheckTenantHeader`, `UseSessionAuthentication`, profiles/permissions, `MainApiDbContext` tenant filters, audit fields.
- Add: new DbSets for SocialAccount/SocialPost/Schedule/PublishJob; tenant‑scoped models implementing `ITenantEntity`.
- Endpoints: add under `RoutePath.Tenant` groups (align with existing routing style); update OpenAPI and regenerate client via `apps/front/_vite/generate-client.ts`.
- Frontend: extend `apps/front/app` with simple pages for Settings/Queue/History and a Composer modal.
- Deploy: use `dokploy.yml` to run API (with Hangfire server) and PostgreSQL; add object storage for images.

## MVP To‑Dos

- [ ] Add EF entities: SocialAccount, SocialPost (with status), Schedule, PublishJob; MediaAsset (single image)
- [ ] Implement LinkedIn OAuth connect/reconnect and token refresh (Data Protection key ring)
- [ ] Tenant APIs: accounts, posts, schedules, queue/history, retry
- [ ] Configure Hangfire (PostgreSQL storage), host server in API, protected dashboard
- [ ] Implement publish pipeline with idempotency and retries; capture external URL
- [ ] Single‑image upload to S3‑compatible storage with MIME/size validation
- [ ] Frontend: Settings (LinkedIn), Composer modal, Queue/History with filters and failure details
- [ ] Observability: structured logs, counters, correlation ids
- [ ] Beta: onboard 5–10 users; token‑expiry banner; fix edge cases; launch prep
