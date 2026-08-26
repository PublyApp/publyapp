# Plan — solution de cache adaptatif (#58)

Livraison : ce document est le plan. Le code de production arrive par tâches séparées, chacune relisible et rejetable seule.

## Décisions ratifiées par le propriétaire (2026-08-26, commentaire d'arbitrage de #58) — appliquées, non rediscutées

1. Contrat `HybridCache`, moteur **FusionCache** en implémentation.
2. La façade `HybridCache` est plus étroite que l'API native : fail-safe et délais souples se règlent aux options d'entrée par défaut, à l'enregistrement. Le mécanisme d'exception est désigné plus bas (§ Mécanisme d'exception).
3. Fail-safe interdit par défaut, autorisé nommément par surface, avec le dire dans l'interface.
4. Le locataire est porté par la fabrique de clés, pas par la discipline ; garde d'étanchéité obligatoire.
5. Ordre : instrumenter d'abord, socle ensuite, cibles une par une avec preuve d'invalidation. Redis L2 hors périmètre.
6. Test de sérialisabilité : tout ce qui entre au cache doit survivre au passage en L2 distribué.

## Point de départ vérifié

Aucun cache applicatif dans `apps/api` sur `develop` : zéro occurrence de `IMemoryCache`, `AddMemoryCache`, `IDistributedCache`, `HybridCache`, `AddOutputCache`. Preuve négative : `git grep -c -E "IMemoryCache|AddMemoryCache|IDistributedCache|HybridCache|AddOutputCache" origin/develop -- apps/api` → aucune correspondance (citations-r1 C1). Aucun Redis dans le code ni dans les compose. Feuille blanche confirmée.

## Choix de moteur vérifiés

- **Version : `ZiggyCreatures.FusionCache` 2.7.1**, dernière stable (publiée 2026-08-20, marquée « Latest » ; la 2.7.0 porte elle-même l'avertissement « update to v2.7.1 »). Licence MIT.
- **L'adaptateur `AsHybridCache()` existe dans cette version.** Documentation officielle (`docs/MicrosoftHybridCache.md`) : `services.AddFusionCache().AsHybridCache();` expose l'instance comme `HybridCache` dans le conteneur DI, tout en gardant `IFusionCache` résolvable sur la même instance. Les versions récentes y ajoutent même `RemoveByTag("*")` côté adaptateur (2.6.0).
- **La façade impose la configuration au démarrage**, mot pour mot dans la doc : « we can configure all of this goodness only at startup, and not on a per-call basis ». Chaque appel ne peut passer qu'un `HybridCacheEntryOptions` mappé automatiquement vers les options FusionCache.
- **Caches nommés supplémentaires : `services.AddFusionCache(...).AsKeyedHybridCache("Foo");`** consommé via `[FromKeyedServices("Foo")] HybridCache` (même document, section « I Said Moar! »). C'est le mécanisme d'exception retenu ci-dessous.
- Paquets ajoutés à `Directory.Packages.props` : `ZiggyCreatures.FusionCache` **2.7.1** et `ZiggyCreatures.FusionCache.Serialization.SystemTextJson` **2.7.0**. Le sérialiseur vit dans un paquet séparé et sa dernière publication est 2.7.0 (NuGet, 2026-08-19) ; il déclare `ZiggyCreatures.FusionCache >= 2.7.0` en dépendance, et le pin transitive du dépôt garde le noyau résolu à 2.7.1 partout. Les deux versions sont relevées sur NuGet le 2026-08-26 (citations-r1 C15/C16) ; un futur 2.7.x du sérialiseur sera une ligne de props, rien d'autre.

## Mécanisme d'exception (point que le brief exige de fermer)

Deux candidats existaient : configurations FusionCache nommées, ou service dédié voyant seul `IFusionCache`.

**Retenu : caches nommés exposés en `HybridCache` indexés (`AsKeyedHybridCache`).** Deux noms seulement, constants dans `apps/api/Lib/Caching/CacheNames.cs` :

```csharp
public static class CacheNames {
	public const string Default = "default";
	public const string StaleTolerant = "stale-tolerant";
}
```

- `CacheNames.Default` : fail-safe **désactivé**, durée par défaut unique. Injecté sans clé (`HybridCache` nu) partout où le périmètre passe par les enveloppes de portée du socle.
- `CacheNames.StaleTolerant` : fail-safe **activé nommément** (`AllowFailSafeResponse = true`, `FailSafeMaxDuration` plafonné à 30 minutes, `FailSafeThrottleDuration` 1 minute). Consommé uniquement via `[FromKeyedServices(CacheNames.StaleTolerant)] HybridCache`, et uniquement par les surfaces inscrites au registre `StaleSurfaces` (voir garde plus bas).

**Rejeté — service dédié `IFusionCache` :** il recrée une seconde abstraction de cache à côté du contrat ratifié (précisément ce que la décision « tout le code contre `HybridCache` » voulait éviter), divise la gestion des clés entre deux API, et remet la décision de périmé-par-appel dans du code au lieu de la laisser aux options d'enregistrement où le propriétaire l'a fixée. Les options nommées gardent aussi la sortie : changer d'avis sur UNE surface = modifier UNE ligne d'enregistrement, aucun site d'appel touché.

## Portée du périmé rendue visible (corollaire non négociable)

Une surface qui sert du périmé doit le dire dans l'interface. Mécanisme retenu : **l'enveloppe auto-descriptive**, pas l'abonnement aux événements du moteur.

- `apps/api/Lib/Caching/CachedResult.cs` :

```csharp
public sealed record CachedResult<T>(T Data, DateTimeOffset GeneratedAtUtc);
```

- Règle : toute surface inscrite dans `StaleSurfaces` stocke `CachedResult<T>` et projette `GeneratedAtUtc` dans son DTO de réponse sous `generated_at_utc` (camelCase JSON). Le front affiche « données du JJ/MM à HH:mm » à partir de ce champ. Même quand la valeur est fraîche le champ existe : l'UI affiche la fraîcheur réelle, et un périmé servi par fail-safe se voit immédiatement — impossible de confondre les deux.
- Pourquoi pas les événements FusionCache (`OnFailSafeActivate`) : ils ne traversent pas la façade `HybridCache` (aucun canal pour remonter « cette réponse-ci vient du fail-safe » jusqu'au handler), et dépendraient d'un état latéral par clé. L'enveloppe survit à la sérialisation L2, se teste sans provoquer de panne, et dit la vérité même hors panne (fraîcheur normale).
- Le journal reste la deuxième couche : FusionCache trace nativement les activations fail-safe dans ses logs structurés Serilog ; rien à écrire, mais le plan l'exige dans la revue de chaque surface StaleTolerant (vérifier la ligne dans `.dump/` de la lane lors de la preuve locale).

## Locataire porté par la fabrique de clés (décision 4 ratifiée)

### Fabrique déterministe sans réflexion — reprise de la pièce jointe

Le format de la pièce jointe est conservé et étendu aux portées : `nameof(Service)::nameof(Method)` + paramètres sérialisés. Zéro `StackFrame`, zéro réflexion sur méthodes. `apps/api/Lib/Caching/CacheKeys.cs` :

```csharp
public static class CacheKeys {
	// t/<tenantId>/<service>::<method>/<name>=<value>/...
	public static string ForTenant(Guid tenantId, string service, string method, params (string Name, object? Value)[] args);
	// u/<userId>/<service>::<method>/...
	public static string ForUser(Guid userId, string service, string method, params (string Name, object? Value)[] args);
	// g/<service>::<method>/...
	public static string ForGlobal(string service, string method, params (string Name, object? Value)[] args);
}
```

Règles de format, figées et testées : préfixe de portée obligatoire (`t/`, `u/`, `g/`), `Guid` en format canonique minuscule, valeurs en culture invariante passées dans `Uri.EscapeDataString` (les séparateurs `/`, `:` et `=` d'une valeur ne peuvent donc pas créer de collision), ordre des paramètres significatif. Même entrée → même octet de clé, toujours.

### Régénération statique depuis l'extérieur — reprise de la pièce jointe

Chaque service qui met en cache obtient une classe compagnon `apps/api/Modules/<Domain>/Services/<Service>Keys.cs` :

```csharp
public static class PostQueryServiceKeys {
	public static string FindPostsKey(Guid tenantId, string cursor, int size) =>
		CacheKeys.ForTenant(tenantId, nameof(PostQueryService), nameof(PostQueryService.FindPostsAsync),
			("cursor", cursor), ("size", size));
}
```

La méthode de service utilise exactement cette méthode statique pour composer sa clé, et n'importe quel extérieur (job Quartz, futur backoffice staff) régénère la même chaîne pour invalider sans dupliquer la logique. Source unique : `CacheKeys` + les classes `*Keys`.

### Les portées sont des enveloppes, pas de la discipline

Trois enveloppes dans `apps/api/Lib/Caching/`, enregistrées dans `CacheRegistration` (le scanner `[Service]` est réservé à `Modules.*.Services`, ces classes vivent en `Lib` et s'enregistrent manuellement) :

- `TenantScopedCache` (**scoped**) : construite depuis `IRequestAuthContext` ; son constructeur jette si le tenant résolu est vide — une requête sans tenant ne peut pas mettre en cache silencieusement en portée globale. N'expose que `GetOrCreateAsync<T>(string subKey, ...)`, `GetAsync<T>`, `SetAsync<T>`, `RemoveAsync(string subKey)`, tous composés `t/<tenantId>/<subKey>`. Impossible d'y passer un tenant : il n'existe pas de paramètre pour ça.
- `UserScopedCache` (scoped, même forme, préfixe `u/<userId>/`) pour le périmètre par utilisateur (permissions staff).
- `GlobalCache` (singleton, préfixe `g/`) pour les données vraiment partagées.

Un service métier ne voit jamais la classe `HybridCache` : les enveloppes sont le seul chemin. Oublier le tenant devient structurellement impossible — il n'y a aucun site d'appel où l'oubli pourrait se produire.

## Gardes (échouent tôt, échouent fort)

1. **Garde d'étanchéité** — `apps/api/Lib/Architecture/CacheKeyScopeGuard.Spec.cs` : via `ArchitectureDiscovery.EnumerateApiTypes()` (le point d'entrée réflexif imposé aux nouveaux gardes d'architecture, `develop:apps/api/Lib/Architecture/ArchitectureDiscovery.cs` symbole `ArchitectureDiscovery`, preuve `git show origin/develop:apps/api/Lib/Architecture/ArchitectureDiscovery.cs | sed -n '13p'`, citations-r1 C11) :
   - tout type sous `Modules.*` dont un constructeur injecte `HybridCache` (nu ou indexé) est un échec, sauf inscription explicite dans la liste blanche du fichier de spéc (initialement : aucune entrée métier ; les enveloppes de `Lib/Caching` et les futures surfaces `StaleSurfaces` consomment l'indexé et sont tracées par le registre) ;
   - toute injection `[FromKeyedServices(CacheNames.StaleTolerant)]` dont le type déclarant n'apparaît pas dans `StaleSurfaces.Allowed` est un échec.
2. **Registre des surfaces périmé-autorisées** — `apps/api/Lib/Caching/StaleSurfaces.cs` : liste statique d'entrées `(Type DeclaringType, string Justification, DateOnly DecisionDate)`, vide à la création. Chaque activation future est une ligne écrite ici, citée dans la PR de la surface. Le garde 1 assujettit ce registre.
3. **Garde de fabrique** — specs unitaires de `CacheKeys` : refus de `Guid.Empty` en portée locataire/utilisateur, refus d'une sous-clé commençant par un préfixe de portée (anti double-préfixe), déterminisme octet-par-octet, non-collision sur valeurs piégées (`"a:b/c=d"`).
4. **Garde fail-safe** — `apps/api/Lib/Caching/CacheEntryOptionsDefaults.cs` expose deux fonctions pures `CreateDefault()` et `CreateStaleTolerant()` utilisées par l'enregistrement ; leur spéc épingle `AllowFailSafeResponse = false` côté défaut et les plafonds fail-safe côté StaleTolerant. Une dérive des options d'enregistrement casse la spéc avant de casser la règle maison.

## Protection contre l'avalanche

Fournie par FusionCache (protection stampede locale aujourd'hui, distribuée le jour du locker Redis). Aucune réécriture maison — c'est le trou que la pièce jointe n'avait pas et la raison principale du choix du moteur. Rien à coder ; le plan l'interdit simplement.

## Sérialisabilité (décision 6 ratifiée)

- `apps/api/Lib/Caching/CachePayloadTypes.cs` : liste statique des types de charge utiles mis en cache (`IReadOnlyList<Type>`).
- `apps/api/Lib/Caching/CachePayloadSerializationContract.Spec.cs` : pour chaque type de la liste, aller-retour réel via `FusionCacheSystemTextJsonSerializer` (le même sérialiseur que le jour L2) + égalité profonde (records) + règles structurelles par réflexion : record scellé, constructeur public, aucun membre typé par interface/abstrait, aucun `DateTime` (uniquement `DateTimeOffset`), aucun dictionnaire à clé non-string. Tout nouveau type mis en cache DOIT s'ajouter à la liste — chaque tâche de cible ci-dessous porte cette étape explicitement, et l'étape 4 du modèle de cible fait tourner cette spéc.
- Sans ce test, la promesse « migration sans refactor » est fausse : un objet vivant en mémoire seule casse en silence au passage Redis.

## Contraintes globales

1. **Conventions maison** : `PUBLY0001–0008` (pas de `!`, pas de `?? throw`, pas de `ToLower()` de dispatch) ; lignes ≤ 100 caractères ; accolades systématiques ; specs co-localisées `*.Spec.cs` nommées `ItShould{Attendu}{Connecteur}{Scénario}` ; namespace = chemin de dossier (`IDE0130` en erreur).
2. **Enregistrement DI** : `apps/api/Lib/Caching/CacheRegistration.cs` expose `AddPublyCache(this IHostApplicationBuilder builder)` ; appelé depuis `AddAppServices` (`develop:apps/api/Lib/ServiceRegistration.cs` symbole `AddAppServices`, ligne 211, citations-r1 C8), donc disponible dans TOUS les rôles — le worker appelle aussi `AddAppServices` (`develop:apps/api/Program.cs` ligne 174 dans `CreateWorkerHostBuilder`, citations-r1 C9). Les jobs Quartz peuvent ainsi invalider dès la première cible qui le demande.
3. **Versions** : centralisées dans `Directory.Packages.props` (CMM activé, `ManagePackageVersionsCentrally` ligne 4 et `CentralPackageTransitivePinningEnabled` ligne 7, citations-r1 C4) ; le csproj référence sans attribut `Version` (même forme que `<PackageReference Include="Polly" />` ligne 44, citations-r1 C5).
4. **Aucune variable d'environnement nouvelle** : durées et plafonds sont des constantes lisibles dans `CacheEntryOptionsDefaults`. Un bouton `CACHE_*_SECONDS` ne sera ajouté que le jour où une surface en a démontré le besoin (cohérence avec le triage YAGNI de #58).
5. **Pas de migration, pas de changement de contrat OpenAPI** dans le socle. Les cibles StaleTolerant ajouteront `generated_at_utc` à LEUR DTO, ce qui repassera par `just build-api && just generate-client && pnpm --filter front typecheck`.
6. **Honnêteté des citations** : ce plan ne cite aucun numéro de ligne d'une branche en vol. Les références develop portent `branche:chemin` + symbole + commande `git grep -n`/`git show | sed -n`, prouvées dans `.dump/citations-r1.md` (14 citations, toutes PASS au tip `198a6e4b7`).

## Structure de fichiers (socle, tâche 2)

Créations :
- `apps/api/Lib/Caching/CacheNames.cs`
- `apps/api/Lib/Caching/CacheKeys.cs` + `CacheKeys.Spec.cs`
- `apps/api/Lib/Caching/CacheRegistration.cs`
- `apps/api/Lib/Caching/CacheEntryOptionsDefaults.cs` + `.Spec.cs`
- `apps/api/Lib/Caching/StaleSurfaces.cs` + `StaleSurfacesGuard` intégré au point 1
- `apps/api/Lib/Caching/CachedResult.cs`
- `apps/api/Lib/Caching/TenantScopedCache.cs` + `.Spec.cs`
- `apps/api/Lib/Caching/UserScopedCache.cs` + `.Spec.cs`
- `apps/api/Lib/Caching/GlobalCache.cs` + `.Spec.cs`
- `apps/api/Lib/Caching/CachePayloadTypes.cs`
- `apps/api/Lib/Caching/CachePayloadSerializationContract.Spec.cs`
- `apps/api/Lib/Architecture/CacheKeyScopeGuard.Spec.cs`

Modifications :
- `Directory.Packages.props` : deux `PackageVersion` (§ Choix de moteur).
- `apps/api/PublyApp.Api.csproj` : deux `PackageReference` sans version.
- `apps/api/Lib/ServiceRegistration.cs` : un appel `builder.AddPublyCache();` dans `AddAppServices`.
- `.env.example` : **aucun changement** (contrainte 4).

---

# Tâches

Chaque tâche produit un livrable testable indépendamment, relu et rejetable seule. Une tâche qui ne compile pas seule ou dont la preuve dépend d'une autre tâche non fusionnée est mal dimensionnée : la découper.

## Tâche 1 — Instrumenter, puis désigner 3–5 cibles réelles

**Pourquoi d'abord** : mettre en cache au hasard ne rapporte que des risques d'invalidation (arbitrage propriétaire). Aucun code de cache dans cette tâche.

**Travail :**
1. `apps/api/Program.cs` — dans `ConfigureHttpPipeline`, ajouter `app.UseSerilogRequestLogging(...)` : UNE ligne résumée par requête (méthode, chemin, statut, durée en ms via `MessageTemplate` dédié, identifiant de session JAMAIS loggé — règle anti-secret maison). C'est exactement l'ajout que le code actuel annonce comme délibérément différé (`develop:apps/api/Lib/Extensions/LoggerConfigExtensions.cs` lignes 80–84 : « If per-request visibility is wanted later, add it deliberately as ONE summary line per request (UseSerilogRequestLogging) », citations-r1 C10).
2. `apps/api/Lib/Diagnostics/SlowCommandLogInterceptor.cs` — `DbCommandInterceptor` Serilog qui journalise toute commande dépassant 150 ms (`CommandEnd` : texte SQL tronqué à 500 caractères sans paramètres sensibles, durée). Branché dans la configuration du `DbContext` (intercepteurs EF).
3. `apps/api/Lib/Diagnostics/SlowCommandLogInterceptor.Spec.cs` — unitaire : une fausse commande de 200 ms produit l'événement avec sa durée ; 20 ms n'en produit pas ; seuil exact 150 ms.

**Preuve de mesure (livrable)** : exécution locale `just build-api && just db-migrate && just dev-api`, trafic généré sur les surfaces candidates (liste ci-dessous), sorties collées dans `.dump/measurements.md` : par surface, nombre d'appels, p50/p95 des durées de requête HTTP, commandes SQL lentes attrapées par l'intercepteur. La désignation des 3–5 cibles (critères : fréquence × coût mesuré × clarté de l'invalidation) est publiée en commentaire sur #58 (`gh issue comment 58 --repo PublyApp/publyapp --body-file .dump/designation.md`) — décision datée, traçable.

**Candidates actuelles (à départager par la mesure, pas à la place d'elle) :**
- Résolution des permissions staff : `PermissionFilter` appelle `IPermissionService.GetPermissionsAsync(userId)` à CHAQUE requête non-admin (`develop:apps/api/Lib/Filters/PermissionFilter.cs` ligne 53, citations-r1 C2 ; symbole `GetPermissionsAsync` déclaré ligne 12 et implémenté ligne 67 de `develop:apps/api/Modules/Permissions/Services/PermissionService.cs`, citations-r1 C3). Périmètre utilisateur (`u/`), invalidation aux mutations de permissions.
- Listes locataires paginées (posts, audit-logs, messagerie) selon ce que mesure l'intercepteur SQL.
- Lectures de comptes sociaux dans le worker de publication (le cache est résolvable côté worker, contrainte 2).

**Indépendance** : l'intercepteur + la ligne de requête se relisent et se rejettent seuls, sans le socle.

## Tâche 2 — Socle (fusionnable en sous-PR relisibles séparément)

**2a — Paquets et enregistrement.** `Directory.Packages.props` + csproj + `CacheRegistration.cs` :

```csharp
public static IHostApplicationBuilder AddPublyCache(this IHostApplicationBuilder builder) {
	builder.Services.AddFusionCache()
		.WithSerializer(new FusionCacheSystemTextJsonSerializer())
		.WithOptions(o => o.DefaultEntryOptions = CacheEntryOptionsDefaults.CreateDefault())
		.AsHybridCache();

	builder.Services.AddFusionCache(CacheNames.StaleTolerant)
		.WithSerializer(new FusionCacheSystemTextJsonSerializer())
		.WithOptions(o => {
			o.CacheName = CacheNames.StaleTolerant;
			o.DefaultEntryOptions = CacheEntryOptionsDefaults.CreateStaleTolerant();
		})
		.AsKeyedHybridCache(CacheNames.StaleTolerant);

	builder.Services.AddScoped<TenantScopedCache>();
	builder.Services.AddScoped<UserScopedCache>();
	builder.Services.AddSingleton<GlobalCache>();
	return builder;
}
```

(Signature exacte de l'enregistrement nommé à ajuster au compile-time contre la doc `NamedCaches`/`DependencyInjection` de 2.7.1 — l'intention est celle-ci, le compilateur tranche la syntaxe.) Spéc d'intégration légère : résoudre `HybridCache` nu ET `[FromKeyedServices(CacheNames.StaleTolerant)] HybridCache` depuis le graphe réel de l'ApiFactory réussit ; `IFusionCache` nommé résout sur la même instance que l'indexé.

**2b — Fabrique de clés + enveloppes de portée.** Fichiers § Structure. Specs unitaires : déterminisme, échappement anti-collision, refus `Guid.Empty`, anti double-préfixe, égalité clé-runtime/clé-régénérée-statiquement.

**2c — Politique fail-safe.** `CacheEntryOptionsDefaults.CreateDefault()` : `AllowFailSafeResponse = false`, `Duration = 10 minutes`, `SizeLimit = 100_000`. `CreateStaleTolerant()` : `AllowFailSafeResponse = true`, `FailSafeMaxDuration = 30 minutes`, `FailSafeThrottleDuration = 1 minute`. Spéc qui épingle les six valeurs. Spéc comportementale sur le graphe DI réel : valeur semée puis expirée via `IFusionCache` + usine qui jette → le défaut PROPAGE l'exception, le StaleTolerant RETOURNE le périmé (preuve que l'interdit par défaut tient vraiment, pas juste écrit dans des options).

**2d — Garde d'étanchéité + registre.** `CacheKeyScopeGuard.Spec.cs` + `StaleSurfaces.cs` (vide). Preuve que le garde sait échouer : ajouter temporairement un faux service `Modules` injectant `HybridCache` nu → spéc rouge → retirer → verte (transcript dans `.dump/proof-red.md` de la lane, md5 avant/après).

**2e — Contrat de sérialisation.** `CachePayloadTypes` + spec aller-retour (vide au départ, la spéc documente la procédure d'ajout et échoue si la liste contient un type non sérialisable).

**2f — Enveloppe de fraîcheur.** `CachedResult<T>` + sa propre entrée au contrat de sérialisation (elle-même doit survivre au L2).

**Indépendance** : 2a–2f se relivent chacun seul ; 2b/2c/2e/2f n'ont aucun consommateur métier encore — leurs specs suffisent.

## Tâche 3 — Cibles désignées, une par une (modèle identique par cible, exécutée dans des PR séparées)

Pour chaque surface S désignée par la tâche 1 :

1. **Clés** : créer `apps/api/Modules/<Domain>/Services/<Service>Keys.cs` (régénération statique) + spéc d'égalité avec la clé runtime. Sans ça, pas d'étape 3.
2. **Lecture** : rewirer la lecture de S par l'enveloppe de portée correcte (`TenantScopedCache`/`UserScopedCache`/`GlobalCache`), TTL choisi dans les mesures de la tâche 1 (jamais « une bonne durée » — la durée citée vient de `.dump/measurements.md`). Ajouter le type de charge à `CachePayloadTypes` et faire tourner le contrat de sérialisation.
3. **Invalidation** : à CHAQUE site de mutation touchant les données de S (trouvé par `git grep -n "<Entity>" -- apps/api/Modules/*/Handlers apps/api/Modules/*/Services`), appeler `RemoveAsync(<Service>Keys.<Méthode>Key(...))`. La liste des sites figure dans la description de la PR de S.
4. **Preuve d'invalidation (obligatoire, RED d'abord)** : spéc d'intégration `ItShouldServeFreshDataAfterMutationWhenCached` — lire (miss→factory), muter par l'API publique, relire : données fraîches. Prouver qu'elle teste quelque chose : commenter l'appel d'invalidation → spéc rouge → restaurer → verte, md5 avant/après dans `.dump/proof-red.md`. Une cible sans cette preuve n'est pas fusionnée.
5. **Si S est périmé-autorisée** (inscription à `StaleSurfaces` votée dans la PR) : stockage en `CachedResult<T>`, projection `generated_at_utc` dans le DTO, `just build-api && just generate-client && pnpm --filter front typecheck`, affichage « données du JJ/MM à HH:mm » côté `apps/front` (composant état approprié, i18n EN+FR), et spéc front affirmant le rendu du champ.

**Première cible attendue** (si la mesure confirme le coût) : la résolution des permissions staff — périmètre `u/`, invalidation depuis chaque mutation du module Permissions, preuve par le modèle ci-dessus. Elle sert d'étalon de revue pour les suivantes.

## Hors périmètre (ratifié)

Redis en L2, backplane, locker distribué : décision de déploiement Dokploy séparée. Output caching, response caching, cache côté front : autres sujets. Boutons d'environnement `CACHE_*` : différés jusqu'à besoin démontré. Le socle est volontairement L1-seul : le jour du L2, seuls `CacheRegistration` et le déploiement changent — les sites d'appels, eux, ne bougent pas, parce que le contrat de sérialisation a été tenu dès le premier jour.

## Risques et parades

| Risque | Parade |
|---|---|
| Façade `HybridCache` trop étroite pour un besoin futur | Échappatoire déjà désignée : `AsKeyedHybridCache` d'autres noms, ou bascule d'UNE surface vers `IFusionCache` — une ligne d'enregistrement, aucun appelant touché |
| Dérive vers du fail-safe sauvage | Garde d'étanchéité + registre `StaleSurfaces` + spéc d'options ; trois verrous indépendants |
| Clé collisionnante | Échappement URI des valeurs, spéc de non-collision, format figé |
| Charge non sérialisable découverte au jour L2 | Contrat de sérialisation exécuté à chaque nouvelle charge, sérialiseur identique à celui du L2 |
| Stampede multi-nœuds au jour L2 sans backplane | Hors périmètre du socle ; noté pour la décision de déploiement (FusionCache fournit locker + backplane le moment venu) |

## Références

- Issue #58 : analyse de la pièce jointe (commentaire du 2026-08-26T11:00:44Z) et arbitrage propriétaire (2026-08-26T11:35:00Z).
- Pièce jointe : conversation « I need a Cache solution for my ASP .NET minimal API » — idées conservées : fabrique de clés déterministe sans réflexion (`nameof(Service)::nameof(Method)` + paramètres) et régénération statique depuis l'extérieur ; idée écartée : l'abstraction `IAppCache` manuscrite (supplantée par `HybridCache`) et l'invalidation par liste de préfixes (supplantée par les tags FusionCache le jour du besoin).
- Citations develop : `.dump/citations-r1.md` (tip `198a6e4b7`, 16/16 PASS dont 2 vérifications NuGet ajoutées en validation post-livraison).
- FusionCache 2.7.1 : releases GitHub (v2.7.1 « Latest », 2026-08-20) ; `docs/MicrosoftHybridCache.md` (`AsHybridCache`, `AsKeyedHybridCache`, configuration au démarrage uniquement) ; licence MIT. Pages NuGet des deux paquets (versions relevées 2026-08-26) : [FusionCache 2.7.1](https://www.nuget.org/packages/ZiggyCreatures.FusionCache) et [Serialization.SystemTextJson 2.7.0](https://www.nuget.org/packages/ZiggyCreatures.FusionCache.Serialization.SystemTextJson).
