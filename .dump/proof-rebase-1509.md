# Preuve de rebasage — PR #1509 (branche `lane/wt-1461`)

Date : 2026-08-26
Arbre : `wt-1446` (branche `lane/wt-1461` = PR #1509)
But : remettre la branche au-dessus de `origin/develop` en gardant les deux côtés sur
chaque fichier en conflit, puis prouver que les gardes touchées attrapent encore les
violations.

## 1. Suite API complète — VERT

Commande (après rebase, working tree propre) :

```
cd apps/api && APP_ROLE=api dotnet test Tests/PublyApp.Api.Tests.csproj -c Test
```

Résultat :

```
Passed!  - Failed:     0, Passed:  2200, Skipped:     0, Total:  2200, Duration: 13 m 43 s
```

Aucune régle de garde, aucun seuil, aucune config de lint n'a été assoupli.

## 2. Garde `PublicationArchitecture.Spec.cs`

Fichier : `apps/api/Lib/Architecture/PublicationArchitecture.Spec.cs`
Test ciblé :
`PublyApp.Api.Lib.Architecture.PublicationArchitectureSpec.ItShouldLetOnlyTheTransitionServiceWritePublicationStatus`

### ROUGE — violation plantée

Fichier temporaire planté (NON commité, supprimé ensuite) :
`apps/api/Modules/Posts/Handlers/Tenant/RogueStatusWriter.cs`

```csharp
using PublyApp.Api.Modules.Publishing.Entities;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

public sealed class RogueStatusWriter {
    public static void Run(Publication p, PublicationStatus s) {
        p.Status = s;
    }
}
```

Sortie (noyau) :

```
[xUnit.net] PublyApp.Api.Lib.Architecture.PublicationArchitectureSpec
    .ItShouldLetOnlyTheTransitionServiceWritePublicationStatus [FAIL]
  Failed ...ItShouldLetOnlyTheTransitionServiceWritePublicationStatus [26 s]
  Error Message:
   Expected scan.RogueWriters to be empty because only
   PublicationStatusTransitionService may write Publication.Status; found 1 rogue
   writer(s):
   Modules/Posts/Handlers/Tenant/RogueStatusWriter.cs:9: p.Status = s, but found at
   least one item {"Modules/Posts/Handlers/Tenant/RogueStatusWriter.cs:9: p.Status = s"}.
  Stack Trace:
   at ...ItShouldLetOnlyTheTransitionServiceWritePublicationStatus()
     in .../apps/api/Lib/Architecture/PublicationArchitecture.Spec.cs:line 375
Failed!  - Failed: 1, Passed: 0, Skipped: 0, Total: 1
```

Le test nomme le fichier et la ligne (`RogueStatusWriter.cs:9`).

### VERT — violation retirée

Après suppression du fichier rogue :

```
cd apps/api && APP_ROLE=api dotnet test Tests/PublyApp.Api.Tests.csproj -c Test \
  --filter "FullyQualifiedName~PublicationArchitectureSpec.ItShouldLetOnlyTheTransitionServiceWritePublicationStatus"

Passed!  - Failed: 0, Passed: 1, Skipped: 0, Total: 1
```

## 3. Garde `PostsSliceMediaGuard.Spec.cs`

Fichier : `apps/api/Lib/Architecture/PostsSliceMediaGuard.Spec.cs`
Test ciblé :
`PublyApp.Api.Lib.Architecture.PostsSliceMediaGuardSpec.ItShouldPinPostMediaAssetServiceDependencies`

### ROUGE — violation plantée

Modification temporaire plantée dans
`apps/api/Modules/Posts/Services/PostMediaAssetService.cs` (NON commitée, restaurée
ensuite) : ajout d'une dépendance de domaine non autorisée au constructeur.

```csharp
public sealed class PostMediaAssetService(
    AppDbContext dbContext,
    IUploadAssetReferenceService rogueReferenceService)
    : IPostMediaAssetService {
    private readonly IUploadAssetReferenceService _rogue = rogueReferenceService;
    // ... _rogue lu dans FindOwnedPostAsync pour satisfaire les analyseurs IDE0051/52
```

Sortie (noyau) :

```
[xUnit.net] PublyApp.Api.Lib.Architecture.PostsSliceMediaGuardSpec
    .ItShouldPinPostMediaAssetServiceDependencies [FAIL]
  Failed ...ItShouldPinPostMediaAssetServiceDependencies [130 ms]
  Error Message:
   Expected _ = offenders to be empty because PostMediaAssetService may depend only
   on its DbContext (#1461 ratchet: ...); adding another domain-service dependency
   couples slices and belongs behind a deliberate change to this pin, but found at
   least one item
   {"PostMediaAssetService.ctor(rogueReferenceService: IUploadAssetReferenceService)"}.
  Stack Trace:
   at ...ItShouldPinPostMediaAssetServiceDependencies()
     in .../apps/api/Lib/Architecture/PostsSliceMediaGuard.Spec.cs:line 169
Failed!  - Failed: 1, Passed: 0, Skipped: 0, Total: 1
```

Le test nomme le constructeur et le paramètre (`PostMediaAssetService.ctor(rogueReferenceService: IUploadAssetReferenceService)`).

### VERT — violation retirée

Après restauration du constructeur à `PostMediaAssetService(AppDbContext dbContext)` :

```
cd apps/api && APP_ROLE=api dotnet test Tests/PublyApp.Api.Tests.csproj -c Test \
  --filter "FullyQualifiedName~PostsSliceMediaGuardSpec.ItShouldPinPostMediaAssetServiceDependencies"

Passed!  - Failed: 0, Passed: 1, Skipped: 0, Total: 1
```

## 4. Conclusion

- Les deux gardes compilent ET attrapent encore leurs violations respectives (ROUGE réel
  obtenu en plantant la violation, VERT obtenu après retrait).
- Aucune des deux n'est une « garde morte » qui compile mais ne capte plus rien.
- Aucun fichier de preuve (rogue) n'a été commité ; le working tree est propre hormis
  les documents `.dump/` de ce round.
