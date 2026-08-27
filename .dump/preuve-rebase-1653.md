# Preuves de rebasage #1653 → #1616

**Date** : 2026-08-27
**Branche** : `lane/wt-1461-clean`
**HEAD** : `324cf748871849a624d88a25309b08a67e393311`
**Modèle** : claude-fable-5 (effort: low)

## Résumé

| Preuve | Statut |
|---|---|
| #1 Specs #1653 (fuite) | ✅ 13/13 passent |
| #2 Garantie réelle (forme fautive → rouge) | ✅ Échec puis rétabli |
| #3 Tests #1616/#807 | ✅ 17/17 passent |
| #4 Suite API complète | ✅ 2279/2279 passent |
| #5 Diff stat propre | ✅ 6 fichiers, 0 suppression |

---

## Preuve #1 — Specs #1653 sur la fuite (13/13)

```
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNotLeakBlobReferencesUnderConcurrentAttachToSamePost [1 s]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNameMissingFileCause [257 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldHideForeignTenantPostFromAttach [328 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldReleaseTheNewBlobReferenceWhenTheAttachWriteIsRejected [435 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldAttachAnImageToADraftAndReturnDimensions [426 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNameDegenerateDimensionsCause [436 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNameOversizeFileCause [449 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldPurgeAssetWhenPostDeleted [395 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNameUnsupportedTypeCause [338 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldReplaceExistingImageWithoutOrphan [684 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldRefuseAttachWithoutPermission [511 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNotOrphanBlobReferencesUnderConcurrentAttachToSamePost [4 s]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNotLeakReferenceUnderConcurrentPostImageAttach [3 s]
Total tests: 13
     Passed: 13
 Total time: 37.1396 Seconds
```

---

## Preuve #2 — La garantie est toujours réelle

**Forme fautive introduite** (pre-#1653) : capture du chemin remplacé dans le handler via `FindByPostAsync` AVANT `AttachAsync`, sans compensation concurrente.

**Résultat avec forme fautive** :
```
Failed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNotLeakBlobReferencesUnderConcurrentAttachToSamePost [1 s]
Expected leaked to be empty because every blob that is not the live image must have its reference released — a stuck reference is the #1617 reference leak, but found at least one item {"uploads/2026/08/01a04454-7bba-7e65-b027-4252c0170513.png"}.
```

**Conclusion** : le test attrape le bug. Le handler correct est rétabli (commit `324cf7488`).

---

## Preuve #3 — Tests #1616/#807 (17/17)

```
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.RemovePostImageForTenantSpec.ItShouldReturn404WhenRemovingWithoutImage [1 s]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNotLeakBlobReferencesUnderConcurrentAttachToSamePost [2 s]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.RemovePostImageForTenantSpec.ItShouldHideForeignTenantPostFromRemove [504 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNameMissingFileCause [232 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.RemovePostImageForTenantSpec.ItShouldRemoveImageAndLeaveNoRow [413 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldHideForeignTenantPostFromAttach [469 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.RemovePostImageForTenantSpec.ItShouldRefuseRemoveWithoutPermission [295 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldReleaseTheNewBlobReferenceWhenTheAttachWriteIsRejected [431 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldAttachAnImageToADraftAndReturnDimensions [300 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNameDegenerateDimensionsCause [553 ms]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNameOversizeFileCause [1 s]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldPurgeAssetWhenPostDeleted [1 s]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNameUnsupportedTypeCause [1 s]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldReplaceExistingImageWithoutOrphan [1 s]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldRefuseAttachWithoutPermission [1 s]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNotOrphanBlobReferencesUnderConcurrentAttachToSamePost [2 s]
Passed PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenantSpec.ItShouldNotLeakReferenceUnderConcurrentPostImageAttach [1 s]
Total tests: 17
     Passed: 17
```

---

## Preuve #4 — Suite API complète (2279/2279)

```
Total tests: 2279
     Passed: 2279
```

---

## Preuve #5 — Diff stat propre

```
 .../Lib/Architecture/PostsSliceMediaGuard.Spec.cs  |  18 +-
 .../Tenant/AttachPostImageForTenant.Spec.cs        | 249 +++++++++++++++++++++
 .../Handlers/Tenant/AttachPostImageForTenant.cs    | 126 +++++++++--
 .../Posts/Handlers/Tenant/DeletePostForTenant.cs   |  10 +-
 .../Handlers/Tenant/RemovePostImageForTenant.cs    |  14 +-
 .../Posts/Services/PostMediaAssetService.cs        |  39 ++--
 6 files changed, 395 insertions(+), 61 deletions(-)
```

**Aucune suppression** — l'apport se limite à #1653/#1616/#807.
