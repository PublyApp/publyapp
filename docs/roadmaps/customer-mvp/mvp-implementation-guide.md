# PublyApp — LinkedIn Scheduler MVP Implementation Guide (Solo Developer)

This is a step-by-step guide to build the LinkedIn-only social scheduler MVP in ~10 weeks using the existing PublyApp codebase.

Targets:
- **Backend**: .NET 9, EF Core 9, PostgreSQL, Hangfire
- **Frontend**: React + Vite
- **Scope**: LinkedIn OAuth, compose text + single image, schedule, publish via background jobs, queue/history UI

---

## 1. Pre-Implementation Setup (Week 0)

### Development environment checklist
- [ ] Install .NET 9 SDK
- [ ] Node.js 20+ and PNPM 9+
- [ ] Docker Desktop (or equivalent)
- [ ] PostgreSQL (via docker compose below)
- [ ] Kiota CLI for client generation: `dotnet tool install -g Microsoft.OpenApi.Kiota`
- [ ] Optional image tools for local validation: `ffprobe` (via ffmpeg) if desired; not required

### LinkedIn Developer account setup
1) Create a LinkedIn Developer app in your LinkedIn account.
2) Set OAuth 2.0 settings:
   - Authorized redirect URL(s): `https://<front-domain>/linkedin/callback` and a local dev URL like `http://localhost:5050/linkedin/callback` (front will relay to API), or directly `http://localhost:5000/tenant/social-accounts/linkedin/callback` if you callback to API.
3) Request scopes for posting:
   - `w_member_social` (post as a member)
   - `w_organization_social` (optional; required if posting on Pages you manage)
   - You may also use `r_liteprofile` to get display info if needed.
4) Note your Client ID and Client Secret.

### Local database setup (PostgreSQL)
Use the provided compose file.

```bash
docker compose -f docker-compose.services.yml up -d
```

Local connection string example (mapped 5454 → 5432):

```text
Host=localhost;Port=5454;Database=publyapp_db;Username=postgres;Password=password;Pooling=true;
```

### Object storage (single-image)
You need S3-compatible storage. Options:
- Local: MinIO via Docker (recommended for dev)
  ```bash
  docker run -d --name minio -p 9000:9000 -p 9001:9001 \
    -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
    -v "${PWD}/.data/minio":/data minio/minio server /data --console-address ":9001"
  ```
- Cloud: AWS S3, Cloudflare R2, Wasabi (configure with endpoint + keys)

Required bucket: `publyapp-media` (create locally via MinIO console at `http://localhost:9001`).

### Repository branch strategy for MVP
- [ ] Branch off `develop` → `feature/mvp-social`
- [ ] Create weekly feature branches off it (e.g., `feature/week-01-entities-oauth`)
- [ ] Open PRs into `feature/mvp-social`, then one final PR into `develop`

Environment variables (dev examples):
- API
  - `POSTGRES_CONNECTION_STRING` (see above)
  - `FRONT_URL` (e.g., `http://localhost:5050`)
  - `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
  - `S3_ENDPOINT` (e.g., `http://localhost:9000`), `S3_BUCKET=publyapp-media`
  - `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_USE_SSL=false`
  - `DATAPROTECTION_KEYS_DIR=./.data/dp-keys` (dev filesystem persistence)

---

## 2. Week-by-Week Implementation Plan

### Week 1: Entities and DbContext wiring
**Objectives**: Add EF entities for social posting, wire DbContext, run initial migrations.

**Tasks**:
1. Create tenant-scoped entities: `SocialAccount`, `SocialPost`, `Schedule`, `PublishJob`, `MediaAsset`.
2. Add `DbSet<>` to `MainApiDbContext` and ensure tenant query filters apply.
3. Create and apply EF migration.

**Implementation Details**
- Files to create:
  - `apps/api/Src/Features/Tenant/Social/Entities/SocialAccount.cs`
  - `apps/api/Src/Features/Tenant/Social/Entities/SocialPost.cs`
  - `apps/api/Src/Features/Tenant/Social/Entities/Schedule.cs`
  - `apps/api/Src/Features/Tenant/Social/Entities/PublishJob.cs`
  - `apps/api/Src/Features/Tenant/Social/Entities/MediaAsset.cs`
- Modify:
  - `apps/api/Src/Data/DbContext/MainApiDbContext.cs` → add `DbSet` properties

Entity shapes (pseudocode):

```csharp
// apps/api/Src/Features/Tenant/Social/Entities/SocialAccount.cs
public sealed class SocialAccount : ITenantEntity {
  public Guid Id { get; set; }
  public Guid TenantId { get; set; }
  public string Provider { get; set; } = "linkedin";
  public string ExternalAccountId { get; set; } = string.Empty; // member id or org id
  public string Name { get; set; } = string.Empty;
  public string TokenEnc { get; set; } = string.Empty; // encrypted
  public string? RefreshTokenEnc { get; set; }
  public DateTimeOffset? ExpiresAt { get; set; }
  public string Scopes { get; set; } = string.Empty;
  public string Status { get; set; } = "active";
  // audit fields if present in base attributes
}

// apps/api/Src/Features/Tenant/Social/Entities/SocialPost.cs
public sealed class SocialPost : ITenantEntity {
  public Guid Id { get; set; }
  public Guid TenantId { get; set; }
  public string Body { get; set; } = string.Empty; // 2k cap enforced in validation
  public string Status { get; set; } = "draft"; // draft|scheduled|published|failed
  public Guid? MediaAssetId { get; set; }
  public MediaAsset? MediaAsset { get; set; }
  public string? LastPublishUrl { get; set; }
}

// apps/api/Src/Features/Tenant/Social/Entities/Schedule.cs
public sealed class Schedule : ITenantEntity {
  public Guid Id { get; set; }
  public Guid TenantId { get; set; }
  public Guid PostId { get; set; }
  public SocialPost? Post { get; set; }
  public Guid AccountId { get; set; }
  public SocialAccount? Account { get; set; }
  public DateTimeOffset ScheduledAtUtc { get; set; }
  public string TimeZone { get; set; } = "UTC"; // IANA id
  public string Status { get; set; } = "scheduled"; // scheduled|publishing|published|failed|canceled
}

// apps/api/Src/Features/Tenant/Social/Entities/PublishJob.cs
public sealed class PublishJob {
  public Guid Id { get; set; }
  public Guid ScheduleId { get; set; }
  public int Attempt { get; set; }
  public string Status { get; set; } = "enqueued"; // enqueued|success|failed
  public string? ErrorCode { get; set; }
  public string? ErrorMessage { get; set; }
  public string? ExternalPostId { get; set; }
  public string? ExternalUrl { get; set; }
  public DateTimeOffset? PublishedAt { get; set; }
}

// apps/api/Src/Features/Tenant/Social/Entities/MediaAsset.cs
public sealed class MediaAsset : ITenantEntity {
  public Guid Id { get; set; }
  public Guid TenantId { get; set; }
  public string StorageKey { get; set; } = string.Empty;
  public string MimeType { get; set; } = string.Empty; // image/*
  public long SizeBytes { get; set; }
  public int Width { get; set; }
  public int Height { get; set; }
}
```

DbContext additions:

```csharp
// apps/api/Src/Data/DbContext/MainApiDbContext.cs
public DbSet<SocialAccount> SocialAccounts => Set<SocialAccount>();
public DbSet<SocialPost> SocialPosts => Set<SocialPost>();
public DbSet<Schedule> Schedules => Set<Schedule>();
public DbSet<PublishJob> PublishJobs => Set<PublishJob>();
public DbSet<MediaAsset> MediaAssets => Set<MediaAsset>();
```

EF migrations:

```bash
cd apps/api
pnpm migrate:add AddSocialEntities
pnpm migrate:apply
```

Acceptance Criteria
- [ ] New tables created in PostgreSQL.
- [ ] `DbContext` compiles; tenant filters apply to tenant entities.

Potential Blockers
- Missing EF tools: install `dotnet-ef` globally: `dotnet tool install -g dotnet-ef`.
- Npgsql type issues: ensure `Npgsql.EntityFrameworkCore.PostgreSQL` references are up to date.

Dependencies
- Existing tenant infrastructure in the codebase.

---

### Week 2: Data Protection + LinkedIn OAuth skeleton
**Objectives**: Persist Data Protection keys; implement LinkedIn connect/callback; store encrypted tokens.

**Tasks**:
1. Configure Data Protection to persist keys (filesystem for dev).
2. Create LinkedIn OAuth endpoints: start connect, handle callback.
3. Store access/refresh tokens encrypted in `SocialAccount`.

**Implementation Details**
- Modify `apps/api/Program.cs` to add Data Protection:

```csharp
builder.Services.AddDataProtection()
  .PersistKeysToFileSystem(new DirectoryInfo(Environment.GetEnvironmentVariable("DATAPROTECTION_KEYS_DIR") ?? ".data/dp-keys"))
  .SetApplicationName("PublyApp");
```

- Create OAuth service and endpoints:
  - `apps/api/Src/Features/Tenant/Social/OAuth/LinkedInOAuthService.cs`
  - `apps/api/Src/Features/Tenant/Social/OAuth/LinkedInOAuthEndpoints.cs`

LinkedIn endpoints (signatures):
- `POST /tenant/social-accounts/linkedin/connect` → returns `authorizationUrl` and a CSRF `state` (persist state server-side or sign it)
- `GET /tenant/social-accounts/linkedin/callback?code&state` → exchanges `code` for tokens; creates/updates `SocialAccount`

Pseudo-implementation:

```csharp
public sealed class LinkedInOAuthService {
  private readonly IDataProtector _protector;
  private readonly HttpClient _http;
  public LinkedInOAuthService(IDataProtectionProvider dp, IHttpClientFactory http) {
    _protector = dp.CreateProtector("linkedin-oauth");
    _http = http.CreateClient("linkedin");
  }

  public (string url, string state) BuildAuthorizationUrl(string redirectUri, IEnumerable<string> scopes) { /* sign state, return URL */ }
  public async Task<(string accessToken, string? refreshToken, DateTimeOffset? expiresAt)> ExchangeCodeAsync(string code, string redirectUri) { /* POST accessToken */ }
  public string Protect(string value) => _protector.Protect(value);
  public string Unprotect(string value) => _protector.Unprotect(value);
}
```

HTTP details:
- Authorization URL: `https://www.linkedin.com/oauth/v2/authorization`
  - `response_type=code&client_id=...&redirect_uri=...&scope=w_member_social%20w_organization_social&state=...`
- Token URL: `https://www.linkedin.com/oauth/v2/accessToken`
  - `grant_type=authorization_code&code=...&redirect_uri=...&client_id=...&client_secret=...`

EF: none this week.

Frontend note: Add a route to redirect user to LinkedIn using the URL from `connect` endpoint, and a callback route to call API `callback` and then redirect back to Settings.

Acceptance Criteria
- [ ] From the UI, user can initiate LinkedIn connect, approve, and land back.
- [ ] Tokens saved encrypted; `SocialAccount` created or updated.

Potential Blockers
- Redirect URI mismatch → ensure the exact URI matches LinkedIn app settings.
- Clock skew → if `expires_in` parsing is off, add a skew (e.g., -2 minutes).

Dependencies
- Week 1 entities and tables.

---

### Week 3: Posts & Schedules API + basic validation
**Objectives**: CRUD for draft posts, schedule creation, and list endpoints skeleton.

**Tasks**:
1. Create endpoints under tenant group for posts and schedules.
2. Implement basic server-side validation (2k char cap, single image presence optional).
3. Add list endpoints for queue/history filters (stubs; fill next weeks).

**Implementation Details**
- Files to create:
  - `apps/api/Src/Features/Tenant/Social/Posts/SocialPostEndpoints.cs`
  - `apps/api/Src/Features/Tenant/Social/Posts/SocialPostHandlers.cs`
  - `apps/api/Src/Features/Tenant/Social/Schedules/ScheduleEndpoints.cs`
  - `apps/api/Src/Features/Tenant/Social/Schedules/ScheduleHandlers.cs`
- Modify:
  - `apps/api/Program.cs` to map new endpoints under `tenantGroup`
  - `apps/api/Src/Lib/RoutePath.cs` add constants under `Tenant`

Endpoint signatures:
- `POST /tenant/posts` → create draft { body, mediaAssetId? } → returns post
- `PUT /tenant/posts/{id}` → update draft
- `POST /tenant/posts/{id}/schedule` → { accountId, scheduledAtLocal, timeZone } → creates `Schedule`
- `GET /tenant/queue?from&to&status&accountId` → upcoming
- `GET /tenant/history?from&to&status&accountId` → past

DB changes: none.

Acceptance Criteria
- [ ] Able to create/update draft posts and create schedules via HTTP file.
- [ ] Queue/history endpoints return filtered results (even if minimal now).

Potential Blockers
- Time zone handling → store UTC and original IANA zone on Schedule.

Dependencies
- Week 1–2 completed.

---

### Week 4: Single-image upload pipeline
**Objectives**: Implement S3 upload endpoint with validation; wire to posts.

**Tasks**:
1. Add S3 client integration and upload endpoint.
2. Validate MIME (image/*), size, dimensions.
3. Attach uploaded image to `SocialPost` via `MediaAsset`.

**Implementation Details**
- NuGet (API):
  ```bash
  cd apps/api
  dotnet add package AWSSDK.S3
  dotnet add package SixLabors.ImageSharp
  ```
- Files:
  - `apps/api/Src/Features/Tenant/Social/Media/MediaService.cs`
  - `apps/api/Src/Features/Tenant/Social/Media/MediaEndpoints.cs`

Upload endpoint:
- `POST /tenant/media` multipart form-data: `file`
- Validations (suggested):
  - MIME: `image/jpeg`, `image/png`, `image/webp`
  - Size: ≤ 5 MB
  - Dimensions: min 300x300, max 4096x4096
- Storage key: `tenant/{tenantId}/media/{yyyy}/{MM}/{dd}/{guid}.{ext}`

Attach to post:
- `PUT /tenant/posts/{id}` with `mediaAssetId` after successful upload.

DB changes: none.

Acceptance Criteria
- [ ] Can upload a valid image and receive a `MediaAsset` back.
- [ ] Post can reference the uploaded `MediaAsset`.

Potential Blockers
- CORS for uploads → ensure API CORS allows front origin.
- Large file memory → stream to S3; avoid loading entire file in memory.

Dependencies
- Week 1 entities.

---

### Week 5: Hangfire setup with PostgreSQL storage
**Objectives**: Configure Hangfire server inside API; add dashboard restricted to staff.

**Tasks**:
1. Add Hangfire packages and configure storage using `POSTGRES_CONNECTION_STRING`.
2. Add dashboard at `/staff/hangfire` gated by existing staff/session middleware.
3. Register background job types; prepare schedule execution job signature.

**Implementation Details**
- NuGet (API):
  ```bash
  cd apps/api
  dotnet add package Hangfire.AspNetCore
  dotnet add package Hangfire.PostgreSql
  ```
- Program configuration:

```csharp
builder.Services.AddHangfire(cfg => cfg
  .UseSimpleAssemblyNameTypeSerializer()
  .UseRecommendedSerializerSettings()
  .UsePostgreSqlStorage(Environment.GetEnvironmentVariable("POSTGRES_CONNECTION_STRING"))
);
builder.Services.AddHangfireServer();

// after middlewares
app.UseHangfireDashboard("/staff/hangfire", new DashboardOptions {
  Authorization = new[] { new StaffOnlyHangfireAuthFilter() }
});
```

- Authorization filter:
  - `apps/api/Src/Lib/Hangfire/StaffOnlyHangfireAuthFilter.cs` implementing `IDashboardAuthorizationFilter` and checking staff session/claims.

DB changes: Hangfire will create its own tables when it runs.

Acceptance Criteria
- [ ] `/staff/hangfire` reachable for staff only.
- [ ] Background server starts with the API and stays healthy.

Potential Blockers
- Dashboard auth context availability → use `context.GetHttpContext()` and your existing staff auth.

Dependencies
- Week 1–4 completed.

---

### Week 6: Publish pipeline core
**Objectives**: Implement schedule execution job and LinkedIn publish flow with idempotency & retries.

**Tasks**:
1. Job: `PublishScheduleJob(Guid scheduleId)` reads schedule, prepares payload, posts to LinkedIn.
2. Handle tokens: refresh if about to expire; update account secrets.
3. Save `PublishJob` record with result and external URL.
4. Configure retries/backoff.

**Implementation Details**
- Files:
  - `apps/api/Src/Features/Tenant/Social/Publish/PublishService.cs`
  - `apps/api/Src/Features/Tenant/Social/Publish/PublishJobRunner.cs`
  - `apps/api/Src/Features/Tenant/Social/LinkedIn/LinkedInClient.cs`

LinkedIn Post (UGC or Shares API):
- Endpoint: `POST https://api.linkedin.com/v2/ugcPosts` (member) with `w_member_social` token.
- For image: upload register → upload binary → reference in post (assets API). For MVP: limit to a single image.

Idempotency pattern:
- Before publishing: check if `Schedule.Status` is `published` AND `PublishJob` exists with `success`; if so, no-op.
- Use a unique `scheduleId` key when enqueuing the job; if re-enqueued, job checks status and returns.

Retry strategy:
- Use Hangfire automatic retries (e.g., 3 attempts) and classify errors:
  - Auth errors → refresh token then retry once.
  - Rate limit (429) → exponential backoff.
  - Network errors → exponential backoff.

Transaction boundaries:
- Save `PublishJob` attempt rows per try.
- When LinkedIn responds success, set `Schedule.Status=published`, `SocialPost.Status=published`, and store `ExternalUrl` atomically.

Acceptance Criteria
- [ ] A scheduled item publishes successfully and captures external post URL.
- [ ] Re-running the job for the same `scheduleId` does not duplicate the post.

Potential Blockers
- LinkedIn asset upload nuances → follow 3-step upload for images.
- Timeouts → increase HttpClient timeouts for media upload.

Dependencies
- Weeks 2, 4, 5.

---

### Week 7: End-to-end scheduling + queue/history views (backend complete)
**Objectives**: Wire enqueue logic and ensure queue/history filters are correct.

**Tasks**:
1. When creating a schedule, enqueue Hangfire job at the scheduled UTC.
2. Fill out queue/history query handlers with filters and pagination.
3. Add retry endpoint for failed schedules.

**Implementation Details**
- Enqueue:
  - On `POST /tenant/posts/{id}/schedule`, after save: `BackgroundJob.Schedule(() => PublishJobRunner.Run(scheduleId), scheduledAtUtc)`.
- Retry endpoint:
  - `POST /tenant/schedules/{id}/retry` → validates not already published, enqueues immediate job.

Acceptance Criteria
- [ ] Creating a schedule enqueues the job at correct UTC time.
- [ ] History view shows published/failed with external link when available.
- [ ] Retry enqueues and respects idempotency checks.

Potential Blockers
- Clock skew between API and DB → rely on server time; ensure container time sync.

Dependencies
- Weeks 3, 5, 6.

---

### Week 8: Frontend UI (Settings/Composer/Queue/History)
**Objectives**: Build minimal UI pages and Composer modal; integrate with API.

**Tasks**:
1. Settings → LinkedIn connect/revoke + account list/status.
2. Composer modal → text, image upload/preview, account selector, datetime picker with timezone.
3. Queue/History pages → lists with filters; status pills; retry action.

**Implementation Details**
- Files to create:
  - `apps/front/app/routes/tenant/social/settings.tsx`
  - `apps/front/app/routes/tenant/social/queue.tsx`
  - `apps/front/app/routes/tenant/social/history.tsx`
  - `apps/front/app/components/social/ComposerModal.tsx`
  - `apps/front/app/lib/social/api.ts` (thin wrappers around Kiota or fetch)
- Use `apps/front/_vite/generate-client.ts` Kiota integration. Ensure OpenAPI is updated, then run front dev once to generate/update the client.
- Timezones: use `date-fns-tz` or `luxon` to convert local time → UTC and back.

UI flow:
- Settings: fetch `GET /tenant/social-accounts`, show connect button which calls `POST /tenant/social-accounts/linkedin/connect` and redirects.
- Composer: create draft `POST /tenant/posts` → upload image (`POST /tenant/media`) → `PUT /tenant/posts/{id}` to attach media → `POST /tenant/posts/{id}/schedule`.
- Queue/History: call `GET /tenant/queue` and `GET /tenant/history` with filters.

Acceptance Criteria
- [ ] Can connect LinkedIn, compose a post, upload a single image, schedule it.
- [ ] Queue shows upcoming; History shows published/failed; Retry works from UI.

Potential Blockers
- CORS, mixed content (when S3 is http) → align protocol or set `S3_USE_SSL` correctly.

Dependencies
- Backend weeks completed.

---

### Week 9: Beta hardening and observability
**Objectives**: Polish UX, add failure visibility, logs/metrics, and token-expiry banner.

**Tasks**:
1. Add token-expiry banner if `ExpiresAt` within N days; prompt reconnect.
2. Add structured logs and correlation IDs for publish attempts.
3. Add counters for success/fail/retries.

**Implementation Details**
- Logging: reuse `shared/lib/logger`; correlate by `scheduleId`.
- Add `/tenant/social-accounts` fields to show expiry.
- UI banner on settings when expiry < 7 days.

Acceptance Criteria
- [ ] Clear error messages in UI for failed publishes.
- [ ] Dashboard (Hangfire) shows stable retries and job outcomes.

Potential Blockers
- LinkedIn intermittent errors → surface error taxonomy in `PublishJob.ErrorCode`.

Dependencies
- All prior weeks.

---

### Week 10: Launch prep and rollout
**Objectives**: Onboard 5–10 beta users, finalize deploy, collect feedback.

**Tasks**:
1. Prepare Dokploy environment variables.
2. Run migrations and verify health checks.
3. Onboard users, capture feedback, fix critical issues only.

Acceptance Criteria
- [ ] Production deploy green; `/health` passing; dashboard reachable for staff.
- [ ] 5+ users schedule and publish successfully.

Potential Blockers
- Missing env vars → verify vs this guide.

Dependencies
- All prior weeks.

---

## 3. Detailed Task Breakdown for Critical Features

### LinkedIn OAuth Flow
Step-by-step
1) Front calls `POST /tenant/social-accounts/linkedin/connect` → receives `{ authorizationUrl, state }`.
2) Front redirects user to LinkedIn.
3) LinkedIn redirects to your callback with `code` and `state`.
4) API `GET /tenant/social-accounts/linkedin/callback` verifies `state`, exchanges `code` for tokens.
5) API encrypts and stores tokens in `SocialAccount` with `ExpiresAt` and `Scopes`.

Configuration
- `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` in process environment (do not commit).
- `FRONT_URL` used to build callback redirect if front relays.

Token encryption (Data Protection)

```csharp
var protector = dataProtectionProvider.CreateProtector("linkedin-oauth");
var tokenEnc = protector.Protect(accessToken);
var refreshEnc = refreshToken is null ? null : protector.Protect(refreshToken);
```

Refresh logic
- Refresh when `ExpiresAt` < now + 5 minutes.
- If refresh fails with 401/invalid_grant → mark account as `status=needs_reconnect`; show banner.

OAuth controller/endpoints example (minimal API style)

```csharp
routes.MapPost("/tenant/social-accounts/linkedin/connect", async (/* deps */) => {
  // build auth URL with state; return JSON
});

routes.MapGet("/tenant/social-accounts/linkedin/callback", async (string code, string state, /* deps */) => {
  // validate state, exchange code, persist account, redirect to front settings
});
```

### Hangfire Setup
Packages
- `Hangfire.AspNetCore`
- `Hangfire.PostgreSql`

Program configuration (see Week 5): add server + dashboard.

PostgreSQL storage
- Uses `POSTGRES_CONNECTION_STRING`. Hangfire will create required tables on start.

Dashboard authorization filter
- Implement `IDashboardAuthorizationFilter` that checks existing staff session/claims from `HttpContext`.

Job registration

```csharp
public static class PublishJobs {
  public static void Enqueue(Guid scheduleId, DateTimeOffset scheduledUtc) {
    BackgroundJob.Schedule(() => PublishJobRunner.Run(scheduleId), scheduledUtc);
  }
}
```

Idempotency
- In `PublishJobRunner.Run(scheduleId)`, early-return if already `published` with success job.

### Publish Pipeline
Flow
1) Fetch `Schedule` + `SocialPost` + `SocialAccount` for tenant.
2) If token near expiry, refresh.
3) If post has image: register upload with LinkedIn, upload to LinkedIn, attach asset to post payload.
4) POST to `ugcPosts` with correct visibility and owner (`urn:li:person:{id}` or `urn:li:organization:{id}`).
5) Record `PublishJob` outcome; on success, set external URL (from response `id` → build URL).

Error handling
- Map HTTP statuses to `ErrorCode` (e.g., `auth`, `rate_limit`, `network`, `payload`).
- Use automatic retries with exponential backoff for transient errors.

External URL capture
- LinkedIn returns an `id` like `urn:li:share:1234567890`; build URL `https://www.linkedin.com/feed/update/urn:li:share:1234567890/`.

Transactions
- Wrap state transitions (publish success) in a transaction: update `Schedule` and `SocialPost`, insert `PublishJob`.

### Single-Image Upload
S3 configuration
- Env: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_USE_SSL`.

Upload endpoint
- `POST /tenant/media` multipart; after validation, `PutObjectAsync` to S3.

Validation
- MIME allowlist, size limit (≤ 5 MB), dimensions bounds using ImageSharp.

Storage key generation
- `tenant/{tenantId}/media/{yyyy}/{MM}/{dd}/{guid}.{ext}`

Attach to LinkedIn
- Use LinkedIn asset upload sequence; reference the returned asset URN in `ugcPosts` payload.

### Frontend Composer Modal
Structure
- `ComposerModal.tsx` props: `{ open, onClose, onCreated(scheduleId) }`
- Internal state: `body`, `imageFile`, `imagePreviewUrl`, `accountId`, `scheduledAtLocal`, `timeZone`.

Behaviors
- Image select → preview; upload on submit before scheduling.
- Submit flow: create draft → upload → attach → schedule → close modal → refresh queue.

Validation & errors
- Show inline errors on body length, missing account or time.
- Show server errors from API.

---

## 4. Testing Strategy Per Week

General
- Use existing OpenAPI and `apps/front/_vite/generate-client.ts` for client; test APIs via `apps/api/http/*.http` files or curl.

Week 1
- API: Verify tables created (`
SELECT table_name FROM information_schema.tables WHERE table_schema='public';
`).

Week 2
- API: `POST /tenant/social-accounts/linkedin/connect` returns URL; complete OAuth in browser and inspect DB rows for encrypted tokens.

Week 3
- API: CRUD posts; schedule creation; list queue/history (minimal correctness).

Week 4
- API: Upload valid/invalid images and verify validation errors.

Week 5
- API: Hangfire server runs; dashboard accessible to staff only.

Week 6–7
- Integration: Create schedule for 2 minutes ahead; confirm job fires; verify LinkedIn result (in dev, you may stub or post to a test profile).

Week 8
- UI: Full E2E — connect, compose, upload, schedule, see queue/history.

When to write unit tests
- Critical logic (idempotency checks, payload builders, token refresh) → add targeted unit tests.
- UI smoke tests can be deferred to post-MVP.

Critical integration tests
- Idempotent publish on retries.
- Token refresh path.
- Image upload + LinkedIn asset attach.

---

## 5. Deployment Checklist

- [ ] Configure Dokploy service `publyapp-api` and `publyapp-front` (see `dokploy.yml`).
- [ ] Set environment variables in Dokploy:
  - API: `ASPNETCORE_ENVIRONMENT=Production`, `POSTGRES_CONNECTION_STRING`, `FRONT_URL`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `S3_*`, `DATAPROTECTION_KEYS_DIR=/var/app/dp-keys`
  - FRONT: `VITE_ASP_SERVER_URL`, `VITE_POSTHOG_API_KEY` (optional)
- [ ] Mount a persistent volume for Data Protection keys at `DATAPROTECTION_KEYS_DIR`.
- [ ] Run DB migrations on first deploy.
  ```bash
  cd apps/api && pnpm migrate:apply
  ```
- [ ] Verify `/health` for API and front healthcheck.
- [ ] Verify Hangfire dashboard access (`/staff/hangfire`) for staff only.
- [ ] Test a full OAuth connect, compose, schedule, and publish in production.

Monitoring & logging
- Tail API logs; ensure request IDs/correlation IDs are present on publish pipeline paths.

---

## 6. Beta Launch Preparation (Week 9–10)

Onboarding 5–10 users
- [ ] Create tenants and user accounts; assign necessary permissions using existing staff tools.
- [ ] Share brief how-to: connect LinkedIn, compose, schedule, check queue/history.

Documentation to provide
- Quickstart (1-page)
- Known limitations: single image only, LinkedIn only, simple queue/history.

Feedback collection
- Google Form or Notion template; capture bugs, UX pain, feature requests.

Metrics to track
- Jobs scheduled vs published vs failed; retry counts; time-to-publish.

Common issues
- OAuth failures (redirect mismatch, scope missing) → update LinkedIn app or env vars.
- Token expiry → reconnect prompt; ensure refresh path implemented.

---

## 7. Implementation Anti-Patterns to Avoid

- Over-scoping UI (calendar, multi-network) — keep to minimal queue/history and composer.
- Building a separate worker service pre-MVP — host Hangfire server inside API.
- Skipping idempotency — will cause duplicate posts on retries.
- Storing tokens unencrypted — must use Data Protection.
- Loose time zone handling — always convert to UTC for storage; store IANA id.
- Premature analytics dashboards — defer to post-MVP.

---

## Appendix: Commands & Paths

API scripts (from `apps/api/package.json`)
```bash
pnpm --dir apps/api dev
pnpm --dir apps/api build
pnpm --dir apps/api migrate:add AddSocialEntities
pnpm --dir apps/api migrate:apply
```

OpenAPI client generation (front)
```bash
pnpm --dir apps/front dev # triggers generate-client plugin if OpenAPI is present
```

Suggested new backend files
- `apps/api/Src/Features/Tenant/Social/Entities/*`
- `apps/api/Src/Features/Tenant/Social/OAuth/*`
- `apps/api/Src/Features/Tenant/Social/Posts/*`
- `apps/api/Src/Features/Tenant/Social/Schedules/*`
- `apps/api/Src/Features/Tenant/Social/Media/*`
- `apps/api/Src/Features/Tenant/Social/Publish/*`
- `apps/api/Src/Lib/Hangfire/StaffOnlyHangfireAuthFilter.cs`

Suggested new frontend files
- `apps/front/app/routes/tenant/social/{settings,queue,history}.tsx`
- `apps/front/app/components/social/ComposerModal.tsx`
- `apps/front/app/lib/social/api.ts`

💡 Tips
- Keep a local `.env` (not committed) for dev variables; use system env in containers.
- Add a small `apps/api/http/Social.http` file to quickly exercise new endpoints.

⚠️ Warnings
- Treat LinkedIn rate limits seriously; add delays/backoff.
- When posting to real accounts, use test content and obtain consent.


