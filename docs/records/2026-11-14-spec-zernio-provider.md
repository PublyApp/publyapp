# #2343 — Publishing through an aggregator (Zernio first), bring-your-own-key (spec)

Date: 2026-11-14 · Issue: #2343 · Status: draft for owner decisions

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
- `GET /v1/posts/{id}` for polling; keep polling while `publishing`/`scheduled`; a TikTok entry can stay `publishing` up to 48 h — [post lifecycle](https://docs.zernio.com/guides/post-lifecycle).
- `errorCategory`: `auth_expired, user_content, user_abuse, platform_rate_limit, quota_exhausted, account_issue, platform_rejected, platform_error, system_error, unknown`; `errorSource`: `user | platform | system` — same page. `POST /v1/posts/{id}/retry` reruns failed platforms — [error handling](https://docs.zernio.com/guides/error-handling).
- Rate limits: 60 req/min up to 2 connected accounts, 600 for 3–2000; headers `X-RateLimit-*`, `Retry-After` on 429 — [rate limits](https://docs.zernio.com/guides/rate-limits).
- Media: `POST /v1/media/presign {filename, contentType, size?}` → `{uploadUrl, publicUrl, key, expiresIn: 3600}`; `PUT` bytes to `uploadUrl` (no Authorization); `publicUrl` expires after 7 days unless used by a post (then copied to permanent storage); images JPEG/PNG/GIF/WebP; presign accepts up to 5 GB — [media uploads](https://docs.zernio.com/guides/media-uploads).
- Webhooks: `POST /v1/webhooks/settings {name,url,events,secret}`; events `post.published, post.partial, post.failed, post.cancelled, post.platform.published, post.platform.failed…`; header `X-Zernio-Signature` = lowercase hex HMAC-SHA256 of the raw body (no timestamp); event `id` stable across retries (dedupe on it); respond 2xx within 5 s; up to 7 attempts over ~51 h, then dead-letter; endpoint disabled after 3 days of failures — [webhooks](https://docs.zernio.com/webhooks), [post events](https://docs.zernio.com/webhooks/posts). The exact post payload fields could not be confirmed from the docs pages read (open item for the webhook slice).
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
    Task<AggregatorPostResult> GetPostAsync(string apiKey, string postId, CancellationToken ct); // reconcile + polling
    ProviderCapability Narrow(ProviderCapability platformBaseline);              // may only NARROW the platform limits
    AggregatorTraits Traits { get; }                   // see Adaptability
    // webhook slice only: WebhookVerifyResult Verify(rawBody, headers, secret), ParseEvent(rawBody)
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

`ProviderCapabilityRegistry` stays the single source, keyed by platform. `Facebook` and `Instagram` entries hold what the **platform** accepts, identical for native and aggregated accounts, so the composer behaves the same before and after a route change. The aggregator adapter exposes `Narrow(baseline)`: it may only **reduce** limits (e.g. a smaller image cap, a format it cannot send) and never widen them; the resolved capability is `adapter.Narrow(registry baseline)` for aggregated accounts and the baseline itself for native ones. One spec asserts `Narrow` output ⊆ baseline for every platform the adapter enables.

### Data model (expand-only migrations)

1. `aggregator_connections` (new): `id, tenant_id, aggregator_kind (int, check in known values), protected_api_key (Data Protection, purpose "aggregator-<kind>-v1"), key_hint (last 4 chars, plain, for display), protected_webhook_secret (null until webhook slice), status (Active | Invalid), last_checked_at, last_error, + BaseAttributes`. Unique `(tenant_id, aggregator_kind)` where not deleted. One key per organisation per aggregator kind; a second aggregator later is another row, no schema change.
2. `social_accounts` (add columns): `delivery_route int not null default 0` (`Native = 0`, `Aggregator = 1`; every existing row is Native), `aggregator_kind int null`, `aggregator_account_id text null`; check: `delivery_route = 1` requires both aggregator columns. **The aggregator columns are not cleared when an account moves to native**: they become a read-only « previously via X » link (history/audit, and a possible way back). New `SocialCredentialType.Aggregated = 3`. `protected_credentials` is NOT NULL today: an aggregated-only account stores an empty protected value (relaxing to nullable is also expand-safe and preferable; the implementation PR decides). The unique index `(tenant, provider, external_account_id)` stays.
3. `publications` (add nullable): `delivery_route int null` and `aggregator_kind int null` (snapshot of the route that carried THIS publication, set when it is sent; null on rows before this feature = native), `aggregator_post_id text null` (polling/reconcile). `external_record_id` / `external_url` already carry the platform post id / URL. The snapshot keeps « sent via Zernio » truthful in History after the account moved to native, and makes reconcile ask the route that actually wrote. No per-platform table: one aggregator post per publication (one platform each), so per-destination status stays our `Publication` row.
4. Enums stored numerically; new check-constraint values are added by a new constraint (`CK_SocialAccount_*`, provider check if any) in the same expand step. No column is dropped or retyped. Contract (cleanup) migrations are not part of this work.

### Key handling

`ICredentialProtector` gets a string-purpose overload; the key is encrypted at write, decrypted only inside `AggregatorKeyStore.GetAsync(tenantId, kind)` for the duration of a call, never put in `SocialSession.ToString`, logs, job payloads, error causes or API responses (API returns `key_hint` only). The existing `SocialAccountSecretLeak`-style spec is extended to cover it.

### Session / request plumbing

`RoutingSocialSessionProvider` gets one branch: account with `delivery_route = Aggregator` → opens `SocialSession(Did: aggregator_account_id, Handle: display_handle, AccessJwt: <org key>, PdsHost: "")` (the lazy option: no new session type; `AccessJwt` is already redacted everywhere). If the connection is missing/Invalid → `SocialSessionResult.AccountFailure("the Zernio key is missing or was rejected; update it in Integrations")`, which the job already turns into a paused publication + `Reconnect`. `PublishRequest` gains optional `DeliveryRoute` + `AggregatorKind?` (set by the job from the account, and also written to the publication snapshot). A dedicated session type is the upgrade path if a second aggregator needs more than id + key.

## Flows

### Save / test / rotate / remove the key (Integrations page, drawer)

- Endpoint `PUT /tenants/{t}/aggregators/{kind}/connection {apiKey}`: adapter `CheckKeyAsync` (calls `GET /v1/accounts` with the key, never stored before it works) → encrypt → upsert row; audit log (`aggregator.connection.saved`, no key). Invalid key → 400 with the adapter's cause (« Zernio refused this key »).
- `POST …/connection/test`: re-checks; updates `status`/`last_checked_at`.
- Rotate = PUT again (same flow). Accounts keep working; failed publications can be retried.
- `DELETE …/connection`: deletes the encrypted key; accounts routed through it become `NeedsReconnect` with `last_error` « Zernio key removed »; queued publications fail through the normal `AccountFailure` path with category `Reconnect`; no publication or history is deleted.
- Permission: same social-accounts manage permission; feature entirely absent from the UI until the operator has not disabled it (reuse `ProviderAvailability` idea with an aggregator kind list, see Open decision 6).
- Key invalid at publish time (401): connection flagged `Invalid`, banner on Integrations, publication paused `Reconnect`.

### « Importer depuis Zernio »

Generic UI label from the adapter's display name (« Importer depuis {aggregator} »), parameterised by kind.

1. `GET …/aggregators/{kind}/accounts` → adapter `ListAccountsAsync` → rows `{aggregatorAccountId, provider, handle, avatar?, alreadyImported}`; platforms we cannot publish to (not in the enabled list) are returned `unsupported` and shown disabled with a reason.
2. User ticks accounts in a drawer → `POST …/import {ids[]}` → one `social_accounts` row per id (`provider` from the platform, `aggregator_kind`, `aggregator_account_id`, `credential_type = Aggregated`, status Active). Badge « via Zernio » in the list.
3. Re-import is idempotent: existing `(tenant, kind, aggregator_account_id)` rows are refreshed (handle) not duplicated.
4. Account removed/disconnected on the aggregator side: re-import flags imported accounts missing from the list `NeedsReconnect` (« no longer listed by Zernio »); a publish answering `ACCOUNT_DISCONNECTED` does the same. Nothing is deleted.
5. A listed account that matches an existing native account (same provider + handle): offered as « switch this account to Zernio » (see Moving) instead of creating a duplicate.
6. Cost note in the drawer: « Zernio bills accounts beyond the free 2 on your own plan. »

### Publish

Unchanged up to `PublishPublicationJobHandler`. For an aggregated account:

1. Session opened as above (key).
2. Media: images already fitted by `ImageDerivative` to the account capability, uploaded through the media path chosen in Decision B.
3. `AggregatorPublishProvider` calls adapter `PublishAsync` with `{apiKey, aggregatorAccountId, platform, content, media, idempotencyKey = request.IdempotencyKey}`. Zernio adapter: `POST /v1/posts` with `Idempotency-Key = <our key>`, `publishNow: true`, one platform entry. `OnBeforeWrite` is called right before the POST (ambiguity journal as today).
4. Result mapping: `201`/`200` with platform `published` → `PublishResult.Published(platformPostId, platformPostUrl)` (a `200` replay is `AlreadyExistsTreatedAsPublished`); `207`/platform `failed` → classified failure (below); platform `pending/processing`/post `publishing`/`scheduled` → `Pending`: store `aggregator_post_id`, job re-enqueues itself (delayed) to poll (Decision A).
5. Timeouts / `503` after the write started → `Ambiguous`. Reconcile: resending with the same `Idempotency-Key` inside Zernio's 24 h window is safe (`200` original, or `409 idempotency_conflict` → transient, retry after `Retry-After`); `ReconcileRequest.FirstAttemptAtUtc` decides: < 24 h → `SafeToResend`, otherwise `NeedsReview` (we never resend blind).
6. `409` with `existingPostId` (content-hash dedup: same text to the same account within 24 h) → `ContentFailure("this exact post was already sent to this account in the last 24 hours")`, unless `existingPostId` equals our stored `aggregator_post_id` (then it is ours: treat as published).
7. `429` → `TransientFailure(RetryAfter from header)`; connection errors before the write → `TransientFailure`.

Segments/threads: none (capability says no). `SetPublicationRendition` overrides keep working because content comes from the rendition.

### Status tracking

See Decision A. Our publication states stay unchanged (`Scheduled/InProgress/Published/Failed/Paused`); the adapter's raw status is not exposed to the UI. « Pending at the aggregator » is `InProgress` with a polling job; a final `failed` becomes `Failed` with category and cause; `partial` cannot occur with one platform per post.

### Limits advertised to the composer

`ProviderCapabilityRegistry` gets entries for `Facebook` and `Instagram` (code table, same place as today) holding the PLATFORM limits (see « Capabilities belong to the platform »). Starting values from the docs read: Facebook `Utf16` 63,206, 10 images, 4 MB (conservative: Facebook « often rejects » larger), JPEG/PNG/GIF, threads off; Instagram `Utf16` 2,200, up to 20 carousel images ([Meta](https://developers.facebook.com/docs/instagram-platform/content-publishing)), JPEG only (Meta; Zernio also lists PNG at 8 MB, and `ImageDerivative` already converts, so the baseline says JPEG), `RequiresMedia = true`, `RequiresText = false`, threads off. The Zernio adapter's `Narrow` starts as the identity and only subtracts when a real refusal proves it. `GetPublishTargetsForTenant` and the front need no change except labels/badge: limits already flow per destination.

### Failure categories (mapping lives in the Zernio adapter)

| Zernio signal | Our `PublishResult` | `PublicationFailureCategory` |
|---|---|---|
| HTTP 401 / `invalid_credentials` (key) | AccountFailure « Zernio key rejected » + connection `Invalid` | Reconnect |
| 403 `ACCOUNT_DISCONNECTED`, `ACCOUNT_NOT_ENABLED_FOR_POSTING`; `auth_expired`; `account_issue` | AccountFailure (cause from `errorMessage`) | Reconnect |
| 403 `PROFILE_OVER_LIMIT` (plan limit) | AccountFailure « your Zernio plan limit was reached » | Reconnect (user acts on Zernio) |
| 400 validation; `user_content`; `platform_rejected` | ContentFailure (cause from `errorMessage`) | FixContent |
| 409 content-hash duplicate | ContentFailure (duplicate cause) | FixContent |
| 409 `idempotency_conflict`; 429; `platform_rate_limit`; `quota_exhausted`; `user_abuse`; `platform_error`; `system_error`; 5xx before write | TransientFailure (+ `Retry-After`) | RetryLater after retries |
| 503 / timeout after the write started | Ambiguous | NeedsReview if reconcile is impossible |
| `unknown`, unreadable body | TransientFailure / ContentFailure with the sanitised `errorMessage` | Unknown |

All causes pass `LastErrorSanitiser` and never contain the key; if Zernio gives no message the category's generic sentence is used (`CauseOrGeneric`).

## Moving an account to native (when our own app is approved)

Goal: the account row, its history, publications, analytics and composer behaviour stay; only the route and credentials change.

1. **Trigger.** On an aggregated account whose platform has a native provider enabled (`ProviderAvailability`), Integrations shows « Connect directly » (drawer).
2. **Native OAuth** (platform-specific, in the future native provider): the user authorises OUR app and picks the page/account; the callback returns the platform account id and tokens.
3. **Match by platform account id.** Look up `(tenant, provider, external_account_id)`: found → this is the same account, reuse the row (reuse the existing `ReconnectSocialAccountForTenant` path, which already swaps credentials on an existing row); not found → a new account row is created and nothing is merged (the user is told why: « this is a different account than the one imported from Zernio »). A page the user did not previously have via the aggregator simply becomes a normal native account.
4. **Flip in one transaction:** `protected_credentials` = the native tokens (Data Protection purpose of the platform), `credential_type = OAuth`, `delivery_route = Native`, `status = Active`, `last_error = null`. **`aggregator_kind` and `aggregator_account_id` are kept** as a read-only link (shown as « previously published via Zernio »; never used to publish while the route is Native).
5. **History is untouched.** Publications keep `social_account_id`; their `delivery_route`/`aggregator_kind` snapshot still says « via Zernio » for old ones and « native » for new ones. Analytics, calendar, project visibility and `capability_overrides` hang on the account row, so they carry over. The composer reads capabilities by platform (unchanged), so nothing the user sees about limits changes.
6. **In-flight work.** Scheduled publications are routed at publish time from the account's CURRENT route (so they leave natively after the flip). An `Ambiguous` publication reconciles through its OWN snapshotted route (it was written by the aggregator; the aggregator key must still exist, otherwise it falls to `NeedsReview` with a clear cause). Pausing aggregated publishing for the few seconds of the flip is not needed.
7. **Way back / cleanup.** Reverting to the bridge is the same flip in reverse as long as the aggregator connection is still valid. Once all accounts of a connection are native, the owner deletes the key (« Remove Zernio key ») with no effect on history. An optional later contract migration can drop the retained aggregator link; it is not needed now.
8. **Audit.** `social_account.route_changed` (from, to, actor) in the audit log; no token in the entry.

## Open decisions for the owner

### A. Status: webhooks or polling?

- **What it decides:** how we learn the final result when the answer to `POST /v1/posts` is not final (`publishing`/`scheduled`, e.g. a slow Instagram media step) or when Zernio later marks a post failed.
- **Option 1 — polling `GET /v1/posts/{id}`** from a delayed job (e.g. +10 s, +1 min, +5 min, then stop and mark `NeedsReview`). Pro: no public endpoint, no per-tenant secrets, works on localhost/dev and in the fake-server tests, uses the job engine we already have. Con: 1–3 extra calls per post (cheap vs 600/min), slightly delayed result.
- **Option 2 — webhooks** (`post.platform.published/failed`). Pro: instant, no polling load, catches late failures. Con: a public endpoint per org (BYOK means each org's key registers its own webhook), a secret per connection, signature without timestamp (replay protection = dedupe on event `id`), Zernio can disable the endpoint after 3 days of failures, harder to test locally.
- **Example:** an Instagram carousel is accepted at 10:00:00 as `processing`. Polling sees `published` at 10:00:10 and stores the URL. With webhooks we get the event at 10:00:06 but lose it if our endpoint was down more than ~51 h.
- **Recommendation:** polling in v1 (synchronous `publishNow` already answers final for the common case). Build the webhook endpoint later as its own slice only if polling proves insufficient; the port already reserves `Verify/ParseEvent`.

### B. Media: Zernio presign upload or our storage URLs?

- **What it decides:** how images reach Zernio.
- **Option 1 — presign** (`POST /v1/media/presign`, `PUT` bytes, use `publicUrl`). Pro: our storage stays private (it is not publicly readable today), no new exposure, we already hold the bytes in the job (same as Bluesky/Mastodon upload). Con: one more round trip per image; presigned URL lives 1 h (fine, we upload right before posting); Zernio-specific, so the neutral port is « adapter receives bytes and decides » (a second aggregator that takes URLs would need its own upload).
- **Option 2 — our URLs**: make a signed public URL of our blob. Pro: no upload step. Con: needs a new public, signed, expiring media endpoint (security surface, SSRF-adjacent, CDN/tunnel concerns, hotlink/expiry races on retries).
- **Example:** a 3-image Facebook post: option 1 = 3 presigns + 3 PUTs + 1 post; option 2 = sign 3 URLs + 1 post, but Zernio must be able to reach our server within seconds.
- **Native note (« Path to native »):** Meta's Instagram API fetches the image itself from a **public URL**, so a future native Instagram route will need a public, expiring media URL anyway. That is a native-route concern; it does not change the recommendation for the bridge.
- **Recommendation:** presign (option 1), inside the adapter. The port passes bytes (as providers already receive them), so Decision B is invisible to the domain.

### C. Where does scheduling happen: our scheduler or Zernio's `scheduledFor`?

- **Option 1 — our scheduler** (`DispatchDuePostsJob`) fires at the due time and sends `publishNow`. Pro: one state machine, edit/cancel/reschedule work as for native accounts, aggregator-agnostic, nothing to reconcile. Con: depends on our worker being up at the due minute.
- **Option 2 — send `scheduledFor` to Zernio.** Pro: Zernio publishes even if we are down. Con: two sources of truth; editing/cancelling must call Zernio and can race; every aggregator has different semantics.
- **Example:** post scheduled for 18:00, user edits the text at 17:55: option 1 changes our row; option 2 must update the remote post and handle « already publishing ».
- **Recommendation:** option 1 (our scheduler, `publishNow`). Revisit only if worker uptime becomes a real problem.

### D. Which platforms first?

- **Option 1:** Facebook pages + Instagram only (what the live test covers; clear docs limits). **Option 2:** every platform Zernio lists (16+).
- **Trade-off:** each extra platform needs limits, media rules, error nuances and QA; Instagram alone already adds `RequiresMedia`.
- **Recommendation:** Facebook pages + Instagram. Other platforms appear in the import list as « not supported yet » (disabled), enabled one registry entry at a time.

### E. One aggregator post per publication, or one post for several accounts?

- **Option 1 — one Zernio post per publication** (our unit): clean per-destination status/URL/failure, simple idempotency key = publication id. Con: N calls for N destinations; content-hash dedup (24 h) can collide when the same text goes to the same account twice.
- **Option 2 — one post with several platform entries** (as in the live test): fewer calls; but one key for several of our publications and partial results to split.
- **Example:** same text to 2 Facebook pages: option 1 = 2 posts, 2 keys; option 2 = 1 post, `partial` possible.
- **Recommendation:** option 1.

### F. Native ↔ aggregator switching: build the endpoint now or later?

- **Option 1 — model-ready now, UI/endpoint when our first native platform is approved.** The columns (`delivery_route`, retained aggregator link, publication snapshot) ship in slice 2, so no later migration of the core model is needed. **Option 2 — build the whole « Connect natively » flow now.** It cannot work before a native integration exists, so it would be dead code.
- **Recommendation:** option 1. The flow is fully specified in « Moving an account to native » below so the first native PR only implements it.

### G. Operator switch and who sees the feature

- **Option 1:** reuse the `DISABLED_PUBLISH_PROVIDERS` idea with a sibling `DISABLED_AGGREGATORS` env (default: enabled). **Option 2:** no switch (the feature is invisible without a key anyway).
- **Recommendation:** option 2 for v1 — an org without a key sees only a quiet « Connect Zernio » entry; add the env switch when an operator asks.

## Adaptability: what a second aggregator needs

Example: adding « Ayrshare » (illustrative, not planned).

1. `AggregatorKind` enum: one new value (+ wire name). Check constraint on `aggregator_kind` is widened in an expand migration (a constant, no table change).
2. One new adapter class `Adapters/Ayrshare/AyrshareAdapter.cs` implementing `IAggregatorAdapter`: HTTP calls, JSON mapping, **its own error → `AggregatorErrorCategory` mapping**, its own `CapabilityFor(platform)`, `Traits`.
3. Registration: one `AddHttpClient(...)` + `AddScoped<IAggregatorAdapter, AyrshareAdapter>()` line; adapters are resolved by `Kind` from `IEnumerable<IAggregatorAdapter>`.
4. Config: none unless the aggregator needs a base URL override (test fake server) — the same `HttpClient` name pattern as Bluesky's.
5. Front: **nothing structural.** The Integrations page lists aggregators from a `GET …/aggregators` endpoint (kind, display name, key help link, supported platforms) served from adapter metadata; the key drawer, « Importer depuis {name} » drawer and « via {name} » badge are generic and keyed by kind. Only i18n strings for the display name come from the adapter metadata, not new components.
6. Webhooks (only if the adapter wants them): endpoint is `POST /webhooks/aggregators/{kind}/{connectionId}`; the generic controller loads the connection, calls `adapter.Verify(...)` with that connection's secret, dedupes on the event id, then `adapter.ParseEvent` → the same internal « post status changed » command that polling uses.
7. **Same port, either route:** the second aggregator and every future native provider implement the same `IPublishProvider` contract behind `RoutingPublishProvider` (aggregator via `IAggregatorAdapter`, native directly); a native provider is NOT an « adapter », it is a sibling of `BlueskyPublishProvider`.
8. **Not needed:** no new table, no change to `publications`, `social_accounts`, the job handler, the composer, validation, or failure-category code.

`AggregatorTraits` exists only to describe what the adapter really needs us to do, filled by the adapter: `StatusVia` (`Synchronous | Polling | Webhook | Both`), `IdempotencyWindow` (Zernio: 24 h; `null` = no idempotency → the generic provider never auto-resends, falls to `NeedsReview`), `AcceptsBytes` vs `AcceptsPublicUrl` (Zernio: bytes via presign), `SupportsSchedulingRemotely` (informational; unused in v1, Decision C). If a second aggregator does not fit these four knobs we will see it then; we add nothing speculative now.

Guard against drift: an architecture spec fails the build if any type outside `Aggregators/Adapters/Zernio/` contains « zernio » (case-insensitive) in code identifiers or wire strings — the same style as the existing status-writer architecture guard. (i18n copy like « via Zernio » comes from adapter metadata, not literals in the front.)

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

1. **Port + connection (buildable now).** `AggregatorKind`, `aggregator_connections` migration, `ICredentialProtector` overload, `IAggregatorAdapter` + `ZernioAdapter.CheckKeyAsync`, connection endpoints (save/test/rotate/delete), audit, secret-leak spec, drawer on Integrations (key field, status, hint). Tests: API specs (fake server: valid/invalid key, never echoes key, tenant isolation, permission), vitest drawer, e2e « save an invalid then a valid key ».
2. **Import accounts (buildable now).** `social_accounts` route columns migration, `SocialProvider.Facebook/Instagram`, `ListAccountsAsync`, list/import/re-import endpoints, « via Zernio » badge, removed-on-Zernio handling. Tests: specs incl. idempotent re-import and unsupported platforms, vitest import drawer, e2e import.
3. **Publish text (Facebook).** `AggregatorPublishProvider`, routing, session branch, `publications.aggregator_post_id`, idempotency + reconcile, failure mapping table, capability entries. Tests: provider specs per row of the mapping table with the fake server (201, 200 replay, 207, 401, 403, 409 both kinds, 429, 503 ambiguous, timeout), job handler spec with the fake, e2e publish to a fake Facebook page.
4. **Media + Instagram.** Adapter presign upload, `RequiresMedia`, image fitting. Tests: upload failure paths, size/format caps, e2e Instagram image post (fake).
5. **Status polling.** `Pending` result → delayed poll job; terminal mapping. Tests: fake returns `processing` then `published`/`failed`.
6. **Key removal/invalid states (UI).** Banner, paused publications, reconnect path. Tests: vitest + e2e.
7. **(Optional, later) Webhook endpoint** — Decision A. **(Optional, later) Route switch** — Decision F.

Buildable before the owner answers: slices 1 and 2, and slice 3 for Facebook text (decisions A–D only change slices 4–7; the recommendations are the defaults).

Instagram needs one real-image live test by the owner before slice 4 is called done (the issue notes it is untested).

## Security

- The API key is encrypted at rest with the existing Data Protection ring, shown only as `key_hint`, never logged, never in job payloads, error causes, audit entries, OpenAPI examples or the front bundle; `SocialSession` already redacts `AccessJwt`; secret-leak specs are extended.
- Tenant isolation: every query is tenant-scoped (`ITenantEntity`); a test proves tenant A cannot list/import/publish with tenant B's connection or account ids; `aggregator_account_id` is only accepted if it came from the tenant's own `ListAccounts` result (re-validated on import).
- SSRF: the adapter talks only to a fixed base URL from code (no user-supplied host, unlike Mastodon); URLs returned by the aggregator (`platformPostUrl`) are stored as data and validated as `https` before display/link; presign `uploadUrl` is requested only from the fixed base URL's response and checked to be `https`.
- Webhook (when built): verify `X-Zernio-Signature` = HMAC-SHA256 over the **raw** body with a per-connection secret using a constant-time comparison; refuse (fail closed) when no secret is configured; respond within 5 s and process in a job; dedupe on event `id` (no timestamp in the signature, so replay protection is the dedupe); the endpoint is unauthenticated by design but rate-limited and resolves tenant only through the signed connection id.
- Rate limits: honour `Retry-After` and `X-RateLimit-*`; the per-org Zernio limit (60 req/min with ≤ 2 accounts) is shared between import, publish and polling, so polling backs off.
- Logging: provider failures log category + status code, never request bodies containing content with keys, never the `Authorization` header.
- Kill switch: deleting the connection stops all aggregated publishing for that organisation immediately.
