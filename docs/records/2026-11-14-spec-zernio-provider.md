# #2343 — Publishing through an aggregator (Zernio first), bring-your-own-key (spec)

Date: 2026-11-14 (owner decisions recorded 2026-11-17) · Issue: #2343 · Status: all owner decisions A–G decided (2026-11-17), ready for implementation slices

## Goal

Let an organisation publish to Facebook pages and Instagram (and later other
networks) through a unified social API it pays for itself, while Bluesky, Mastodon,
Pixelfed and Discord keep their native providers.

**Framing (owner, 14/11): the aggregator is a temporary bridge.** The end goal is to
publish directly to each platform with our own app, no middleman; the aggregator only
covers the time until Meta, LinkedIn, X, TikTok… approve our app. So the model is
centred on the **platform account** (a Facebook page, an Instagram account), and *how we
reach it* is a per-account **delivery route**: `native` or `via aggregator X`. Zernio is
the first **aggregator adapter**. Nothing in the domain, data model, UI or jobs may name
Zernio, and nothing may assume the route is permanent.

## Owner decisions (from the issue, 05/11 and 08/11)

- « add Zernio (zernio.com, unified social API) as an optional, bring-your-own-key
  publishing provider. »
- « A Zernio API key per organisation, stored encrypted (same mechanism as the social
  accounts master key). »
- « An "Importer depuis Zernio" button that lists the organisation's Zernio accounts
  and imports them, tagged "via Zernio". »
- « Publishing through Zernio for those accounts, with an `Idempotency-Key` derived
  from our publication id, and the per-platform status and URL stored on the
  publication (transparent failure causes rule). »
- « The native APIs stay for Bluesky, Mastodon, Discord and Pixelfed. »
- « Optional: an organisation without a Zernio key keeps today's behaviour. »
- Billing: « the key is the organisation's own, so the cost is theirs. »
- Live test 08/11: `GET /v1/accounts` listed 2 Facebook pages + 1 Instagram;
  `publishNow` returned 201 with one `platformPostUrl` per page; the same
  `Idempotency-Key` returned 200 and the same post (no duplicate). Instagram untested
  (needs an image).
- **Decisions of 2026-11-17:**
  - **D — platforms:** Facebook pages + Instagram first; other platforms later, one by one.
  - **A — publish status:** **webhooks**, « the official way, don't spam Zernio's API with polling ». Polling is not a path; the only safety net is ONE reconciliation `GET` per publication when no webhook arrived after a generous delay (see « Status tracking »).
  - **Safety net accepted:** the single reconciliation `GET` ~15 minutes after the send, when no webhook arrived (never periodic), is accepted as the fallback.
  - **C — scheduling:** our own scheduler keeps the scheduled time; at due time we send `publishNow` to Zernio (no `scheduledFor` at Zernio).
  - **E — post granularity:** one Zernio post per destination (per publication), not one grouped post. Reasons: our engine is per-destination; the native path is per-account; accounts may mix native and aggregator routes; retries are safe per destination with their own idempotency key; Zernio bills per connected account, not per call.
  - **F — route switching:** the data model for switching an account's delivery route (changeable route on the account) is prepared now; the « move to native » screen/flow is built only when our first native platform app is approved. The flow stays documented in « Moving an account to native ».
  - **G — operator switch:** none for now; Zernio appears only for an organisation that saves its own key.
  - **B — media:** via Zernio's presigned upload; our storage stays private. A future native Instagram route will need public signed media URLs (Meta fetches the image); out of scope now.
- Added 14/11: **adaptable from day one** — swapping Zernio for another aggregator, or
  adding a second one, must be one adapter + config: no core-model migration, no UI
  rewrite; an account must be movable between native and via-aggregator without losing
  history where feasible.

- Added 14/11 (second clarification): the aggregator is only a bridge until our own app
  is approved by each platform; the account belongs to the platform, the route is a
  per-account property; platform limits are shared by both routes; switching an account
  to native keeps its row, history, publications, analytics and composer behaviour;
  native and aggregator routes implement the same publishing port; a « Path to native »
  section (research only).

## Non-goals

- Implementing any native Facebook/Instagram/LinkedIn/X/TikTok integration (only researched here, « Path to native »).
- A second adapter (YAGNI: the port is shaped by Zernio's real behaviour, nothing speculative).
- Zernio features beyond publishing: inbox, ads, analytics, DMs, queues, drafts, approvals.
- X/Twitter (Zernio bills it per post from a balance, 402 `insufficient_balance`), TikTok, YouTube, LinkedIn: not enabled first.
- Threads / follow-up segments on aggregated accounts (`SupportsThreads = false`, same rule as Pixelfed).
- Video (the app attaches images only today).
- Billing, metering or re-selling Zernio.

## Research findings

### Today's code (worktree off `develop` e80a5a962)

- Delivery seam: `IPublishProvider` (`apps/api/Modules/Publishing/Providers/IPublishProvider.cs`) with `PublishAsync` and a read-only `ReconcileAsync` (#2176). `RoutingPublishProvider` (in `MastodonPublishProvider.cs`) switches on `SocialProvider`. Implementations: `BlueskyPublishProvider`, `MastodonPublishProvider` (also Pixelfed), `DiscordWebhookPublishProvider`, plus `Fakes/`.
- Outcomes: `PublishResult` = `Published | AlreadyExistsTreatedAsPublished | AccountFailure | ContentFailure | Ambiguous | TransientFailure` (`PublishResult.cs`). Providers never throw for classified failures; causes pass `LastErrorSanitiser`.
- Request: `PublishRequest` (ids, idempotency key, body, media as bytes already read from storage, `Capability`, session). Media bytes come from `_FileStorage.ReadAsync` in `PublishPublicationJobHandler`; our storage URLs are not public.
- Session seam: `ISocialSessionProvider.OpenSessionAsync(accountId)` returning `SocialSessionResult.Opened | AccountFailure | Transient`; `RoutingSocialSessionProvider` routes per provider. `SocialSession` is Bluesky-shaped (`Did, Handle, AccessJwt[redacted], PdsHost`).
- Job: `PublishPublicationJobHandler` (826 lines) maps results to statuses; max attempts, `JobOutcome.Retry(DelayOverride)`, ambiguous-write journal (`PublishAttemptJournal`), thread segment results (`publication_segment_results`). Status is written only by `PublicationStatusTransitionService`.
- Failure categories: `PublicationFailureCategory` = `Reconnect, FixContent, RetryLater, Unknown, NeedsReview` with `PublicationFailureCategoryWire.CauseOrGeneric` (never a blank cause).
- Idempotency: `PublicationIdempotencyKey.For(publicationId)`, stored on `publications.idempotency_key`; Bluesky uses it as record key.
- Publication external fields already exist: `external_record_id`, `external_url`.
- Accounts: `SocialAccount` (`provider`, `external_account_id`, `display_handle`, `credential_type`, `protected_credentials` NOT NULL, `status` Active/NeedsReconnect/Revoked, `capability_overrides`, `default_visibility`); unique index `(tenant_id, provider, external_account_id)` where not deleted. `SocialProvider` = Bluesky, Mastodon, Pixelfed, DiscordWebhook.
- Encryption: `CredentialProtector` (Data Protection, purpose `social-account-<provider>-v1`) keyed by the `SOCIAL_ACCOUNTS_MASTER_KEY` ring (`docs/guides/social-accounts.md`). Its API takes `SocialProvider`, so a string-purpose overload is needed.
- Limits: `ProviderCapabilityRegistry` (code table + per-account overrides) → `ProviderCapability(TextLimits, MaxImages, MaxImageBytes, AcceptedImageContentTypes, RequiresText, RequiresMedia, SupportsThreads, RequiresAltText, SupportsVideo)`, served to the composer by `GetProviderCapabilitiesForTenant` / `GetPublishTargetsForTenant` (front: `lib/query/tenant-publish-targets.ts`, `provider-capabilities.ts`).
- Operator switch: `DISABLED_PUBLISH_PROVIDERS` / `ProviderAvailability` (`SocialProvider` wire names).
- HTTP clients: named `AddHttpClient` in `Lib/ServiceRegistration.cs`; Mastodon uses `MastodonHostGuard` (SSRF guard for user-supplied hosts).
- Audit: `IAuditLogService.CreateAuditLogArgs` (used e.g. in `PublishNowForTenant`).
- Front: `routes/authed/tenant/settings/integrations.tsx` lists accounts with connect buttons per provider and drawers (`_mastodon-connect-drawer.tsx`); forms are drawers, never modals.
- No inbound webhook endpoint exists in the API today.

### Zernio API (public docs, read 14/11; nothing was called)

- Base `https://zernio.com/api/v1`, `Authorization: Bearer sk_…` — [quickstart](https://docs.zernio.com/quickstart).
- `GET /v1/accounts` → `accounts[]` with `_id` (posts target this id) and `platform` — same page.
- `POST /v1/posts` — fields `content`, `platforms`, `mediaItems[{url,type}]` (public HTTPS URL), `publishNow`, `scheduledFor`, `timezone`, `isDraft` — [create post](https://docs.zernio.com/posts/create-post).
  - `Idempotency-Key` (max 255 chars): retry within 24 h → `200` with the original post; original still processing → `409 idempotency_conflict` + `Retry-After`; original failed without creating a post → treated as new. The key alone is matched, not the body.
  - **Content-hash dedup**: identical content to the same account within 24 h → `409` with `existingPostId`.
  - Responses: `201` created; `200` idempotent retry; `207` inline publish partly/fully failed (a 2xx: read `post.status`); `202` X pending; errors `400, 401 (missing/invalid_credentials), 402, 403 (ACCOUNT_DISCONNECTED, ACCOUNT_NOT_ENABLED_FOR_POSTING, PROFILE_OVER_LIMIT), 409, 429, 503` (« a timed-out write may have succeeded »).
  - Per-platform result: `platform, status, accountId, username, publishedAt, platformPostId, platformPostUrl, errorMessage, errorCategory, errorSource`. Post statuses: `draft, pending_approval, scheduled, publishing, published, partial, failed, cancelled`; platform statuses: `pending, processing, uploading, published, failed, cancelled`.
- `GET /v1/posts/{id}` returns the post and `platforms[]` status; a TikTok entry can stay `publishing` up to 48 h (used here only for the single reconciliation read, never periodic polling) — [post lifecycle](https://docs.zernio.com/guides/post-lifecycle).
- `errorCategory`: `auth_expired, user_content, user_abuse, platform_rate_limit, quota_exhausted, account_issue, platform_rejected, platform_error, system_error, unknown`; `errorSource`: `user | platform | system` — same page. `POST /v1/posts/{id}/retry` reruns failed platforms — [error handling](https://docs.zernio.com/guides/error-handling).
- Rate limits: 60 req/min up to 2 connected accounts, 600 for 3–2000; headers `X-RateLimit-*`, `Retry-After` on 429 — [rate limits](https://docs.zernio.com/guides/rate-limits).
- Media: `POST /v1/media/presign {filename, contentType, size?}` → `{uploadUrl, publicUrl, key, expiresIn: 3600}`; `PUT` bytes to `uploadUrl` (no Authorization); `publicUrl` expires after 7 days unless used by a post (then copied to permanent storage); images JPEG/PNG/GIF/WebP; presign accepts up to 5 GB — [media uploads](https://docs.zernio.com/guides/media-uploads).
- Webhooks: `POST /v1/webhooks/settings {name,url,events,secret,isActive?,accountIds?,profileIds?,customHeaders?,disabledResourceGroups?}` **registers a webhook through the API** (also `GET` list, `PUT` update/rotate secret via `webhookId`, `DELETE ?webhookId=`; max 50 per user; needs the key's `webhooks` resource group, profile-scoped keys get 403) — [create webhook settings](https://docs.zernio.com/webhooks/create-webhook-settings). Events `post.published` (all targets ok), `post.partial`, `post.failed` (all failed), `post.cancelled`, per platform `post.platform.published` / `post.platform.failed`, and `webhook.test` via `POST /v1/webhooks/test`; post events echo the `metadata` we send at creation as `post.metadata`, identify the post as `post._id` and targets at `post.platforms[].accountId`. Header `X-Zernio-Signature` = lowercase hex HMAC-SHA256 of the raw body keyed with the endpoint secret (legacy alias `X-Late-Signature`), **no timestamp**; the event `id` is identical on every retry; respond 2xx within 5 s; retries on 408/429/5xx/timeouts/HTML 2xx, other 4xx are terminal (dead-letter); up to 7 attempts over ~51 h; endpoint disabled after 3 days without success — [webhooks](https://docs.zernio.com/webhooks), [post events](https://docs.zernio.com/webhooks/posts). The exact per-event JSON field names (`platformPostUrl` etc.) are on per-event pages not read; the webhook slice must confirm them against a `webhook.test`/real delivery.
- Platform limits (docs per platform, not exposed by an API as far as found): Facebook text up to 63,206 chars, up to 10 images, JPEG/PNG/GIF, 4 MB, text-only allowed — [facebook](https://docs.zernio.com/platforms/facebook); Instagram caption 2,200 chars, up to 20 images (carousel), JPEG/PNG, 8 MB, media required — [instagram](https://docs.zernio.com/platforms/instagram).
- Billing: per connected account beyond 2 (cost on the organisation's own Zernio plan).

## Architecture

### Ports and adapters

```
Composer / jobs / UI          (know only: SocialAccount, Publication, ProviderCapability)
        │
IPublishProvider   ◄── THE ONE publishing port (unchanged; jobs, retries, journal,
        │                status, failure categories only ever see this)
        │
RoutingPublishProvider   picks by (platform, account.delivery_route):
        ├─ native route      → BlueskyPublishProvider, MastodonPublishProvider,
        │                      DiscordWebhookPublishProvider… and LATER
        │                      FacebookPublishProvider, InstagramPublishProvider… (not built here)
        └─ aggregator route  → AggregatorPublishProvider (generic) → IAggregatorAdapter ◄── ZernioAdapter
                                                          (only place that knows Zernio URLs, JSON, error names)
```

A native provider and the aggregator route are two implementations of the same
`IPublishProvider` contract (`PublishAsync`, `ReconcileAsync`, the same `PublishResult`
and `ReconcileResult` kinds). Nothing above `RoutingPublishProvider` can tell them apart,
so when an account moves from the bridge to our own app, jobs/retries/status/failure
categories need no change.

New module folder `apps/api/Modules/Aggregators/` (`Ports/`, `Adapters/Zernio/`, `Entities/`, `Handlers/Tenant/`).

The port (one interface, shaped by what Zernio needs, no more):

```csharp
public interface IAggregatorAdapter {
    AggregatorKind Kind { get; }                       // enum, wire name "zernio"
    Task<KeyCheck> CheckKeyAsync(string apiKey, CancellationToken ct);          // test/rotate
    Task<ListedAccounts> ListAccountsAsync(string apiKey, CancellationToken ct); // import
    Task<AggregatorPostResult> PublishAsync(AggregatorPublishCall call, CancellationToken ct);
    Task<AggregatorPostResult> GetPostAsync(string apiKey, string postId, CancellationToken ct); // the single safety-net read + ambiguous-write reconcile
    AggregatorTraits Traits { get; }                   // see Adaptability (two knobs only)
    Task<WebhookRegistration> RegisterWebhookAsync(string apiKey, string url, string secret, CancellationToken ct);  // or Manual (slice 4)
    Task UnregisterWebhookAsync(string apiKey, string webhookId, CancellationToken ct);
    WebhookVerifyResult Verify(ReadOnlySpan<byte> rawBody, IHeaderDictionary headers, string secret);
    AggregatorEvent ParseEvent(ReadOnlySpan<byte> rawBody);                       // event id, post id, metadata, per-platform status/url/error
}
```

`AggregatorPostResult` is the neutral shape the adapter fills: `Outcome` (`Published | Pending | Failed`), `PostId`, `PlatformPostId`, `PlatformUrl`, `ErrorCategory` (our own enum, see failure mapping), `Cause`, `RetryAfter`, `WasWrittenMaybe`. **Failure classification lives in the adapter**; the generic provider maps our neutral outcome to `PublishResult`.

Why not one class per aggregator implementing `IPublishProvider` directly: the 80 % that is generic (media bytes → upload → result mapping, journal, ambiguity rules, capability use) would be copied per aggregator. The port keeps an adapter to ~1 file of HTTP + mapping.

### Platform account vs delivery route

The **platform account** is the stable thing: `SocialProvider` is the platform (add `Facebook = 4`, `Instagram = 5`; later ones are one value each) and `external_account_id` is the **platform's own id** of the account (the Facebook page id, the Instagram business account id), never an aggregator id. The **delivery route** is a per-account, changeable property: `delivery_route` = `Native | Aggregator`, plus (when aggregated) `aggregator_kind` and `aggregator_account_id`. Consequences:

- Labels, per-platform UI rules, composer behaviour, analytics keys, `publications.social_account_id` all hang on the platform account and are route-blind.
- Moving between routes is an UPDATE of the route columns on the same row (see « Moving an account to native »); history is untouched.
- Native routes exist today for Bluesky, Mastodon, Pixelfed, Discord (`delivery_route = Native`, the default, so every existing row stays valid). Facebook/Instagram have only the aggregator route until our app is approved.
- Matching key: `(tenant, provider, external_account_id)` (the existing unique index) is what lets a later native connection recognise the same account. Open item to verify on a real answer (we must not call the API here): that Zernio's `GET /v1/accounts` exposes the platform's own account id (docs only name `_id` and `platform`). If it does not, the import stores the Zernio `_id` as a provisional `external_account_id` and the native reconnect matches by platform + handle with an explicit user confirmation.

### Capabilities belong to the platform, not to the route

`ProviderCapabilityRegistry` stays the single source, keyed by platform. `Facebook` and `Instagram` entries hold what the **platform** accepts, identical for native and aggregated accounts, so the composer behaves the same before and after a route change. Rule: an aggregator may only **reduce** a platform's limits, never widen them. v1 needs no narrowing, so there is **no `Narrow` method in the port** (YAGNI). If a real refusal ever proves a tighter limit, it is added where capabilities are resolved today (`PublishTargetService`, `ProviderCapabilityRegistry.Resolve`, which currently have no adapter/route path) with a spec asserting the result is a subset of the baseline.

### Data model (expand-only migrations)

1. `aggregator_connections` (new): `id, tenant_id, aggregator_kind (int, validated in code; **no DB check constraint**, so a second aggregator never widens a constraint, which the expand/contract gate would flag), protected_api_key (Data Protection, purpose "aggregator-<kind>-v1"), key_hint (last 4 chars, plain, for display), protected_webhook_secret (random, generated by us; slice 4), aggregator_webhook_id (null when registered manually), webhook_status (None | Registered | Failing | Manual), last_webhook_at, status (Active | Invalid), last_checked_at, last_error, + BaseAttributes`. Unique `(tenant_id, aggregator_kind)` where not deleted. Plus (slice 4) `aggregator_webhook_events (connection_id, event_id, received_at, processed_at)` with unique `(connection_id, event_id)`, purged after 30 days.
2. `social_accounts` (add columns): `delivery_route int not null default 0` (`Native = 0`, `Aggregator = 1`; every existing row is Native), `aggregator_kind int null`, `aggregator_account_id text null`; check: `delivery_route = 1` requires both aggregator columns. **Partial unique index** `(tenant_id, aggregator_kind, aggregator_account_id) WHERE aggregator_account_id IS NOT NULL AND is_deleted = false`, so concurrent imports cannot duplicate (the existing `(tenant_id, provider, external_account_id)` index does not cover it). **The aggregator columns are not cleared when an account moves to native**: they become a read-only « previously via X » link. New `SocialCredentialType.Aggregated = 3` (and its `FormatCredentialType` wire value). `protected_credentials` is NOT NULL today: an aggregated-only account stores an empty protected value (relaxing to nullable is expand-safe; the implementation PR decides).
3. `publications` (add nullable): `delivery_route int null`, `aggregator_kind int null`, `aggregator_connection_id uuid null` (the **route snapshot**: written in the SAME commit as the pre-write attempt journal row, i.e. from `OnBeforeWrite`, before the first externally visible write, so a crash after the POST can never leave it null; null on rows before this feature = native), `aggregator_post_id text null` (written as soon as Zernio answers; used for webhook correlation and the single reconcile read). **Index** `(tenant_id, aggregator_post_id) WHERE aggregator_post_id IS NOT NULL` so webhook lookups never scan `publications`. `external_record_id` / `external_url` already carry the platform post id / URL. No per-platform table: one aggregator post per publication (decision E).
4. Enums stored numerically. No column is dropped or retyped and no existing constraint is replaced (the existing provider/credential checks, if any, are extended by a NEW validated constraint, never dropped). Contract (cleanup) migrations are not part of this work.

### Key handling

`ICredentialProtector` gets a string-purpose overload; the key is encrypted at write and decrypted only inside `AggregatorKeyStore.GetAsync(connectionId)` for the duration of one call. It never goes into `SocialSession` (that record's `AccessJwt` is meant for a short-lived token), logs, job payloads, error causes, audit entries or API responses (the API returns `key_hint` only). **Sanitiser:** `LastErrorSanitiser` (`SocialAccounts/Lib/LastErrorSanitiser.cs`) only scrubs quoted tokens, `Bearer`, `token=` parameters and JSON token fields, so a bare `sk_<64 hex>` would survive. Slice 1 adds a rule for the `sk_`/`zrk_` key shapes to the sanitiser (with its spec) AND the adapter strips the exact key string from any message before classifying. The secret-leak specs are extended to cover the connection endpoints and `last_error` columns.

### Session / request plumbing

**Session branch (N1, must be explicit).** `RoutingSocialSessionProvider.OpenSessionAsync` today sends only Discord and Mastodon/Pixelfed to their providers and **everything else falls through to Bluesky** (`MastodonSessionProvider.cs:94-100`); `BlueskySessionProvider` answers `AccountFailure("social account not found")` for any non-Bluesky row (`BlueskySessionProvider.cs:50-58`), which makes the job flip the imported account to `NeedsReconnect` (`PublishPublicationJobHandler.cs:214-219`, `_PauseForAccountAsync`) and drop it from the publish targets. So slice 2 adds the explicit branch: an account with `delivery_route = Aggregator` returns `SocialSessionResult.Opened(SocialSession(Did: aggregator_account_id, Handle: display_handle, AccessJwt: "", PdsHost: ""))` (identity only; the key is not in `SocialSession`, whose `AccessJwt` is meant for a short-lived token) and the fallthrough to Bluesky is replaced by an explicit mapping so an unmapped provider can never reach it. The session never fails because of the connection: a missing or invalid connection is detected by the aggregator provider, which answers `PublishResult.ConnectionFailure` (no account flip). `PublishRequest` gains `DeliveryRoute`, `AggregatorKind?`, `AggregatorConnectionId?`, `TenantId`; the aggregator provider loads the key through `AggregatorKeyStore` by connection id.

**Two sessions on a route flip (N9).** `ReconcileRequest` gains `DeliveryRoute`, `AggregatorKind`, `AggregatorConnectionId`, `AggregatorPostId`, read from the publication snapshot. The job (which today opens one session before both reconcile and publish, `PublishPublicationJobHandler.cs:214,306`) opens the session of the SNAPSHOT route for reconcile and, only if reconcile says `SafeToResend` or there is nothing to reconcile, opens the session of the account's CURRENT route for the publish. `RoutingPublishProvider.ReconcileAsync` routes by `request.DeliveryRoute`. If the snapshotted route's connection no longer exists, reconcile returns `NeedsReview` with that cause; it never falls through to the account's current route.

## Flows

Convention (review finding N8): user-visible strings, causes and webhook URLs are never built from the literal « Zernio » in generic code. They use the adapter's display name (`{aggregatorName}`) and the wire kind (`{kind}`); « Zernio » appears below only as the rendering of the first adapter, and the badge « via Zernio » means « via {aggregatorName} ».

### Save / test / rotate / remove the key (Integrations page, drawer)

- Endpoint `PUT /aggregators/{kind}/connection {apiKey}` (tenant API = root path, tenant from the `X-Tenant-Id` header; staff variants, if ever needed, live under `/staff/tenants/{tenantId}/...`, per `docs/guides/api-route-design.md`): adapter `CheckKeyAsync` (calls `GET /v1/accounts` with the key, never stored before it works) → encrypt → upsert row; audit log (`aggregator.connection.saved`, no key). Invalid key → 400 with the adapter's cause (« Zernio refused this key »). The same `…/aggregators/{kind}/…` prefix serves test, accounts, import and delete.
- `POST …/connection/test`: re-checks; updates `status`/`last_checked_at`.
- Rotate = PUT again (same flow). Accounts keep working; failed publications can be retried.
- `DELETE …/connection`: deletes the encrypted key (after best-effort webhook unregistration); every account routed through it becomes `NeedsReconnect` with `last_error` « {aggregatorName} key removed »; queued publications fail through the normal `AccountFailure` path with category `Reconnect`; no publication or history is deleted. Ambiguous publications written through it reconcile to `NeedsReview` (no key to ask with).
- Permission: same social-accounts manage permission. There is no operator switch (decision G): an organisation sees « Connect Zernio » and nothing else until it saves its own key.
- Key rejected at publish time (401): the new `PublishResult.ConnectionFailure` flags the connection `Invalid` (see failure table), banner on Integrations, the publication is paused with category `Reconnect` whose cause says to update the key; the social accounts are NOT flipped to `NeedsReconnect` (the account is fine).

### Webhook registration (at key save; ships WITH the endpoint, slice 4)

Zernio **does** let us register webhooks through its API (`POST /v1/webhooks/settings`, requires the key's `webhooks` resource group). At key save, after the key check:

1. Generate a random per-connection secret (stored encrypted as `protected_webhook_secret`; never shown after creation).
2. Call adapter `RegisterWebhookAsync(apiKey, url = <PUBLIC_API_BASE_URL>/webhooks/aggregators/<kind>/<connectionId> (kind = the wire name, `zernio` for the first adapter), secret)` which does `POST /v1/webhooks/settings` with `name: "PublyApp"`, `events: [post.platform.published, post.platform.failed, post.cancelled]` (one platform per post, so the rollup events `post.published/partial/failed` would only duplicate the per-platform ones under a different event id; `post.cancelled` is mapped to: publication parked `Paused`/NeedsReview with the cause « the post was cancelled on {aggregatorName} (account disconnected or post removed) »), `secret`, `isActive: true`; store the returned `_id` as `aggregator_webhook_id`; then `POST /v1/webhooks/test` once and mark `webhook_status = Registered` when the signed `webhook.test` arrives (otherwise `Failing` with the cause). **Config:** `PUBLIC_API_BASE_URL` already exists in `.env.example` (line 18) but `AppEnvironment` does not read it; slice 4 adds it to `AppEnvironment` (optional, validated as an https URL when set; absent or non-public → `Manual`).
3. **Fallbacks, all documented in the drawer:** a restricted key without the `webhooks` group or a profile-scoped key (403), the 50-webhook limit (400), or a non-public API URL (local dev) → `webhook_status = Manual`: the drawer shows the exact URL, event list and the generated secret once, with the steps to create it in the Zernio dashboard. Publishing still works (synchronous answers + the one-shot safety net); only asynchronous results depend on the webhook.
4. Re-save (rotation) calls `PUT` with the new `secret` on the stored webhook id; if the id is gone (404) it registers again. Key removal calls `DELETE ?webhookId=` best effort (the key may already be dead) then deletes our row.
5. `accountIds` filtering is NOT used in v1 (one webhook per organisation key covers all its accounts; re-imports need no webhook change).
6. Public URL requirement: the API must be reachable by Zernio over the internet; dev/preview setups without a public `PUBLIC_API_BASE_URL` get `Manual` and the feature degrades as above. Until slice 4 ships, key save registers nothing, so no connection can ever point Zernio at a missing endpoint; connections saved before slice 4 are registered by a « Register webhook » action on first load of the new drawer.

### Webhook endpoint

`POST /webhooks/aggregators/{kind}/{connectionId}` (anonymous route, own rate-limit bucket, body limit, raw body read before any parsing):

1. Load the connection by id and kind; unknown → `404` with no detail. Missing secret on our side → `500` fail closed (never process unsigned).
2. `adapter.Verify(rawBody, headers, secret)`: Zernio = lowercase hex HMAC-SHA256 of the raw body in `X-Zernio-Signature` (or `X-Late-Signature`), constant-time compare; mismatch → `401` (Zernio treats 4xx as terminal, which is right for a forged request).
3. `adapter.ParseEvent`; then, **in ONE database transaction**: insert `(connection_id, event_id)` (unique), and enqueue the processing job (the enqueuer joins the ambient transaction, `JobEnqueuer.cs:43-57`, so a failed enqueue rolls back the dedupe row and Zernio's retry is processed, never dropped). A unique-violation means the event was already stored together with its job → `200` immediately. The job marks `processed_at`; the unique key is per connection (not `(kind, event_id)` globally) so one tenant's ids can never shadow another's.
4. The job carries only `(connectionId, eventId, parsed minimal fields)`; return `200` within 5 s (Zernio's limit). A processing crash is retried by our job engine, not by Zernio.
5. Events not about a publication of ours (`message.*`, other post ids, `webhook.test`) are acknowledged and ignored (`webhook.test` updates `webhook_status`). Correlation: `aggregator_post_id` first, then `metadata.publicationId`, always checked to belong to the connection's tenant.
6. Update `last_webhook_at`; the health check compares it with the safety-net outcomes.

### « Importer depuis Zernio »

Generic UI label from the adapter's display name (« Importer depuis {aggregator} »), parameterised by kind.

1. `GET /aggregators/{kind}/accounts` → adapter `ListAccountsAsync` → rows `{aggregatorAccountId, provider, handle, avatar?, alreadyImported}`; platforms not in the code constant `EnabledAggregatedPlatforms` are returned `unsupported` and shown disabled with a reason (the constant starts with `Facebook` in slice 2 and gains `Instagram` in slice 5, so an account is never importable before it can publish).
2. User ticks accounts in a drawer → `POST /aggregators/{kind}/import {ids[]}` → one `social_accounts` row per id (`provider` from the platform, `aggregator_kind`, `aggregator_account_id`, `credential_type = Aggregated`, status Active). Badge « via Zernio » in the list.
3. Re-import is idempotent: existing `(tenant, kind, aggregator_account_id)` rows are refreshed (handle) not duplicated; the partial unique index above makes concurrent imports safe (a duplicate insert becomes an update).
4. Account removed/disconnected on the aggregator side: re-import flags imported accounts missing from the list `NeedsReconnect` (« no longer listed by {aggregatorName} »); a publish answering `ACCOUNT_DISCONNECTED` does the same. Nothing is deleted. **Recovery (N11):** a `NeedsReconnect` aggregated account is excluded from publish targets, retries and scheduling, and the existing reconnect action is Bluesky-only (`ReconnectSocialAccountForTenant.cs:23-40,69`; the Integrations page treats any non-fediverse/non-Discord account as a Bluesky reconnect, `integrations.tsx:442-446`). So: (a) the UI gates the reconnect action by `delivery_route`/provider and shows « Re-sync from {aggregatorName} » for aggregated accounts (never the app-password drawer); (b) that action (and any re-import) sets `status = Active` and clears `last_error` for every account still listed and connectable by the aggregator, and leaves the others `NeedsReconnect` with the aggregator's cause.
5. A listed account that matches an existing native account (same provider + handle): offered as « switch this account to Zernio » (see Moving) instead of creating a duplicate.
6. Cost note in the drawer: « Zernio bills accounts beyond the free 2 on your own plan. »

### Publish

Up to the routing step the flow is the existing one; the job handler changes in two steps: `ConnectionFailure` in slice 3, `Pending` in slice 4 (see « Delivery »). For an aggregated account:

1. Session opened as above (identity only; the provider loads the key by connection id).
2. Media: images fitted by `ImageDerivative` to the platform capability (note: `Fit` returns the source unchanged when it is within the byte cap and upright, `ImageDerivative.cs:53-64`; it does NOT convert formats, so format rules must be satisfied by the capability itself, see « Limits »), uploaded through the media path of decision B. **Presign safety:** the `uploadUrl` returned by Zernio is untrusted input: it must be `https`, without credentials in the URL, and pass the repo's public-address check (`MastodonHostGuard.IsPublicAddress` / `CreateHandler`, `SocialAccounts/Providers/Mastodon/MastodonHostGuard.cs:80-145`, reused or moved to shared infrastructure) on EACH presign response at publish time (the URL arrives then, not at connect time), with **redirects disabled** on the upload `HttpClient`, a size cap, and the adapter's own host allow-list (the media storage hosts Zernio documents, to be confirmed on a first real presign; a host outside the list is a `TransientFailure` with a plain cause, never followed).
3. `AggregatorPublishProvider` calls adapter `PublishAsync` with `{apiKey, aggregatorAccountId, platform, content, media, idempotencyKey = request.IdempotencyKey}`. Zernio adapter: `POST /v1/posts` with `Idempotency-Key = <our key>`, `publishNow: true`, one platform entry. `OnBeforeWrite` is called right before the POST (ambiguity journal as today).
4. Result mapping: `201`/`200` with platform `published` → `PublishResult.Published(platformPostId, platformPostUrl)` (a `200` replay is `AlreadyExistsTreatedAsPublished`); `207`/platform `failed` → classified failure (below); platform `pending/processing`/post `publishing`/`scheduled` → the new **`PublishResult.Pending(aggregatorPostId)`** (see « Status tracking »; until slice 4 ships, slice 3 maps a non-final answer to `Ambiguous` with a plain cause so no publication can hang). We also send `metadata: { publicationId }` on the post so webhook events can be correlated even if `aggregator_post_id` was never stored (crash between response and write).
5. Timeouts / `503` after the write started → `Ambiguous`. Reconcile (route taken from the publication snapshot, never the account's current route): resending with the same `Idempotency-Key` inside Zernio's 24 h window returns `200` with the ORIGINAL post (the key alone is matched, not the body), or `409 idempotency_conflict` → transient, retry after `Retry-After`. Therefore a replay is only trusted when it provably carries what we mean to send: the provider compares the returned post's `content` with `ReconcileRequest.ExpectedText` and honours `ResendPosition`/`ResendUnderNewKey` exactly like the Bluesky/Mastodon providers (`IPublishProvider.cs:40-49`, `PublishRequest.cs:61-64`); a mismatch (the user edited the post after the first attempt) or `ResendUnderNewKey` → `NeedsReview`, never `AlreadyExistsTreatedAsPublished` of old text. A `200` replay whose post is still `publishing` is `Pending`, not published. `ReconcileRequest.FirstAttemptAtUtc` decides the 24 h window: older → `NeedsReview`.
6. `409` with `existingPostId` (content-hash dedup: same text to the same account within 24 h) → `ContentFailure("this exact post was already sent to this account in the last 24 hours")`, unless `existingPostId` equals our stored `aggregator_post_id` (then it is ours: treat as the replay case above).
7. `429` → `TransientFailure(RetryAfter from header)`; connection errors before the write → `TransientFailure`.

Segments/threads: none (capability says no). `SetPublicationRendition` overrides keep working because content comes from the rendition.

### Status tracking

Decision A (2026-11-17): **webhooks**. Our publication states stay unchanged (`Scheduled/InProgress/Published/Failed/Paused`); the adapter's raw status is not exposed to the UI.

1. **Common case — final answer in the `POST` response** (`publishNow` is synchronous): no webhook needed to finish; the later `post.*` event is a duplicate and is a no-op.
2. **Pending case (new result kind; two switches to extend, N5).** `PublishResult.Pending(AggregatorPostId)` does not exist today and the job throws on unknown kinds (`PublishPublicationJobHandler.cs:361-392`), so slice 4 extends the handler: on `Pending` it writes `aggregator_post_id` through a new status-service method (`MarkPublishedArgs` carries only the record id/url and `_SucceedAsync` goes straight to Published), leaves the publication `InProgress`, enqueues the one-shot reconcile job (step 5) and completes the job normally. The webhook `post.platform.published` / `post.platform.failed` (our single platform target; the `post.published/failed` rollups say the same for a one-platform post) calls one internal command `ApplyAggregatorStatus(connectionId, postId|metadata.publicationId, platformStatus, url, error)`, which goes through `PublicationStatusTransitionService` like every other writer. The job has a SECOND `PublishResult` switch, `_ResolveOpenAttemptAsync` (`PublishPublicationJobHandler.cs:505-523`), whose default is `SubmissionState.Rejected`: `Pending` must map there to `Accepted` carrying the aggregator post id, otherwise a write that landed is journaled as not sent and can never be reconciled (spec for it in slice 4).
3. **Idempotent updates.** Event dedupe is the transactional insert described in « Webhook endpoint ». The status command is idempotent by its OWN terminal-state guard, not by `_AllowedSources` (whose `_TransitionOrThrow` throws on a repeated `Published`, `PublicationStatusTransitionService.cs:149,189-207`): before calling the transition service it reads the current status and (a) is a no-op when the publication already has the event's outcome, (b) ignores a `failed` for a `Published` row, (c) for a `Paused`/NeedsReview row (parked by the safety net) applies `published` through `Paused → Published` and refreshes the cause on `failed` instead of throwing (`Failed` is only reachable from `InProgress`). Tests: duplicate event, rollup duplicate, parked-then-failed, parked-then-published. Further, `Published` is never overwritten by a late `failed`; out-of-order events cannot move a publication backwards; the same event processed twice yields the same row. Allowed sources follow `PublicationStatusTransitionService._AllowedSources`: `InProgress → Published/Failed/Paused`, `Paused → Published` (a `Failed` row can NOT become `Published`, line 149), so the safety net parks rather than fails.
4. **Failure events** carry `errorCategory/errorMessage`: mapped by the adapter through the same table as the synchronous path (« Failure categories »), so the cause shown is identical whichever way it arrived.
5. **Safety net (not polling).** The job facility is minimal and reuses existing parts: `JobQueueItem.NextAttemptAt` already exists and the processor orders on it, but `EnqueueOptions` only carries an idempotency key and `JobEnqueuer` never sets it (`IJobEnqueuer.cs:9-11`, `JobEnqueuer.cs:30-40`), and `JobOutcome.Retry` re-runs the SAME job. Slice 4 adds `EnqueueOptions.Delay` (a `TimeSpan`) and the enqueuer's insert computes the due time **in SQL** (`next_attempt_at = now() + make_interval(secs => <delay>)`, inside the same transaction as the insert): the engine forbids app-written timestamps (`JobQueueItem.cs:57-61`, F11, `JobQueueItemConfiguration.cs:12-15`) and the claim predicate `next_attempt_at <= now()` is confirmed (`JobQueueProcessor.cs:426`). It enqueues `aggregator-reconcile` with idempotency key `reconcile-<publicationId>` and `Delay = 15 min` (constant, larger for slow platforms such as TikTok when enabled). The job (skipped if the publication is already terminal) does a **single** `GET /v1/posts/{id}` and applies the answer through the same command. If the post is still `publishing`, it does **not** reschedule: the publication is **parked `Paused` / `NeedsReview`** (`Failed` could not later become `Published`) with the cause « no final status from {aggregatorName} after 15 minutes; check the post there, then mark it published or retry », and a late webhook can still move it `Paused → Published`. Never a loop, never periodic: one extra call per publication that missed its webhook, zero otherwise.
6. **Webhook health.** `webhook_status = Failing` when the registration `webhook.test` did not arrive, or when the safety net had to fire for a publication while `last_webhook_at` is older than 24 h (no counter needed). Integrations then shows a banner « {aggregatorName} status updates are not reaching PublyApp » with the next action (re-register); the safety net keeps publications from hanging.


### Limits advertised to the composer

`ProviderCapabilityRegistry` gets entries for `Facebook` and `Instagram` (code table, same place as today) holding the PLATFORM limits (see « Capabilities belong to the platform »). Starting values from the docs read: Facebook `Utf16` 63,206, threads off, 4 MB JPEG/PNG/GIF per image, up to 10 images **but `MaxImages = 0` until the media path ships (slice 5)** so the composer never accepts images the aggregator provider cannot send (no silent text-only post); Instagram `Utf16` 2,200, up to 20 carousel images ([Meta](https://developers.facebook.com/docs/instagram-platform/content-publishing)), JPEG and PNG as accepted INPUT (Zernio accepts both, PNG up to 8 MB). Meta natively takes JPEG only and `ImageDerivative` does not convert formats (it only re-encodes on the resize/over-cap path), so the future native Instagram provider must transcode PNG to JPEG itself (listed under « Path to native »), `RequiresMedia = true`, `RequiresText = false`, threads off. `GetPublishTargetsForTenant` and the front need no change except labels/badge: limits already flow per destination.

### Failure categories (mapping lives in the Zernio adapter)

| Zernio signal | Our `PublishResult` | Resulting `PublicationFailureCategory` and effect |
|---|---|---|
| HTTP 401 / `invalid_credentials` (the org key) | new `ConnectionFailure("Zernio key rejected; update it in Integrations", invalidateKey: true)` | `Reconnect`; publication Paused; connection flagged `Invalid`; accounts untouched |
| 403 `PROFILE_OVER_LIMIT` (plan limit) | `ConnectionFailure("your Zernio plan limit was reached; upgrade or remove accounts on Zernio", invalidateKey: false)` | `Reconnect` (user acts on Zernio); publication Paused; key stays valid; account NOT flipped |
| 403 `ACCOUNT_DISCONNECTED`, `ACCOUNT_NOT_ENABLED_FOR_POSTING`; `auth_expired`; `account_issue` | `AccountFailure(cause)` | `Reconnect`; existing `_PauseForAccountAsync` flips THIS account to `NeedsReconnect` and pauses its siblings |
| 400 validation; `user_content`; `platform_rejected`; `user_abuse` (platform flagged the activity as spam: retrying fails every time, `errorSource` is `user`); 409 content-hash duplicate | `ContentFailure(cause)` | `FixContent` |
| 409 `idempotency_conflict`; 429; `platform_rate_limit`; `quota_exhausted`; `platform_error`; `system_error`; 5xx before the write; `unknown`; unreadable body | `TransientFailure(cause, Retry-After)` | `RetryLater` after retries (the job always maps Transient to `RetryLater`; `Unknown` is only a legacy fallback and is not produced) |
| 503 / timeout after the write started | `Ambiguous` | resolved by reconcile, else `NeedsReview` |

`ConnectionFailure(cause, invalidateKey)` is a new `PublishResult` kind (job handling added in slice 3: pause the publication with the cause, no account flip; when `invalidateKey` is true the connection service flags the connection `Invalid`, never optional). `Pending` is the other new kind (slice 4).

All causes pass `LastErrorSanitiser` and never contain the key; if Zernio gives no message the category's generic sentence is used (`CauseOrGeneric`).

## Moving an account to native (when our own app is approved)

Goal: the account row, its history, publications, analytics and composer behaviour stay; only the route and credentials change.

1. **Trigger.** On an aggregated account whose platform has a native provider enabled (`ProviderAvailability`), Integrations shows « Connect directly » (drawer).
2. **Native OAuth** (platform-specific, in the future native provider): the user authorises OUR app and picks the page/account; the callback returns the platform account id and tokens.
3. **Match by platform account id.** Look up `(tenant, provider, external_account_id)`: found → this is the same account, reuse the row; not found → a new account row is created and nothing is merged (the user is told why). **This is a NEW native credential-swap path per platform, not `ReconnectSocialAccountForTenant`**: that endpoint only accepts a Bluesky app password (`ReconnectSocialAccountForTenant.cs:23-40,69`) and the service rejects every non-Bluesky account (`SocialAccountService.cs:434-438`). If Zernio exposed only its own `_id` at import, the account's `external_account_id` is provisional (equal to the aggregator id); the native flip rewrites it to the platform's id after the user confirms the handle match, checking the unique index for a conflict.
4. **Flip in one transaction:** `protected_credentials` = the native tokens (Data Protection purpose of the platform), `credential_type = OAuth`, `delivery_route = Native`, `status = Active`, `last_error = null`. **`aggregator_kind` and `aggregator_account_id` are kept** as a read-only link (shown as « previously published via Zernio »; never used to publish while the route is Native).
5. **History is untouched.** Publications keep `social_account_id`; their `delivery_route`/`aggregator_kind` snapshot still says « via Zernio » for old ones and « native » for new ones. Analytics, calendar, project visibility and `capability_overrides` hang on the account row, so they carry over. The composer reads capabilities by platform (unchanged), so nothing the user sees about limits changes.
6. **In-flight work.** Scheduled publications are routed at publish time from the account's CURRENT route (so they leave natively after the flip). An `Ambiguous` publication reconciles through its OWN snapshotted route (`delivery_route`, `aggregator_kind`, `aggregator_connection_id`, `aggregator_post_id` on the publication, carried by `ReconcileRequest`; see « Session / request plumbing »); the aggregator key must still exist, otherwise it falls to `NeedsReview` with a clear cause. It is never reconciled or re-sent through the account's new native route. Pausing aggregated publishing for the few seconds of the flip is not needed.
7. **Way back / cleanup.** Reverting to the bridge is the same flip in reverse as long as the aggregator connection is still valid. Once all accounts of a connection are native, the owner deletes the key (« Remove Zernio key ») with no effect on history. An optional later contract migration can drop the retained aggregator link; it is not needed now.
8. **Audit.** `social_account.route_changed` (from, to, actor) in the audit log; no token in the entry.

## Open decisions for the owner

### A. Status: webhooks or polling? — DECIDED 2026-11-17: webhooks

- **Owner decision:** webhooks, « the official way, don't spam Zernio's API with polling ». Polling is removed as a path; one reconciliation `GET` per publication after a generous delay is the only fallback (« Status tracking » step 5).
- **What this costs us (accepted):** a public endpoint per aggregator kind, a secret per connection, registration at key save, replay protection by event-id dedupe (the signature has no timestamp), and harder local testing (mitigated by the fake aggregator server posting signed events to the endpoint in specs, and `webhook.test` for a manual check).
- **Example:** an Instagram carousel is accepted at 10:00:00 as `processing`; Zernio posts `post.platform.published` at 10:00:06 with the URL; we record it once even if Zernio retries the delivery, and never call Zernio again for that post. If that webhook never arrives, a single `GET` at 10:15 settles it.

### B. Media: Zernio presign upload or our storage URLs? — DECIDED 2026-11-17: presigned upload, our storage stays private

- **What it decides:** how images reach Zernio.
- **Option 1 — presign** (`POST /v1/media/presign`, `PUT` bytes, use `publicUrl`). Pro: our storage stays private (it is not publicly readable today), no new exposure, we already hold the bytes in the job (same as Bluesky/Mastodon upload). Con: one more round trip per image; presigned URL lives 1 h (fine, we upload right before posting); Zernio-specific, so the neutral port is « adapter receives bytes and decides » (a second aggregator that takes URLs would need its own upload).
- **Option 2 — our URLs**: make a signed public URL of our blob. Pro: no upload step. Con: needs a new public, signed, expiring media endpoint (security surface, SSRF-adjacent, CDN/tunnel concerns, hotlink/expiry races on retries).
- **Example:** a 3-image Facebook post: option 1 = 3 presigns + 3 PUTs + 1 post; option 2 = sign 3 URLs + 1 post, but Zernio must be able to reach our server within seconds.
- **Safety of the upload URL:** see « Publish » step 2 (public-address check, no redirects, host allow-list).
- **Native note (« Path to native »):** Meta's Instagram API fetches the image itself from a **public URL**, so a future native Instagram route will need a public, expiring media URL anyway. That is a native-route concern; it does not change the recommendation for the bridge.
- **Recommendation:** presign (option 1), inside the adapter. The port passes bytes (as providers already receive them), so Decision B is invisible to the domain.

### C. Where does scheduling happen: our scheduler or Zernio's `scheduledFor`? — DECIDED 2026-11-17: our scheduler, `publishNow`

- **Option 1 — our scheduler** (`DispatchDuePostsJob`) fires at the due time and sends `publishNow`. Pro: one state machine, edit/cancel/reschedule work as for native accounts, aggregator-agnostic, nothing to reconcile. Con: depends on our worker being up at the due minute.
- **Option 2 — send `scheduledFor` to Zernio.** Pro: Zernio publishes even if we are down. Con: two sources of truth; editing/cancelling must call Zernio and can race; every aggregator has different semantics.
- **Example:** post scheduled for 18:00, user edits the text at 17:55: option 1 changes our row; option 2 must update the remote post and handle « already publishing ».
- **Recommendation:** option 1 (our scheduler, `publishNow`). Revisit only if worker uptime becomes a real problem.

### D. Which platforms first? — DECIDED 2026-11-17: Facebook pages + Instagram, others later one by one

- **Option 1:** Facebook pages + Instagram only (what the live test covers; clear docs limits). **Option 2:** every platform Zernio lists (16+).
- **Trade-off:** each extra platform needs limits, media rules, error nuances and QA; Instagram alone already adds `RequiresMedia`.
- **Recommendation:** Facebook pages + Instagram. Other platforms appear in the import list as « not supported yet » (disabled), enabled one registry entry at a time.

### E. One aggregator post per publication, or one post for several accounts? — DECIDED 2026-11-17: one post per publication

- **Option 1 — one Zernio post per publication** (our unit): clean per-destination status/URL/failure, simple idempotency key = publication id. Con: N calls for N destinations; content-hash dedup (24 h) can collide when the same text goes to the same account twice.
- **Option 2 — one post with several platform entries** (as in the live test): fewer calls; but one key for several of our publications and partial results to split.
- **Example:** same text to 2 Facebook pages: option 1 = 2 posts, 2 keys; option 2 = 1 post, `partial` possible.
- **Recommendation:** option 1.

### F. Native ↔ aggregator switching: build the endpoint now or later? — DECIDED 2026-11-17: model now, flow later

- **Option 1 — model-ready now, UI/endpoint when our first native platform is approved.** The columns (`delivery_route`, retained aggregator link on accounts; route snapshot on publications) ship in slice 2 (both migrations named there), so no later migration of the core model is needed. **Option 2 — build the whole « Connect natively » flow now.** It cannot work before a native integration exists, so it would be dead code.
- **Recommendation:** option 1. The flow is fully specified in « Moving an account to native » below so the first native PR only implements it.

### G. Operator switch and who sees the feature — DECIDED 2026-11-17: no switch

- **Option 1:** reuse the `DISABLED_PUBLISH_PROVIDERS` idea with a sibling `DISABLED_AGGREGATORS` env (default: enabled). **Option 2:** no switch (the feature is invisible without a key anyway).
- **Recommendation:** option 2 for v1 — an org without a key sees only a quiet « Connect Zernio » entry; add the env switch when an operator asks.

## Adaptability: what a second aggregator needs

Example: adding « Ayrshare » (illustrative, not planned).

1. `AggregatorKind` enum: one new value (+ wire name). No DB constraint to widen (the column is validated in code). The enum member and its wire name are the ONLY place outside `Adapters/<Name>/` that names an aggregator, besides i18n display strings supplied by adapter metadata.
2. One new adapter class `Adapters/Ayrshare/AyrshareAdapter.cs` implementing `IAggregatorAdapter`: HTTP calls, JSON mapping, **its own error → `AggregatorErrorCategory` mapping**, `Traits`.
3. Registration: one `AddHttpClient(...)` + `AddScoped<IAggregatorAdapter, AyrshareAdapter>()` line; adapters are resolved by `Kind` from `IEnumerable<IAggregatorAdapter>`.
4. Config: none unless the aggregator needs a base URL override (test fake server) — the same `HttpClient` name pattern as Bluesky's.
5. Front: **nothing structural.** The Integrations page lists aggregators from a `GET …/aggregators` endpoint (kind, display name, key help link, supported platforms) served from adapter metadata; the key drawer, « Importer depuis {name} » drawer and « via {name} » badge are generic and keyed by kind. Only i18n strings for the display name come from the adapter metadata, not new components.
6. **Webhooks (the primary status path, decision A):** one generic route `POST /webhooks/aggregators/{kind}/{connectionId}` (see « Webhook endpoint »). The adapter supplies only `RegisterWebhookAsync` / `UnregisterWebhookAsync` (or `Manual` instructions), `Verify(rawBody, headers, secret)` and `ParseEvent(rawBody)`; dedupe, idempotent apply, safety net and health are generic.
7. **Same port, either route:** the second aggregator and every future native provider implement the same `IPublishProvider` contract behind `RoutingPublishProvider` (aggregator via `IAggregatorAdapter`, native directly); a native provider is NOT an « adapter », it is a sibling of `BlueskyPublishProvider`.
8. **Not needed:** no new table, no change to `publications`, `social_accounts`, the job handler, the composer, validation, or failure-category code. (A second aggregator whose events are not shaped like Zernio's may need `ParseEvent` to normalise them; that stays inside its adapter.)

`AggregatorTraits` exists only to describe what the adapter really needs us to do, filled by the adapter, and has two knobs: `IdempotencyWindow` (Zernio: 24 h; `null` = no idempotency → the generic provider never auto-resends, falls to `NeedsReview`) and `AcceptsBytes` vs `AcceptsPublicUrl` (Zernio: bytes via presign). Status is webhook-driven for every aggregator (decision A), so there is no `StatusVia` knob, and no scheduling knob either (decision C: our scheduler). A second aggregator that does not fit these two knobs will show it then; nothing speculative is added now.

Drift control is a review rule, not a new guard (the repository's bespoke-guard admission rule forbids adding one without proving the admission criteria): reviewers reject any « zernio » identifier or wire string outside `Adapters/Zernio/`, the `AggregatorKind` member and adapter-supplied i18n.

## Path to native (research only, no implementation)

What our own integration would need, per platform Zernio covers, sourced from the platforms' public docs (read 14/11). Items marked *verify* were not stated by the page read and must be confirmed in the platform's App Review / permissions reference before planning. Approval timelines are not published by the platforms and are not estimated here.

| Platform | OAuth / permissions for publishing | Approval | Technical specifics that touch our design |
|---|---|---|---|
| Facebook Pages | Facebook Login; `pages_manage_posts`, `pages_read_engagement`, `pages_manage_engagement`, `pages_read_user_engagement` (video: `publish_video`); a **Page access token**; the user needs the CREATE_CONTENT / MANAGE / MODERATE Page tasks. `pages_show_list` for listing pages (*verify*). [Pages API posts](https://developers.facebook.com/docs/pages-api/posts) | Meta app review for advanced access, with business verification (*verify*: the page only ties « Page Public Content Access » to approval) | Page tokens (long-lived), per-page id = our `external_account_id`; no public URL needed for images (upload) (*verify*) |
| Instagram (professional account) | Instagram Login: `instagram_business_basic`, `instagram_business_content_publish`; or Facebook Login: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`. Account must be an Instagram **professional** account; Page Publishing Authorization may block publishing until done. [Content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing) | Standard or Advanced Access (review process not described on that page, *verify*) | **Image must be at a public URL** (Meta fetches it); 3 calls (container → `media_publish` → status `IN_PROGRESS/FINISHED`, poll ≤ 5 min); JPEG only; carousels up to 20; cap **100 API posts/24 h** (page also says 50 for carousels: *verify*); the native provider needs the public signed media URL and a polling step (same shape as Decision A) |
| LinkedIn | `w_organization_social` (company pages; member must be ADMINISTRATOR / DIRECT_SPONSORED_CONTENT_POSTER / CONTENT_ADMIN), `w_member_social` (personal profile). [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) | The product/program access for these scopes is not described on that page (*verify*: Community Management API access is approval-based) | Versioned API (`Linkedin-Version: YYYYMM` header, versions sunset yearly → upkeep); image/video upload to get an asset URN first; `x-restli-id` header returns the post id; org URN = our `external_account_id` |
| X | OAuth 2.0 user context: `tweet.write`, `tweet.read`, `users.read` (+ `offline.access` for a refresh token). [Create post](https://docs.x.com/x-api/posts/creation-of-a-post) | Developer account/app on a paid tier (pricing and limits not on that page: *verify*); Zernio itself bills X from a balance ($0.015/post, $0.20 with a link) | Quote posts need Enterprise; per-user video limits depend on the account; a paid per-post cost to model |
| TikTok | `video.publish` (direct post) / `video.upload` (draft). [Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started) | **App audit required**: until audited, all content is restricted to private visibility; query creator info before each post | Photos need a **verified-domain URL**; `publish_id` status polling; video-first |
| Others Zernio lists (YouTube, Pinterest, Threads, Reddit, Bluesky…) | Not researched (non-goal) | — | Bluesky/Mastodon/Discord/Pixelfed are already native here |

Cross-cutting needs for any native route: our own app registration per platform, a privacy policy / terms / data-deletion URL and an app-review demo (screencast) per requested permission; OAuth redirect endpoints + `state` handling (we already have `OAuthState` for Mastodon); token refresh jobs and a `NeedsReconnect` path (exists); a public signed media URL endpoint (Instagram, TikTok photos) reachable from the platforms; per-platform rate-limit and daily-quota handling mapped into the same `PublishResult` kinds. The aggregator bridge covers the gap while these reviews run; each approved platform flips independently through « Moving an account to native ».

## Delivery: small vertical PRs

Each slice has a fake aggregator HTTP server (`Fakes/FakeAggregatorServer`, an in-process Kestrel/`HttpMessageHandler` implementing the Zernio subset used) so API specs never call the real Zernio.

Slices are ordered so each one can ship alone: nothing registers a webhook before its endpoint exists, nothing can return a result the job cannot handle, and an enum value never lands before every exhaustive switch handles it.

1. **Port + connection.** `AggregatorKind`, `aggregator_connections` migration, `ICredentialProtector` string-purpose overload, `sk_`/`zrk_` rule in `LastErrorSanitiser`, `IAggregatorAdapter` + `ZernioAdapter.CheckKeyAsync`, connection endpoints under `/aggregators/{kind}/...` (save/test/rotate/delete, **no webhook registration yet**), audit, secret-leak specs, key drawer on Integrations. Tests: fake Zernio server (valid/invalid key, never echoes the key, tenant isolation, permission, sanitiser), vitest drawer, e2e invalid then valid key.
2. **Platforms wired, nothing user-visible (the model and every switch).** Migrations: `social_accounts` (route columns, partial unique index) AND `publications` (`delivery_route`, `aggregator_kind`, `aggregator_connection_id`, `aggregator_post_id` + index). `SocialProvider.Facebook`/`Instagram` **with every exhaustive switch**: `SocialAccountWire.FormatProvider`, `FormatProviderLabel` (used by `PublishValidationService.cs:162` and the job, `:138`), `FormatCredentialType` (`Aggregated`), `ProviderCapabilityRegistry.For` + Facebook/Instagram entries, `PublishTargetService`, `_ProviderName`, `RoutingPublishProvider._For` (aggregator route → the provider of slice 3; a Native route to an aggregator-only platform → `AccountFailure` « no native integration yet »), `RoutingSocialSessionProvider` (explicit aggregated branch, no Bluesky fallthrough), front `SUPPORTED_PROVIDERS` / `toTenantPublishTarget` / `providerLabelKey` / i18n labels and the reconnect-action gating (`tenant-publish-targets.ts:61-66,137-139`, `integrations.tsx:89-99,442-446`). `EnabledAggregatedPlatforms = {}`, so no account can exist yet. Tests: enum-completeness spec (fails if any `SocialProvider` is unmapped in any of these), front tests extended.
3. **Facebook end to end (text).** `EnabledAggregatedPlatforms = {Facebook}`; `ListAccountsAsync`, list/import/re-import (idempotent, concurrent-safe, re-sync recovery sets `Active`), « via Zernio » badge; `AggregatorPublishProvider`, snapshot written from `OnBeforeWrite`, `ReconcileRequest` route fields and the two-session job flow, `PublishResult.ConnectionFailure` + job handling, idempotency + reconcile (`ExpectedText`/`ResendUnderNewKey`), failure table, a non-final answer mapped to `Ambiguous`. An imported account can publish in this same slice. Tests: provider specs per row of the failure table with the fake server (201, 200 replay same text, 200 replay edited text, 207, 401, 403 ×3, 409 ×2, 429, 503, timeout), a route-flip-during-reconcile spec, journal spec, vitest destination appears in the composer, e2e import then publish to a fake Facebook page.
4. **Webhook endpoint + status.** `PUBLIC_API_BASE_URL` in `AppEnvironment`, `EnqueueOptions.Delay` (SQL-computed), `PublishResult.Pending` (main switch AND `_ResolveOpenAttemptAsync` → `Accepted`) + status-service method, generic route, `Verify/ParseEvent`, events table + transactional insert/enqueue, `ApplyAggregatorStatus` with its own terminal-state guard, `aggregator-reconcile` one-shot job, webhook registration at key save (and « Register webhook » for existing connections), health banner. Tests: signed events (valid, bad signature, no secret, duplicate id, enqueue failure rolls back the dedupe row, out-of-order, other tenant's connection, `post.cancelled`), duplicate `published`, parked-then-failed, parked-then-published, the safety net fires once and parks, e2e pending → webhook → published.
5. **Media + Instagram.** Adapter presign upload with the SSRF controls, Facebook `MaxImages` raised to 10, Instagram `RequiresMedia`, `EnabledAggregatedPlatforms += Instagram`. Tests: upload failure paths, `uploadUrl` to a private address/redirect/odd host refused, size/format caps, e2e Instagram image post (fake).
6. **Key removal/invalid states (UI).** Banner, paused publications, update-key path. Tests: vitest + e2e.
7. **(Later) Route switch** — decision F (data model already in slices 2–3; the flow is built when our first native platform is approved).

All decisions A–G are settled (2026-11-17).

Instagram needs one real-image live test by the owner before slice 5 is called done (the issue notes it is untested).

## Security

- The API key is encrypted at rest with the existing Data Protection ring, shown only as `key_hint`, never logged, never in job payloads, error causes, audit entries, OpenAPI examples or the front bundle; `SocialSession` already redacts `AccessJwt`; secret-leak specs are extended.
- Tenant isolation: every query is tenant-scoped (`ITenantEntity`); a test proves tenant A cannot list/import/publish with tenant B's connection or account ids; `aggregator_account_id` is only accepted if it came from the tenant's own `ListAccounts` result (re-validated on import).
- SSRF: the adapter talks only to a fixed base URL from code (no user-supplied host, unlike Mastodon). URLs returned by the aggregator are untrusted: `platformPostUrl` is stored as data and validated as `https` before display; the presign `uploadUrl` is checked as in « Publish » step 2 (https, no credentials, public-address check with the repo's `MastodonHostGuard`, redirects disabled, host allow-list, size cap).
- Webhook endpoint: see « Webhook endpoint » below; unauthenticated by design, protected by the per-connection HMAC secret, constant-time comparison, fail closed, rate limit, event-id dedupe, and tenant resolved only through the connection the signature validated against.
- Rate limits: honour `Retry-After` and `X-RateLimit-*`; the per-org Zernio limit (60 req/min with ≤ 2 accounts) is shared between import and publish; the status path makes no periodic calls, which is the point of decision A.
- Logging: provider failures log category + status code, never request bodies containing content with keys, never the `Authorization` header.
- Kill switch: deleting the connection stops all aggregated publishing for that organisation immediately.
