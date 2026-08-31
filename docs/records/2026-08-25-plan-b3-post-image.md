# Lane 639 — B3: one image per Post (attach, read models, front composer)

**Status: implementation plan** — task-by-task execution, one commit per task, push after each commit. TDD strict: each task starts with a failing test (RED) under `heavy.sh`, then implementation (GREEN), then commit.

## 0. Design decisions (from verified exploration)

| Decision | Choice | Justification (real files) |
|---|---|---|
| Entity | `PostMediaAsset` in `apps/api/Modules/Posts/Entities/PostMediaAsset.cs` (`[Table("post_media_assets")]`, inherits `BaseAttributes`, `ITenantEntity`) | Entity convention (see `Post.cs`); v1 = 1 image/post, partial unique index on `(post_id)` WHERE `is_deleted = false` leaves room for multiple images later without a contracting migration |
| Storage | Reuses the existing uploads pipeline: `IUploadAdmissionService.BeginReservationAsync` + `IFileStorage.SaveAsync` + `IUploadAssetReferenceService` (acquire BEFORE entity write, release AFTER SaveChanges, same tx). No second storage path | `CreateStaffUpload.cs`, `AccountProfileService.cs` (pattern #807 F5), `UploadAssetReferenceService.cs` |
| Endpoints | `POST /posts/{postId}/image` and `DELETE /posts/{postId}/image` (multipart / action-only), existing permissions `posts.create` / `posts.edit` for attach, `posts.edit` for remove, rate limit `AuthenticatedDefault` (attach multipart) | `Routes.Posts.ForTenant`, `PostEndpointsForTenant.cs`, brief "tenant.posts.* verbs" |
| Validation | Type by magic bytes (png/jpeg/webp/gif — same sniff as `CreateStaffUpload.SniffImageType`, extracted into a shared reused inspector, not duplicated) + dimensions read from PNG/JPEG/GIF/WebP headers; size via `AppEnvironment.UPLOAD_MAX_BYTES`; durable admission; each refusal carries its cause in plain words + `TranslationKey` | Brief §1 "every refusal names its cause"; `ResponseKeys.g.cs` generated from `response-message.{en,fr}.json` |
| Dimensions | Read server-side at attach time (PNG IHDR, JPEG SOF0-3/SOFn scan, GIF logical screen, WebP VP8X/BITFLOW) and stored in DB | The documented round-5 API F5 gap ("signature only, never decoded") is partially closed: real header dimensions are read, without ImageSharp dependency |
| Alt text | Nullable `alt_text` column on `post_media_assets`, editable via `PATCH /posts/{postId}` field `image_alt_text` (`PatchField<string>`) | `PatchField` pattern (AGENTS.md); read models expose `{ image: { url, altText, width, height } \| null }` |
| Deletion | `DeletePostForTenant` purges the asset row (hard-delete via `ForceHardDelete`) + releases blob reference IN the same tx; replace (attach on post that already has an image) does the same for the old one | Brief §1 "no orphans; prove it"; `AppDbContext.ForceHardDelete` exists |
| Isolation | All asset reads/mutations go through `TenantId` from the token; foreign tenant → **404** (never 403); adverse mutation spec targets this filter | Brief "Proofs"; 404-isolation conventions |
| Front | `lib/query/tenant-post-images.ts` (attach/remove mutations via regenerated Kiota client); route-local component `_parts/post-image-picker.tsx` (prefixed `_`, does not become a route) integrated into B2 drawer and edit page; i18n EN+FR; errors via `getFailureMessage(toApiFailure(...))` | Front conventions AGENTS.md; `staff-uploads.ts` as Kiota multipart precedent |

Storage finding (brief §1 asks to verify): **no S3/MinIO is configured** — `compose.yaml` runs only PostgreSQL; `IFileStorage` → `LocalDiskFileStorage` (singleton, root `FILE_STORAGE_ROOT=.artifacts/storage`). Served URLs are `/files/{relative_path}` in anonymous access (documented in `CreateStaffUpload`). Code stays behind the `IFileStorage` abstraction.

## 1. File map

**Backend (created)**
- `apps/api/Modules/Posts/Entities/PostMediaAsset.cs` (+ enum `PostImageKind` not needed — direct columns)
- `apps/api/Modules/Posts/Entities/PostMediaAssetConfiguration.cs`
- `apps/api/Infrastructure/Storage/ImageInspector.cs` (+ `.Spec.cs`) — sniff type + dimensions
- `apps/api/Modules/Posts/Services/IPostMediaAssetService.cs` / `PostMediaAssetService.cs` (+ `.Spec.cs`)
- `apps/api/Modules/Posts/Handlers/Tenant/AttachPostImageForTenant.cs`
- `apps/api/Modules/Posts/Handlers/Tenant/RemovePostImageForTenant.cs`
- `apps/api/Modules/Posts/Handlers/Tenant/*.Spec.cs` (integration specs)
- `apps/api/Lib/Architecture/PostsSliceMediaGuard.Spec.cs` (slice guard)
- EF migration `AddPostMediaAssets` (expand-only)

**Backend (modified)**
- `apps/api/Data/DbContext/AppDbContext.cs` — `DbSet<PostMediaAsset> PostMediaAsset`
- `apps/api/Lib/Routes/Routes.Posts.cs` — `AttachImage`/`RemoveImage`
- `apps/api/Modules/Posts/Endpoints/PostEndpointsForTenant.cs` — 2 mappings
- `apps/api/Modules/Posts/Handlers/Tenant/GetPostForTenant.cs` / `FindPostsForTenant.cs` + `Services/PostService.cs` — read models with `image`
- `apps/api/Modules/Posts/Handlers/Tenant/UpdatePostForTenant.cs` — `image_alt_text` (PatchField)
- `apps/api/Modules/Posts/Handlers/Tenant/DeletePostForTenant.cs` — cascade purge
- `packages/shared-ts/src/lib/i18n/json/response-message.{en,fr}.json` — new keys (→ `ResponseKeys.g.cs`)
- `apps/api/Migrations/*AddPostMediaAssets*`

**Front (created/modified)**
- `apps/front/src/lib/query/tenant-post-images.ts`
- `apps/front/src/routes/authed/tenant/posts/_parts/post-image-picker.tsx` (+ `.test.tsx`)
- `apps/front/src/routes/authed/tenant/posts/_create-post-drawer.tsx` (integration)
- `apps/front/src/routes/authed/tenant/posts/$postId/edit.tsx` (integration)
- `apps/front/src/lib/query/tenant-posts.ts` (image types in details/rows)
- `apps/front/src/i18n/locales/{en,fr}/posts.json`
- `apps/front/e2e/tenant-post-image.spec.ts`

---

## Task 1 — Entity + configuration + expand-only migration

**RED** (co-located spec `PostMediaAssetConfiguration.Spec.cs`):
```csharp
[Fact]
public void ItShouldMapPartialUniqueIndexOnLivePostId() {
    // ModelSnapshot: partial unique index ix_post_media_assets_live_post_id
    // on post_id WHERE is_deleted = false; tenant_id indexed; FK posts cascade.
}
```
Entity skeleton (real):
```csharp
[Table("post_media_assets")]
public class PostMediaAsset : BaseAttributes, ITenantEntity {
    [Column("tenant_id")] public required Guid TenantId { get; set; }
    public Tenant Tenant { get => RequiredNavigation.Get(_tenant, nameof(PostMediaAsset), nameof(Tenant)); set => _tenant = value; }
    private Tenant? _tenant;

    [Column("post_id")] public required Guid PostId { get; set; }
    [JsonIgnore] public Post Post { get => RequiredNavigation.Get(_post, nameof(PostMediaAsset), nameof(Post)); set => _post = value; }
    private Post? _post;

    [Column("relative_path")] public required string RelativePath { get; set; }
    [Column("content_type")] public required string ContentType { get; set; }
    [Column("alt_text")] public string? AltText { get; set; }
    [Column("width_px")] public int WidthPx { get; set; }
    [Column("height_px")] public int HeightPx { get; set; }
    [Column("size_bytes")] public long SizeBytes { get; set; }
    [Column("uploaded_by_user_id")] public required Guid UploadedByUserId { get; set; }
}
```
Configuration: FK `Post` cascade, index `(tenant_id, post_id)`, partial unique index `HasIndex(a => a.PostId).IsUnique().HasFilter("\"is_deleted\" = false")` named `ix_post_media_assets_live_post_id`.
Add `DbSet`. Then `heavy.sh just db-add AddPostMediaAssets` (build recipe without doc-gen then dotnet-ef).
Verify the migration is **expand-only**: CREATE TABLE + indexes only, no drops.

**GREEN**: spec passes; `just db-migrate` applies to local PG.
**Commit**: `feat(api): post media assets entity and expand-only migration (#639)`

## Task 2 — ImageInspector (type + dimensions) with spec

`apps/api/Infrastructure/Storage/ImageInspector.cs`:
```csharp
public static class ImageInspector {
    public readonly record struct Inspected(string ContentType, string Extension, int WidthPx, int HeightPx);
    public static Inspected? Inspect(Stream stream); // png/jpeg/gif/webp, null if unknown
}
```
- PNG: 8-byte signature, IHDR dimensions bytes 16..24 (big-endian uint32 x2).
- GIF: GIF87a/GIF89a, screen descriptor little-endian uint16 x2, zero forbidden (F5 rule reused).
- WebP: RIFF/WEBP then VP8X chunk (canvas w-1/h-1 24-bit LE) or simple lossy VP8 (14-bit) or lossless VP8L.
- JPEG: SOFn markers (C0-CF excluding C4/C8/CC) for height/width big-endian.
Specs: byte[] fixtures (like `CreateStaffUpload.Spec.PngBytes` but with valid dimensions), null cases (text, truncated, zero canvas).

**Commit**: `feat(api): image inspector with header dimensions (#639)`

## Task 3 — Service + routes + endpoints attach/remove

`IPostMediaAssetService` (DbContext only — boundary guard respected):
```csharp
public interface IPostMediaAssetService {
    Task<Post?> FindOwnedPostAsync(Guid tenantId, Guid postId, CancellationToken ct = default);
    Task<PostMediaAsset?> FindByPostAsync(Guid tenantId, Guid postId, CancellationToken ct = default);
    Task AttachAsync(AttachPostMediaArgs args, CancellationToken ct = default);   // acquire ref → add row → SaveChanges → release old ref (same logical tx #807 F5)
    Task RemoveAsync(Guid tenantId, Guid postId, CancellationToken ct = default); // ForceHardDelete + release ref after SaveChanges
    Task ReleaseOnPostDeleteAsync(Post post, CancellationToken ct = default);     // called by DeletePostForTenant before its SaveChanges
}
```
`AttachPostMediaArgs` record (`{Action}{Domain}Args`, ≤2 params everywhere else — args-record rule).
Routes:
```csharp
public const string AttachImage = "/{postId}/image";
public static string AttachImageFn(string postId) { return $"/{postId}/image"; }
```
Endpoints (in `PostEndpointsForTenant.MapPostEndpointsForTenant`, already rate-limited group):
- `MapPost(Routes.Posts.ForTenant.AttachImage, AttachPostImageForTenant.Handle)` + `.WithReqBodyValidation<AttachPostImageBody>()` + `.WithTenantPermission([AppPermissions.Tenant.Posts.CREATE])` + `RequestSizeLimitAttribute(UPLOAD_MAX_BYTES + headroom)`;
- `MapDelete(Routes.Posts.ForTenant.AttachImage, RemovePostImageForTenant.Handle)` + `.WithTenantPermission([AppPermissions.Tenant.Posts.EDIT])`.

Handler attach (orchestration, no direct DbContext): parse ids → service.FindOwnedPost (null → 404 `TypedProblems.NotFound("Post not found", ResponseKeys.NotFound)`) → file validations (required / size `PayloadTooLarge` / `ImageInspector.Inspect` null → validation problem cause in plain words) → `uploadAdmissionService.BeginReservationAsync(account.UserId, file.Length, UploadAdmissionService.StaffUploadPurpose, ct)` → budget refusal → plain-words message (copy `FormatBytes` + scopes, `ResponseKeys.UploadBudgetExhausted`) → `fileStorage.SaveAsync` → `assetService.AttachAsync` (acquire before write, release old after) → audit `AuditActions.UploadCreated` details `{PostId, Path}` → 201 `Ok<...>` DTO `{url, path, altText, widthPx, heightPx}`.
response-message keys added (EN+FR): `post-image-required`, `post-image-too-large`, `post-image-unsupported-type`, `post-image-dimensions-invalid` (if w/h ≤ 0 after inspection), `post-image-attached-success`, `post-image-removed-success`, `post-not-found` (reusable). `just check-write` regenerates `ResponseKeys.g.cs`.

**RED** first: happy-path handler spec fails 404 until endpoint exists.
**Commit**: `feat(api): attach/remove post image endpoints (#639)`

## Task 4 — Detail + list read models + alt text

- `PostDetail` += `public required PostImageReadModel? Image { get; init; }`; `PostListItem` same; record `PostImageReadModel { Url, AltText, WidthPx, HeightPx }` (URL = `$"/files/{RelativePath}"`).
- `PostService.GetByIdForTenantAsync` / list: join projection `post_media_assets` (filter `!IsDeleted`, one per post thanks to partial unique index).
- `UpdatePostForTenant.Body` += `PatchField<string>? ImageAltText` → service update asset.AltText (1000 char limit, clear validation cause).
**RED**: spec `ItShouldExposeAttachedImageInGetAndList` fails (field absent → null).
**Commit**: `feat(api): post read models expose attached image (#639)`

## Task 5 — Post deletion cascade

In `DeletePostForTenant.Handle` (or its service): before `SaveChanges` soft-delete of post, call `assetService.ReleaseOnPostDeleteAsync(post, ct)` → hard-delete asset row + `TryReleaseReferenceAsync(relativePath)` after SaveChanges (same tx). Spec proof: after DELETE post → row absent (`IgnoreQueryFilters` equivalent: direct query) AND `upload_assets.reference_count` == 0.
**Commit**: `feat(api): deleting a post purges its image asset (#639)`

## Task 6 — Full integration specs (brief proofs)

`AttachPostImageForTenant.Spec.cs` / `RemovePostImageForTenant.Spec.cs` — `ApiFixture` + `LoginAsAcmeAdminAsync()` + `WithSessionToken(token).WithTenantId(tenantId)`, multipart `MultipartFormDataContent` (fixture bytes):

1. `ItShouldAttachAnImageToADraftAndReturnDimensions` — 201, full DTO, GET detail exposes `image.url/alt/w/h` (happy path).
2. `ItShouldHideForeignTenantPostFromAttach` — TechStart admin tries attach on Acme post → **404**, never 403.
3. `ItShouldRefuseAttachWithoutPermission` — AcmeUser (AccountLevel.User, profile without `posts.create` verified at seed `UserAccountSeeder`) → 403.
4. `ItShouldRefuseRemoveWithoutPermission` — AcmeUser → 403 on DELETE.
5. `ItShouldNameMissingFileCause` — no file → 422 cause "A file is required" / key `post-image-required`.
6. `ItShouldNameOversizeFileCause` — > UPLOAD_MAX_BYTES → 413 key `post-image-too-large`.
7. `ItShouldNameUnsupportedTypeCause` — text renamed .png → 422 key `post-image-unsupported-type`.
8. `ItShouldReplaceExistingImageWithoutOrphan` — attach×2 → 1 asset row (new path), old reference released (`reference_count` 0), physical blob deleted by policy sweeper (assert `upload_assets` row is Orphaned, NOT the disk).
9. `ItShouldRemoveImageAndLeaveNoRow` — remove → 200 ApiResponse, row absent, reference released.
10. `ItShouldReturn404WhenRemovingWithoutImage` — remove on post without image → 404 named cause.
11. `ItShouldUpdateAltTextViaPatch` — PATCH `image_alt_text` → GET reflects.
12. `ItShouldPurgeAssetWhenPostDeleted` — DELETE post → asset purged (proof §1).
13. `ItShouldRejectDimensionsBeyondBounds` — degenerate dimension fixture → 422 `post-image-dimensions-invalid`.

Each verb refused without permission = proof "each verb refused without permission". Execution under `heavy.sh`, targeted first (`--filter FullyQualifiedName~PostImage`), full Posts module at end of lane.

**Commits**: specs alongside tasks above (TDD); final commit `test(api): post image integration proofs (#639)` if cases remain.

## Task 7 — Slice architecture guard

`PostsSliceMediaGuard.Spec.cs`: reflection `ArchitectureDiscovery` — every endpoint in `/posts` group carries `WithTenantPermission` + rate limiting metadata; Posts handlers inject neither `AppDbContext` nor `DbContext` (already covered globally by HandlerContractGuard — the slice spec pinning our two new handlers makes the constraint explicit for review).
**Commit**: `test(api): architecture guard for post image endpoints (#639)`

## Task 8 — Contract + Kiota client

```
heavy.sh just build-api && heavy.sh just generate-client && pnpm --filter front typecheck
```
Never edit `packages/client-ts/` by hand; verify clean generated diff (models `PostImageReadModel`, paths `/posts/{postId}/image`).
**Commit**: `chore(client): regenerate kiota client for post images (#639)`

## Task 9 — Front query layer + picker

`tenant-post-images.ts`: `useAttachPostImageMutation` (Kiota `MultipartBody` + `createUntypedString` for alt, precedent `staff-uploads.ts`), `useRemovePostImageMutation`, invalidation `TENANT_POST_DETAILS_QUERY_KEY` + list.
Route-local component `_parts/post-image-picker.tsx` (prefixed `_`): file input (accept png/jpeg/webp/gif), preview `<img>` (local object URL preview — product surface: allowed because it's the post entity image, aspect ratio preserved), alt field, remove button; each API error displayed via `getFailureMessage(toApiFailure(e))` (never translated by hand — lint rule); testids `tenant-posts-create-image-input/-preview/-alt/-remove`.
Vitest tests: attach ok (mock client), size error → visible caused message, remove, alt.
i18n EN+FR: `posts.json` += `image-label, image-help, image-alt-label, image-alt-placeholder, image-remove, image-attached-success, image-removed-success` (FR translated).
**Commits**: `feat(front): post image picker component (#639)` then drawer + edit page integration: `feat(front): wire post image picker into composer and edit page (#639)`.

## Task 10 — Tagged e2e

`tenant-post-image.spec.ts`: `test.describe('@uploads @639 tenant post image', …)` (tag vocabulary verified in `docs/guides/e2e-tags.md`; ticket tag = #639), `loginAsTenantUser(SINGLE_TENANT_USER_CREDENTIALS)`, fixture `e2e/fixtures/logo.png` via `setInputFiles`:
single required scenario: create drawer → body + image (preview visible) → save → visible in drafts list → open edit page → image + alt present. Real testids verified (`tenant-posts-new-post`, `tenant-posts-create-drawer`, `tenant-posts-drafts-table`, `tenant-post-edit-page`, `tenant-post-edit-body`).
CI is the proof (local e2e stack prohibition) — spec is committed, run by the e2e workflow.

## Task 11 — Adverse mutation

Choice: **remove the `TenantId` filter** in `PostMediaAssetService.FindOwnedPostAsync` (the exact isolation point).
Protocol (transcribed in `.dump/mutation-proof.md`):
1. `md5sum` before/after patching the file (byte-exact restoration);
2. targeted isolation suite → expected RED (spec #2) — full output copied to `.dump/mutation-proof.md`;
3. restoration, identical `md5sum`, suite → GREEN.
Transcript (commands + outputs + md5) goes in the PR body.

## Task 12 — Final gates + PR

1. `heavy.sh` targeted suites then full Posts+Uploads modules, `just check-write`, `pnpm --filter front typecheck`, targeted front vitest, analyzers (`dotnet test --filter Analyzers` included in suite).
2. "api-check" note: this recipe doesn't exist in the justfile; chosen local equivalent = `just build-api` + targeted/module API suites + analyzers (documented in PR).
3. `.dump/pr-body.md` (what/why, proofs listed, mutation red→green, "Model: Ox Alpha via Nous Portal (jcode), effort max", "Unverified until CI: …", section "Anything in this brief that turned out to be wrong" [api-check doesn't exist, no S3/MinIO configured, real permission verb = posts.* not tenant.posts.*]) then `gh pr create --base develop --body-file`.
4. Poll `gh pr checks` (>1 min without checks ⇒ conflict ⇒ rebase origin/develop, force-with-lease).
5. `.dump/DONE.md` (tip SHA, PR number, evidence paths) + print `DONE`.

## Cross-cutting rules (blocking reminder)

No disable/suppression comments, no Skip, no guard loosening; classes = methods (no C# arrow properties); no `as any`/`as never` in production; develop intact; no sub-agents; secrets never in output; targeted heavy invocations (<20 min under lock); push after EVERY commit.
