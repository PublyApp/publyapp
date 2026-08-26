# DONE — Rebasage PR #1509 (branche `lane/wt-1461`)

Date : 2026-08-26
Arbre : `wt-1446` (branche `lane/wt-1461`, == PR #1509 headRefName, vérifié).

## Fichiers en conflit et ce que chaque côté apportait

### 1. `apps/api/Data/DbContext/AppDbContext.cs`
- Côté `develop` : ajout du `using PublyApp.Api.Modules.RateLimiting.Entities;`
  (PR #1532 — compteurs de rate-limit distribués, `RateLimitCounter` DbSet).
- Côté branche (PR #1446) : ajout du `using PublyApp.Api.Modules.Publishing.Lib;`
  (contenmentent runtime du single-writer `Publication.Status` via
  `PublicationStatusWriteGuard` câblé dans `OnConfiguring`).
- Résolution : **les deux `using` conservés** (tous deux réellement utilisés :
  `RateLimitCounter` en ligne 135, `PublicationStatusWriteGuard` via
  `Modules/Publishing/Lib` en ligne 20).

### 2. `apps/api/Lib/Architecture/PublicationArchitecture.Spec.cs` (garde)
- Côté `develop` : ajout de `Modules/Tenants/Services/TenantUsageService.Spec.cs` à
  `BaselineTestSeedFiles` (un nouveau spec qui seed des `Publication` avec un statut).
- Côté branche (PR #1446) : ajout de
  `Modules/Publishing/Lib/PublicationStatusWriteGuard.Spec.cs` à `BaselineTestSeedFiles`
  (son spec seed des lignes ET plante délibérément les crimes reflection/direct pour
  prouver le contenement runtime).
- Résolution : **les deux entrées de baseline conservées**. Perdre l'un des deux
  aurait désactivé silencieusement une protection de garde (stale-baseline échouerait,
  ou le spec #1446 aurait compté comme rogue writer).

### 3–7. Slice média posts (`PostsSliceMediaGuard.Spec.cs` + 4 fichiers de code)
Conflits dans :
- `apps/api/Lib/Architecture/PostsSliceMediaGuard.Spec.cs` (2 zones : doc-comment +
  message d'assertion)
- `apps/api/Modules/Posts/Handlers/Tenant/AttachPostImageForTenant.cs` (2 zones)
- `apps/api/Modules/Posts/Handlers/Tenant/DeletePostForTenant.cs` (1 zone)
- `apps/api/Modules/Posts/Handlers/Tenant/RemovePostImageForTenant.cs` (2 zones)
- `apps/api/Modules/Posts/Services/PostMediaAssetService.cs` (5 zones)

- Côté `develop` : déplacement de la discipline de référence #807 F5 (acquire/release)
  des services vers les handlers appelants, PLUS ajout de `IUploadAssetReferenceService`
  et du `using Uploads.Services` dans `AttachPostImageForTenant` (le handler possède déjà
  la coordination).
- Côté branche (PR #1461) : même déplacement conceptuel de la discipline #807 F5, mais
  exprimé via le refactor « reference discipline in the calling handlers » qui renomme/
  reformate les commentaires et l'ordre local.
- Résolution : **les deux intentions fusionnées** — les commentaires de garde et les
  messages d'assertion combinent les deux descriptions ; le code exécuté (acquire avant
  écriture, release après commit) est identique des deux côtés. Les variables locales
  (`replacedImage`/`removedPath`) unifiées vers les noms de la branche.

### Piège réel corrigé après rebase
`AttachPostImageForTenant.cs` : la résolution automatique avait **dupliqué** le
`using Uploads.Services` et le paramètre `uploadReferences` (déjà présents côté develop).
Corrigé : un seul `using` et un seul paramètre `uploadReferences` (ligne 38).
Sans cette correction, la branche ne compilait pas (CS0105 + CS0100).

## Ce qui reste non vérifié
- Aucun. La suite API complète (2200 tests) est VERTE, et les deux gardes touchées sont
  prouvées ROUGE→VERT (voir `.dump/proof-rebase-1509.md`).
- `gh pr checks 1509` doit être relu après le push pour confirmer 0 échec côté CI
  (la CI ne lance pas la suite API en local, mais le brief exige la vérification
  post-push).
