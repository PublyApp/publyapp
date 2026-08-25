# Lane 639 — B3 : une image par Post (attach, read models, front composer)

**Statut : plan d'implémentation** — exécution tâche par tâche, un commit par tâche, push après chaque commit. TDD strict : chaque tâche commence par un test qui échoue (RED) sous `heavy.sh`, puis l'implémentation (GREEN), puis commit.

## 0. Décisions de conception (issues de l'exploration vérifiée)

| Décision | Choix | Justification (fichiers réels) |
|---|---|---|
| Entité | `PostMediaAsset` dans `apps/api/Modules/Posts/Entities/PostMediaAsset.cs` (`[Table("post_media_assets")]`, hérite `BaseAttributes`, `ITenantEntity`) | Convention entités (cf. `Post.cs`) ; v1 = 1 image/post, unicité partielle sur `(post_id)` WHERE `is_deleted = false` laisse la place à plusieurs images plus tard sans migration contractante |
| Stockage | Réutilise le pipeline uploads existant : `IUploadAdmissionService.BeginReservationAsync` + `IFileStorage.SaveAsync` + `IUploadAssetReferenceService` (acquire AVANT écriture entité, release APRÈS SaveChanges, même tx). Aucun second chemin de stockage | `CreateStaffUpload.cs`, `AccountProfileService.cs` (pattern #807 F5), `UploadAssetReferenceService.cs` |
| Endpoints | `POST /posts/{postId}/image` et `DELETE /posts/{postId}/image` (multipart / action-only), permissions existantes `posts.create` / `posts.edit` pour attach, `posts.edit` pour remove, rate limit `AuthenticatedDefault` (attach multipart) | `Routes.Posts.ForTenant`, `PostEndpointsForTenant.cs`, brief « tenant.posts.* verbs » |
| Validation | Type par magic bytes (png/jpeg/webp/gif — même sniff que `CreateStaffUpload.SniffImageType`, extrait dans un inspecteur partagé réutilisé, pas dupliqué) + dimensions lues dans les en-têtes PNG/JPEG/GIF/WebP ; taille via `AppEnvironment.UPLOAD_MAX_BYTES` ; admission durable ; chaque refus porte sa cause en mots simples + `TranslationKey` | Brief §1 « every refusal names its cause » ; `ResponseKeys.g.cs` généré depuis `response-message.{en,fr}.json` |
| Dimensions | Lues côté serveur au moment de l'attach (PNG IHDR, JPEG SOF0-3/SOFn scan, GIF logical screen, WebP VP8X/BITFLOW) et stockées en base | Le gap documenté round-5 API F5 (« signature seule, jamais décodé ») est partiellement comblé : on lit les vraies dimensions d'en-tête, sans dépendance ImageSharp |
| Alt text | Colonne `alt_text` nullable sur `post_media_assets`, modifiable via `PATCH /posts/{postId}` champ `image_alt_text` (`PatchField<string>`) | Pattern `PatchField` (AGENTS.md) ; read models exposent `{ image: { url, altText, width, height } \| null }` |
| Suppression | `DeletePostForTenant` purge la ligne asset (hard-delete via `ForceHardDelete`) + release référence blob DANS la même tx ; replace (attach sur post qui a déjà une image) fait pareil pour l'ancienne | Brief §1 « no orphans; prove it » ; `AppDbContext.ForceHardDelete` existe |
| Isolation | Toute lecture/mutation asset passe par `TenantId` du jeton ; foreign tenant → **404** (jamais 403) ; spec de mutation adverse visera ce filtre | Brief « Proofs » ; conventions 404-isolation |
| Front | `lib/query/tenant-post-images.ts` (mutations attach/remove via client Kiota régénéré) ; composant `_parts/post-image-picker.tsx` route-local (préfixé `_`, ne devient pas une route) intégré au drawer B2 et à la page édition ; i18n EN+FR ; erreurs via `getFailureMessage(toApiFailure(...))` | Conventions front AGENTS.md ; `staff-uploads.ts` comme précédent Kiota multipart |

Constat stockage (brief §1 demande de vérifier) : **aucun S3/MinIO n'est configuré** — `compose.yaml` ne lance que PostgreSQL ; `IFileStorage` → `LocalDiskFileStorage` (singleton, racine `FILE_STORAGE_ROOT=.artifacts/storage`). Les URLs servies sont `/files/{relative_path}` en accès anonyme (documenté dans `CreateStaffUpload`). Le code reste derrière l'abstraction `IFileStorage`.

## 1. Carte des fichiers

**Backend (créés)**
- `apps/api/Modules/Posts/Entities/PostMediaAsset.cs` (+ enum `PostImageKind` non nécessaire — colonnes directes)
- `apps/api/Modules/Posts/Entities/PostMediaAssetConfiguration.cs`
- `apps/api/Infrastructure/Storage/ImageInspector.cs` (+ `.Spec.cs`) — sniff type + dimensions
- `apps/api/Modules/Posts/Services/IPostMediaAssetService.cs` / `PostMediaAssetService.cs` (+ `.Spec.cs`)
- `apps/api/Modules/Posts/Handlers/Tenant/AttachPostImageForTenant.cs`
- `apps/api/Modules/Posts/Handlers/Tenant/RemovePostImageForTenant.cs`
- `apps/api/Modules/Posts/Handlers/Tenant/*.Spec.cs` (specs intégration)
- `apps/api/Lib/Architecture/PostsSliceMediaGuard.Spec.cs` (garde slice)
- Migration EF `AddPostMediaAssets` (expand-only)

**Backend (modifiés)**
- `apps/api/Data/DbContext/AppDbContext.cs` — `DbSet<PostMediaAsset> PostMediaAsset`
- `apps/api/Lib/Routes/Routes.Posts.cs` — `AttachImage`/`RemoveImage`
- `apps/api/Modules/Posts/Endpoints/PostEndpointsForTenant.cs` — 2 mappings
- `apps/api/Modules/Posts/Handlers/Tenant/GetPostForTenant.cs` / `FindPostsForTenant.cs` + `Services/PostService.cs` — read models avec `image`
- `apps/api/Modules/Posts/Handlers/Tenant/UpdatePostForTenant.cs` — `image_alt_text` (PatchField)
- `apps/api/Modules/Posts/Handlers/Tenant/DeletePostForTenant.cs` — purge cascade
- `packages/shared-ts/src/lib/i18n/json/response-message.{en,fr}.json` — nouvelles clés (→ `ResponseKeys.g.cs`)
- `apps/api/Migrations/*AddPostMediaAssets*`

**Front (créés/modifiés)**
- `apps/front/src/lib/query/tenant-post-images.ts`
- `apps/front/src/routes/authed/tenant/posts/_parts/post-image-picker.tsx` (+ `.test.tsx`)
- `apps/front/src/routes/authed/tenant/posts/_create-post-drawer.tsx` (intégration)
- `apps/front/src/routes/authed/tenant/posts/$postId/edit.tsx` (intégration)
- `apps/front/src/lib/query/tenant-posts.ts` (types image dans détails/lignes)
- `apps/front/src/i18n/locales/{en,fr}/posts.json`
- `apps/front/e2e/tenant-post-image.spec.ts`

---

## Tâche 1 — Entité + configuration + migration expand-only

**RED** (spéc co-localisée `PostMediaAssetConfiguration.Spec.cs`) :
```csharp
[Fact]
public void ItShouldMapPartialUniqueIndexOnLivePostId() {
	// ModelSnapshot: index unique partiel ix_post_media_assets_live_post_id
	// sur post_id WHERE is_deleted = false ; tenant_id indexé ; FK posts cascade.
}
```
Squelette entité (réel) :
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
Configuration : FK `Post` cascade, index `(tenant_id, post_id)`, index unique partiel `HasIndex(a => a.PostId).IsUnique().HasFilter("\"is_deleted\" = false")` nommé `ix_post_media_assets_live_post_id`.
Ajout `DbSet`. Puis `heavy.sh just db-add AddPostMediaAssets` (recette build sans doc-gen puis dotnet-ef).
Vérifier la migration **expand-only** : CREATE TABLE + index uniquement, aucune suppression.

**GREEN** : la spéc passe ; `just db-migrate` applique sur la PG locale.
**Commit** : `feat(api): post media assets entity and expand-only migration (#639)`

## Tâche 2 — ImageInspector (type + dimensions) avec spec

`apps/api/Infrastructure/Storage/ImageInspector.cs` :
```csharp
public static class ImageInspector {
	public readonly record struct Inspected(string ContentType, string Extension, int WidthPx, int HeightPx);
	public static Inspected? Inspect(Stream stream); // png/jpeg/gif/webp, null si inconnu
}
```
- PNG : signature 8 octets, dimensions IHDR octets 16..24 (big-endian uint32 ×2).
- GIF : GIF87a/GIF89a, screen descriptor little-endian uint16 ×2, zéro interdit (règle F5 reprise).
- WebP : RIFF/WEBP puis chunk VP8X (canvas w-1/h-1 24 bits LE) ou simple lossy VP8 (14 bits) ou lossless VP8L.
- JPEG : marqueurs SOFn (C0-CF hors C4/C8/CC) pour hauteur/largeur big-endian.
Specs : fixtures byte[] (comme `CreateStaffUpload.Spec.PngBytes` mais complétées avec dimensions valides), cas nuls (texte, tronqué, canvas zéro).

**Commit** : `feat(api): image inspector with header dimensions (#639)`

## Tâche 3 — Service + routes + endpoints attach/remove

`IPostMediaAssetService` (DbContext seul — boundary guard respecté) :
```csharp
public interface IPostMediaAssetService {
	Task<Post?> FindOwnedPostAsync(Guid tenantId, Guid postId, CancellationToken ct = default);
	Task<PostMediaAsset?> FindByPostAsync(Guid tenantId, Guid postId, CancellationToken ct = default);
	Task AttachAsync(AttachPostMediaArgs args, CancellationToken ct = default);   // acquire ref → add row → SaveChanges → release old ref (même tx logique #807 F5)
	Task RemoveAsync(Guid tenantId, Guid postId, CancellationToken ct = default); // ForceHardDelete + release ref après SaveChanges
	Task ReleaseOnPostDeleteAsync(Post post, CancellationToken ct = default);     // appelé par DeletePostForTenant avant sa SaveChanges
}
```
`AttachPostMediaArgs` record (`{Action}{Domain}Args`, ≤2 paramètres partout sinon record — règle args-record).
Routes :
```csharp
public const string AttachImage = "/{postId}/image";
public static string AttachImageFn(string postId) { return $"/{postId}/image"; }
```
Endpoints (dans `PostEndpointsForTenant.MapPostEndpointsForTenant`, groupe déjà rate-limité) :
- `MapPost(Routes.Posts.ForTenant.AttachImage, AttachPostImageForTenant.Handle)` + `.WithReqBodyValidation<AttachPostImageBody>()` + `.WithTenantPermission([AppPermissions.Tenant.Posts.CREATE])` + `RequestSizeLimitAttribute(UPLOAD_MAX_BYTES + headroom)` ;
- `MapDelete(Routes.Posts.ForTenant.AttachImage, RemovePostImageForTenant.Handle)` + `.WithTenantPermission([AppPermissions.Tenant.Posts.EDIT])`.

Handler attach (orchestration, aucun DbContext direct) : parse ids → service.FindOwnedPost (null → 404 `TypedProblems.NotFound("Post not found", ResponseKeys.NotFound)`) → validations fichier (required / taille `PayloadTooLarge` / `ImageInspector.Inspect` null → validation problem cause en clair) → `uploadAdmissionService.BeginReservationAsync(account.UserId, file.Length, UploadAdmissionService.StaffUploadPurpose, ct)` → refus budget → message plain-words (copie `FormatBytes` + scopes, `ResponseKeys.UploadBudgetExhausted`) → `fileStorage.SaveAsync` → `assetService.AttachAsync` (acquire avant write, release ancien après) → audit `AuditActions.UploadCreated` details `{PostId, Path}` → 201 `Ok<...>` DTO `{url, path, altText, widthPx, heightPx}`.
Clés response-message ajoutées (EN+FR) : `post-image-required`, `post-image-too-large`, `post-image-unsupported-type`, `post-image-dimensions-invalid` (si w/h ≤ 0 après inspection), `post-image-attached-success`, `post-image-removed-success`, `post-not-found` (réutilisable). `just check-write` regénère `ResponseKeys.g.cs`.

**RED** d'abord : spec handler happy-path échoue 404 tant que l'endpoint n'existe pas.
**Commit** : `feat(api): attach/remove post image endpoints (#639)`

## Tâche 4 — Read models détail + liste + alt text

- `PostDetail` += `public required PostImageReadModel? Image { get; init; }` ; `PostListItem` idem ; record `PostImageReadModel { Url, AltText, WidthPx, HeightPx }` (URL = `$"/files/{RelativePath}"`).
- `PostService.GetByIdForTenantAsync` / liste : projection jointure `post_media_assets` (filtre `!IsDeleted`, un seul par post grâce à l'index unique partiel).
- `UpdatePostForTenant.Body` += `PatchField<string>? ImageAltText` → service update asset.AltText (limite 1 000 chars, validation cause claire).
**RED** : spec `ItShouldExposeAttachedImageInGetAndList` échoue (champ absent → null).
**Commit** : `feat(api): post read models expose attached image (#639)`

## Tâche 5 — Cascade suppression post

Dans `DeletePostForTenant.Handle` (ou son service) : avant `SaveChanges` soft-delete du post, appeler `assetService.ReleaseOnPostDeleteAsync(post, ct)` → hard-delete ligne asset + `TryReleaseReferenceAsync(relativePath)` après SaveChanges (même tx). Preuve spec : après DELETE post → ligne absente (`IgnoreQueryFilters` équivalent : requête directe) ET `upload_assets.reference_count` == 0.
**Commit** : `feat(api): deleting a post purges its image asset (#639)`

## Tâche 6 — Specs intégration complètes (preuves brief)

`AttachPostImageForTenant.Spec.cs` / `RemovePostImageForTenant.Spec.cs` — pattern `ApiFixture` + `LoginAsAcmeAdminAsync()` + `WithSessionToken(token).WithTenantId(tenantId)`, multipart `MultipartFormDataContent` (octets fixtures) :

1. `ItShouldAttachAnImageToADraftAndReturnDimensions` — 201, DTO complet, GET détail expose `image.url/alt/w/h` (happy path).
2. `ItShouldHideForeignTenantPostFromAttach` — TechStart admin tente attach sur post Acme → **404**, jamais 403.
3. `ItShouldRefuseAttachWithoutPermission` — AcmeUser (AccountLevel.User, profil sans `posts.create` vérifié au seed `UserAccountSeeder`) → 403.
4. `ItShouldRefuseRemoveWithoutPermission` — AcmeUser → 403 sur DELETE.
5. `ItShouldNameMissingFileCause` — sans fichier → 422 cause "A file is required" / clé `post-image-required`.
6. `ItShouldNameOversizeFileCause` — > UPLOAD_MAX_BYTES → 413 clé `post-image-too-large`.
7. `ItShouldNameUnsupportedTypeCause` — texte renommé .png → 422 clé `post-image-unsupported-type`.
8. `ItShouldReplaceExistingImageWithoutOrphan` — attach×2 → 1 ligne asset (nouveau path), ancienne référence released (`reference_count` 0), blob physique supprimé par policy sweeper (on assert la ligne `upload_assets` Orphaned, PAS le disque).
9. `ItShouldRemoveImageAndLeaveNoRow` — remove → 200 ApiResponse, ligne absente, référence released.
10. `ItShouldReturn404WhenRemovingWithoutImage` — remove sur post sans image → 404 cause nommée.
11. `ItShouldUpdateAltTextViaPatch` — PATCH `image_alt_text` → GET reflète.
12. `ItShouldPurgeAssetWhenPostDeleted` — DELETE post → asset purgé (preuve §1).
13. `ItShouldRejectDimensionsBeyondBounds` — fixture dimensions dégénérées → 422 `post-image-dimensions-invalid`.

Chaque verbe refusé sans permission = preuve « each verb refused without permission ». Exécution sous `heavy.sh`, ciblée d'abord (`--filter FullyQualifiedName~PostImage`), module Posts entier en fin de lane.

**Commits** : specs au fil des tâches ci-dessus (TDD) ; commit final `test(api): post image integration proofs (#639)` si des cas restent.

## Tâche 7 — Garde d'architecture slice

`PostsSliceMediaGuard.Spec.cs` : réflexion `ArchitectureDiscovery` — tout endpoint du groupe `/posts` porte `WithTenantPermission` + rate limiting metadata ; handlers Posts n'injectent ni `AppDbContext` ni `DbContext` (déjà couvert globalement par HandlerContractGuard — la spéc slice épinglant nos deux nouveaux handlers rend la contrainte explicite pour la review).
**Commit** : `test(api): architecture guard for post image endpoints (#639)`

## Tâche 8 — Contrat + client Kiota

```
heavy.sh just build-api && heavy.sh just generate-client && pnpm --filter front typecheck
```
Jamais éditer `packages/client-ts/` à la main ; vérifier diff généré propre (models `PostImageReadModel`, chemins `/posts/{postId}/image`).
**Commit** : `chore(client): regenerate kiota client for post images (#639)`

## Tâche 9 — Front query layer + picker

`tenant-post-images.ts` : `useAttachPostImageMutation` (Kiota `MultipartBody` + `createUntypedString` pour alt, précédent `staff-uploads.ts`), `useRemovePostImageMutation`, invalidation `TENANT_POST_DETAILS_QUERY_KEY` + liste.
Composant `_parts/post-image-picker.tsx` (route-local préfixé `_`) : input file (accept png/jpeg/webp/gif), preview `<img>` (aperçu local objet URL — surface produit : autorisé car c'est l'image d'entité du post, aspect ratio préservé), champ alt, bouton retirer ; chaque erreur API affichée via `getFailureMessage(toApiFailure(e))` (jamais traduite à la main — règle lint) ; testids `tenant-posts-create-image-input/-preview/-alt/-remove`.
Tests vitest : attach ok (mock client), erreur taille → message causé visible, remove, alt.
i18n EN+FR : `posts.json` += `image-label, image-help, image-alt-label, image-alt-placeholder, image-remove, image-attached-success, image-removed-success` (FR traduit).
**Commits** : `feat(front): post image picker component (#639)` puis intégration drawer + edit page : `feat(front): wire post image picker into composer and edit page (#639)`.

## Tâche 10 — e2e taggé

`tenant-post-image.spec.ts` : `test.describe('@uploads @639 tenant post image', …)` (vocabulaire tags vérifié dans `docs/guides/e2e-tags.md` ; ticket tag = #639), `loginAsTenantUser(SINGLE_TENANT_USER_CREDENTIALS)`, fixture `e2e/fixtures/logo.png` via `setInputFiles` :
scénario unique exigé : drawer création → body + image (preview visible) → save → visible dans la liste drafts → ouvrir edit page → image + alt présents. Testids réels vérifiés (`tenant-posts-new-post`, `tenant-posts-create-drawer`, `tenant-posts-drafts-table`, `tenant-post-edit-page`, `tenant-post-edit-body`).
CI est la preuve (interdiction stack e2e locale) — la spec est committée, exécutée par le workflow e2e.

## Tâche 11 — Mutation adverse

Choix : **retirer le filtre `TenantId`** dans `PostMediaAssetService.FindOwnedPostAsync` (le point exact d'isolation).
Protocole (transcrit dans `.dump/mutation-proof.md`) :
1. `md5sum` avant/après patch du fichier (restauration byte-exact) ;
2. suite ciblée isolation → **ROUGE** attendu (spec #2) — sortie complète copiée dans `.dump/mutation-proof.md` ;
3. restauration, `md5sum` identique, suite → VERTE.
Le transcript (commandes + sorties + md5) ira dans le corps du PR.

## Tâche 12 — Portes finales + PR

1. `heavy.sh` suites ciblées puis module Posts+Uploads entiers, `just check-write`, `pnpm --filter front typecheck`, vitest front ciblé, analyseurs (`dotnet test --filter Analyzers` inclus dans la suite).
2. Note « api-check » : cette recette n'existe pas dans le justfile ; l'équivalent local retenu = `just build-api` + suites API ciblées/module + analyzers (documenté dans le PR).
3. `.dump/pr-body.md` (what/why, proofs listées, mutation rouge→verte, « Model: Ox Alpha via Nous Portal (jcode), effort max », « Unverified until CI: … », section « Anything in this brief that turned out to be wrong » [api-check inexistant, pas de S3/MinIO configuré, permission verb réel = posts.* et non tenant.posts.*]) puis `gh pr create --base develop --body-file`.
4. Poll `gh pr checks` (>1 min sans checks ⇒ conflit ⇒ rebase origin/develop, force-with-lease).
5. `.dump/DONE.md` (tip SHA, PR number, chemins de preuves) + print `DONE`.

## Règles transverses (rappel bloquant)

Pas de commentaires disable/suppression, pas de Skip, pas d'assouplissement de garde ; classes = méthodes (pas d'arrow properties C#) ; pas de `as any`/`as never` production ; develop intact ; pas de sous-agents ; secrets jamais en sortie ; heavy invocations ciblées (<20 min sous verrou) ; push après CHAQUE commit.
