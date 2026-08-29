# Plan — #1556 : exposer le total des listes paginées par curseur (`includeTotalCount`)

- **Issue** : #1556 (`Closes #1556`)
- **Part of** : #282 (suite de #1549)
- **Branche** : `lane/wt-1556` (sur `develop` `91d5539fe`, arbre propre)
- **Livrable** : ce plan + PR vers `develop` disant `Closes #1556` et `Part of #282`.
- **Modèle de rédaction** : `tencent/hy3:free` (Nous Portal, effort high). File lourde via
  `~/ai-orchestration-playbook/tools/heavy.sh`. Pas d'e2e locale (CI front-e2e 4/4).
  Pas de sous-agents (`opencode`/`claude`/`codex` bloqués, exit 86).

## Décision appliquée (arbitrage propriétaire, 2026-08-26)

Le total voyage **dans la même réponse de liste**, calculé à la demande via le drapeau de
requête **`includeTotalCount`** (défaut `false`). Pas d'endpoint de comptage séparé. Si
`includeTotalCount=true`, la réponse porte `totalCount` ; sinon le champ est **absent** —
l'état « total inconnu » reste atteignable, mais seulement quand le client a choisi de ne pas
le demander (jamais par défaut de contrat). Les lignes et le total sont dérivés de **la même
spécification de filtre** (un seul constructeur de prédicat consommé par les deux requêtes),
ce qui rend la dérive structurellement impossible.

> Aucune objection mesurée ne contredit cette décision. Le seul coût réel (comptage du journal
> d'audit) est traité en section « Coût du comptage » ; il reste acceptable, mesuré en section
> dédiée, pas estimé.

## Cartographie des endpoints (recensement ré-vérifié contre `91d5539fe`)

Le recensement `.dump/recensement-282.md` a été écrit contre `198a6e4b7`. Ré-vérifié contre le
tip courant : **aucune nouvelle surface curseur n'est apparue**, et les deux types
`CursorPaginatedResult` non consommés par le front (`SystemNotices`, `SocialAccounts`) restent
hors périmètre (pas de route front qui les appelle — `git grep` l'a confirmé). Les **10
endpoints à couvrir** (les 11 du recensement moins le tiroir d'assignation, tranché en
section « Cas à trancher ») :

| # | Endpoint (route) | Handler (fichier:symbole) | Service (fichier:symbole) | DTO requête | DTO réponse | Point de partage du prédicat (filtré, pré-curseur) |
|---|---|---|---|---|---|
| 1 | `GET /staff/audit-logs` | `apps/api/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs:FindAuditLogs` | `apps/api/Modules/AuditLogs/Services/AuditLogQueryService.cs:AuditLogQueryService.FindAsync` | `FindAuditLogsQuery` (`CursorPaginatedQuery`) | `FindAuditLogsResponse : CursorPaginatedResult<AuditLogListItem>` | `ApplyFilters(query, …)` sur `BaseQuery()` → `query` ; `COUNT` sur ce `query`, avant `handler.ApplyFilter` |
| 2 | `GET /staff/tenants` | `apps/api/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs:FindTenantsAsStaff` | `apps/api/Modules/Tenants/Services/TenantAsStaffService.cs:FindTenantsAsStaffAsync` | `FindTenantsAsStaffQuery` (search, status) | `FindTenantsAsStaffResponse : CursorPaginatedResult<TenantAsStaffListItem>` | `baseQuery` après `Where(t => search)` / `Where(t => statuses.Contains)` ; `COUNT` avant `handler.ApplyFilter` |
| 3 | `GET /staff/profiles` | `apps/api/Modules/Profiles/Handlers/Staff/FindStaffProfiles.cs:FindStaffProfiles` | `apps/api/Modules/Profiles/Services/StaffProfileQueryAsStaffService.cs:FindStaffProfilesAsync` | `FindStaffProfilesQuery` | `FindStaffProfilesResult : CursorPaginatedResult<StaffProfileItem>` | `query` après `query.Where(p => …)` ; `COUNT` avant `handler.ApplyFilter` |
| 4 | `GET /staff/users` | `apps/api/Modules/Users/Handlers/Staff/FindStaffUsers.cs:FindStaffUsers` | `apps/api/Modules/Users/Services/StaffUserQueryService.cs:FindStaffUsersAsync` | `FindStaffUsersQuery` | `FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem>` | `query` après filtres ; `COUNT` avant `handler.ApplyFilter` |
| 5 | `GET /staff/invitations` | `apps/api/Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs:FindStaffInvitations` | `apps/api/Modules/Invitations/Services/InvitationQueryService.cs:FindStaffInvitationsAsync` | `FindStaffInvitationsQuery` | `FindStaffInvitationsResult : CursorPaginatedResult<InvitationListItem>` | `query` après `Where(inv => Scope==Staff && …)` ; `COUNT` avant `handler.ApplyFilter` |
| 6 | `GET /staff/tenants/{tenantId}/users` | `apps/api/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs:FindTenantUsersAsStaff` | `apps/api/Modules/Users/Services/TenantUserQueryService.cs:FindTenantUsersAsync` | `FindTenantUsersAsStaffQuery` | `FindTenantUsersAsStaffResponse : CursorPaginatedResult<TenantUserItem>` | `query` après filtres ; `COUNT` avant `handler.ApplyFilter` |
| 7 | `GET /staff/tenants/{tenantId}/invitations` | `apps/api/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs:FindInvitationsForTenantAsStaff` | `apps/api/Modules/Invitations/Services/InvitationQueryService.cs:FindTenantInvitationsAsync` | `FindInvitationsForTenantAsStaffQuery` | `FindInvitationsForTenantAsStaffResult : CursorPaginatedResult<StaffTenantInvitationListItem>` | `query` après filtres tenant ; `COUNT` avant `handler.ApplyFilter` (variante tenant) |
| 8 | `GET /staff/tenants/{tenantId}/profiles` | `apps/api/Modules/Profiles/Handlers/Staff/FindTenantProfilesAsStaff.cs:FindTenantProfilesAsStaff` | `apps/api/Modules/Profiles/Services/TenantProfileQueryAsStaffService.cs:FindTenantProfilesAsync` | `FindTenantProfilesAsStaffQuery` | `FindTenantProfilesAsStaffResult : CursorPaginatedResult<TenantProfileItem>` | `query` après `Where(p => …)` ; `COUNT` avant `handler.ApplyFilter` |
| 9 | `GET /staff/tenant-users/{userId}/companies` | `apps/api/Modules/Users/Handlers/Staff/FindTenantUserCompaniesForStaff.cs:FindTenantUserCompaniesForStaff` | `apps/api/Modules/Users/Services/TenantUserCompanyQueryService.cs:FindTenantUserCompaniesForStaffAsync` | `FindTenantUserCompaniesForStaffQuery` | `FindTenantUserCompaniesForStaffResult : CursorPaginatedResult<TenantUserCompanyForStaffResult>` | `query` après filtres ; `COUNT` avant `handler.ApplyFilter` |
| 10 | `GET /posts` | `apps/api/Modules/Posts/Handlers/Tenant/FindPostsForTenant.cs:FindPostsForTenant` | `apps/api/Modules/Posts/Services/PostService.cs:FindForTenantAsync` | `FindPostsForTenantQuery` | `FindPostsForTenantResponse : CursorPaginatedResult<PostListItem>` | `query` après `Where(p => ILike(…))` ; `COUNT` avant `handler.ApplyFilter` |

> Cas à trancher explicitement (section dédiée, pas passés sous silence) :
> - **Tiroir d'assignation de membres** (`_assign-members-table.tsx`, curseur) :
>   exclusion argumentée (réutilise le même endpoint #6 en sous-ensemble ; voir section).
> - **Intégrations connectées** (`settings/integrations.tsx`) : pas de vrai pagineur
>   (`hasNextPage:false` codé en dur) — exclusion argumentée.

## Preuve des symboles et numéros de ligne (citation)

Toutes les citations ci-dessus sont des **noms de symbole + chemins sur le tip `develop`
`91d5539fe`**, vérifiables par `git grep -n` (aucun numéro de ligne sur branche en vol). La
preuve complète (sorties `git show … | sed -n`) est consignée dans
`.dump/citations-r1.md` au fil de l'avancement ; aucun commit ne sera fait tant qu'une ligne
y est `FAIL`.

Re-vérification indépendante au moment de la livraison (arbre `lane/wt-1556` aligné sur
`origin/develop` `91d5539fe`) — **12 PASS / 0 FAIL** (10 endpoints + `ApplyFilters` d'audit + `ApplyFilter@206`) — via `git grep -n` :

| # | Symbole / ancrage | Preuve `git grep -n` (sur `origin/develop`) |
|---|---|---|
| 1 | `FindAuditLogs` (+ `ApplyFilters` l.406, `handler.ApplyFilter` l.206) | `git grep -n "public sealed class FindAuditLogs" origin/develop -- apps/api/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs` ; `git grep -n "private static IQueryable<AuditLog> ApplyFilters" origin/develop -- apps/api/Modules/AuditLogs/Services/AuditLogQueryService.cs` ; `git grep -n "handler.ApplyFilter" origin/develop -- apps/api/Modules/AuditLogs/Services/AuditLogQueryService.cs` |
| 2 | `FindTenantsAsStaffAsync` + filtres search/status (l.409/416), `ApplyFilter` (l.425) | `git grep -n -e "ILike(t.Name" -e "statuses.Contains(t.Status)" -e "handler.ApplyFilter(baseQuery" origin/develop -- apps/api/Modules/Tenants/Services/TenantAsStaffService.cs` |
| 3 | `FindStaffProfilesAsync` + `ILike(p.Name)` (l.328), `ApplyFilter` (l.351) | `git grep -n -e "ILike(p.Name" -e "query = handler.ApplyFilter(query" origin/develop -- apps/api/Modules/Profiles/Services/StaffProfileQueryAsStaffService.cs` |
| 4 | `FindStaffUsersAsync` + filtres (l.441), `ApplyFilter` (l.464) | `git grep -n -e "from ua in query" -e "query = handler.ApplyFilter(query" origin/develop -- apps/api/Modules/Users/Services/StaffUserQueryService.cs` |
| 5 | `FindStaffInvitationsAsync` + `Scope == InvitationScope.Staff` (l.338), filtres (l.342), `ApplyFilter` (l.357) | `git grep -n -e "Scope == InvitationScope.Staff" -e "query = query.Where(inv" -e "handler.ApplyFilter(query" origin/develop -- apps/api/Modules/Invitations/Services/InvitationQueryService.cs` |
| 6 | `FindTenantUsersAsync` + filtres (l.417–446), `ApplyFilter` (l.458) | `git grep -n -e "EF.Functions.ILike(ua.User.FirstName" -e "query = query.Where(ua => levels.Contains" -e "query = handler.ApplyFilter(" origin/develop -- apps/api/Modules/Users/Services/TenantUserQueryService.cs` |
| 7 | `FindTenantInvitationsAsync` + `Scope == InvitationScope.Tenant && TenantId` (l.459) | `git grep -n -e "Scope == InvitationScope.Tenant" origin/develop -- apps/api/Modules/Invitations/Services/InvitationQueryService.cs` |
| 8 | `FindTenantProfilesAsync` + `ILike(p.Name)` (l.318), `IsDefault` (l.324), `ApplyFilter` (l.333) | `git grep -n -e "ILike(p.Name" -e "query = query.Where(p => p.IsDefault" -e "query = handler.ApplyFilter(query" origin/develop -- apps/api/Modules/Profiles/Services/TenantProfileQueryAsStaffService.cs` |
| 9 | `FindTenantUserCompaniesForStaffAsync` + `ILike(row.Tenant.Name)` (l.392), `ApplyFilter` (l.422) | `git grep -n -e "ILike(row.Tenant.Name" -e "query = handler.ApplyFilter(" origin/develop -- apps/api/Modules/Users/Services/TenantUserCompanyQueryService.cs` |
| 10 | `FindForTenantAsync` + `TenantId == tenantId` (l.253), `ILike` (l.260), `ApplyFilter` (l.273) | `git grep -n -e "p.TenantId == tenantId" -e "EF.Functions.ILike(" -e "query = handler.ApplyFilter(" origin/develop -- apps/api/Modules/Posts/Services/PostService.cs` |

Ancrages transverses vérifiés :
- `CursorPaginatedResult<T>` (`apps/api/Lib/CursorPaginatedResult.cs:7`) et `CursorPaginatedQuery`
  (`apps/api/Lib/CursorPaginatedQuery.cs:5`) existent et sont la base héritée des DTO.
- Front : `apps/front/src/components/table/data-table.tsx` expose `DataTableCursorFooter` avec
  `totalCount?: number | null` (l.114) et la branche `range-of-counted` (l.169) — le pied gère
  déjà `totalCount` absent comme « inconnu ».
- Section 6a : `apps/front/src/routes/authed/staff/tenants/$tenantId/profiles/$profileId/_assign-members-table.tsx` existe.
- Section 6b : `apps/front/src/routes/authed/tenant/settings/integrations.tsx` porte
  `hasNextPage: false` (l.300) — confirmation qu'aucun vrai pagineur curseur n'est en place.
- Hors périmètre — vérification corrigée (relecture livraison) : `SystemNotices` n'a **aucune**
  route front qui l'appelle (seul un test wire `folded-body-wire.test.tsx` référence `SystemNotice`).
  `SocialAccounts` est **bien** consommé par une route front
  (`apps/front/src/routes/authed/tenant/settings/integrations.tsx`, via `useSocialAccountsQuery`
  qui renvoie `CursorPaginatedResult<SocialAccountListItem>`), mais cette route le rend **non
  paginé** (`hasNextPage:false` codé en dur, cf. section 6b). Il n'y a donc pas de surface curseur
  où exposer `totalCount` : la décision de hors-périmètre #1556 tient. Seule la rationale « aucune
  route front les appelle » du plan d'origine est inexacte pour `SocialAccounts` (elle est juste
  pour `SystemNotices`) — signalé ici plutôt que maquillé.

- **Correction de libellés de route (relecture livraison)** : deux routes de la carte des
  endpoints (héritées du plan d'origine) étaient erronées et ont été corrigées :
  - **#9** était `GET /staff/tenant-users/{userId}/organizations` → en réalité
    `GET /staff/tenant-users/{userId}/companies` (l'endpoint est `FindTenantUserCompaniesForStaff`,
    `Routes.Users.ForTenantUsersAsStaff.FindCompanies = "/{userId}/companies"`).
  - **#10** était `GET /tenant/posts/drafts` → en réalité `GET /posts` (le groupe tenant n'a **pas**
    de préfixe `/tenant`, `Routes.Tenant.Root = "/"` ; `Posts.ForTenant.Root = "/posts"`,
    `Find = "/"`, et aucun segment `drafts` n'existe dans le module Posts).
  Les symboles handler/service des deux étaient corrects ; seuls les libellés de route étaient
  faux. Les handlers/restent valides (vérifiés par `git grep` sur `origin/develop`).

## 2. Anti-dérive : le cœur du chantier

### Principe structurel

Pour chaque endpoint, **les lignes et le total partagent la même `IQueryable` filtrée** jusqu'au
point où le curseur s'applique. Concrètement :

1. On construit `filteredQuery` = base + tous les filtres de liste (recherche, statut, dates,
   scope, tenant…). C'est le **point de partage unique**.
2. Le total = `await filteredQuery.CountAsync(ct)` — **jamais** de `Take`, jamais de
   `ApplyFilter` curseur, jamais de projection join.
3. Les lignes = `filteredQuery` → `handler.ApplyFilter(filteredQuery, cursorValue, isAsc)` →
   `Take(limit+1)` → projection → `ToListAsync`.

Ainsi le total et les lignes sont dérivés du **même arbre d'expression** `filteredQuery`. Toute
future évolution d'un filtre se propage aux deux. La dérive devient impossible *par
construction*, pas surveillée.

### Le test anti-dérive (interroge l'artefact réel, pas une forme)

Le défaut dominant de ce dépôt est un garde qui lit une *forme* (regex sur le code, descripteur
de modèle) au lieu du *contenu réel exécuté*. Le test ci-dessous interroge le **service réel**
(`IAuditLogQueryService.FindAsync` exécuté contre la base de test Testcontainers), donc il
rougit si les deux requêtes empruntent un chemin de filtre distinct.

**Spécification (un test par endpoint, motif identique) — exemple sur le journal d'audit `#1` :**

- Semer N lignes avec un filtre discriminatoire (ex. `Action = "LOGIN"` sur K<N d'entre elles,
  plus d'autres actions).
- Appeler `FindAsync(args avec includeTotalCount:true)`.
- `result` est `Success`.
- `result.Data.Data.Count` = `min(limit, K)` (les lignes respectent le filtre).
- `result.Data.TotalCount` = `K` (le total respecte le **même** filtre).
- **Assertion de dérive** : `result.Data.TotalCount` == nombre d'entités dans la base qui
  satisfont `filteredQuery` *tel qu'exécuté*. On ne compare pas à une constante devinée : on
  rejoue la même `IQueryable` via le service en `limit = int.MaxValue` et on compte — les deux
  doivent être égaux. Si le total utilisait un chemin de filtre différent (ex. oubli du filtre
  `actions`), `TotalCount` divergerait de ce recount et le test rougit.

Le test vit dans le `.Spec.cs` de chaque handler (co-localisé, `*.Spec.cs`), utilise la
`ApiFixture` existante (Testcontainers Postgres), et s'appuie sur `FindAsync` directement — pas
sur un mock ni sur une regex de source.

### Mutation adverse (la bonne)

Pour prouver que le test *capte* le bug et n'est pas un passoire, on applique la mutation
suivante **sur une copie locale temporaire** pendant la revue (jamais committée) :

- **Mauvaise mutation** : « supprimer le partage » (réécrire le total avec une requête
  indépendante). Elle casse la structure mais ne prouve rien sur le *filtre*.
- **Bonne mutation** : « ajouter un filtre *supplémentaire* sur la requête des lignes seulement »
  (ex. `query = query.Where(a => a.Action == "LOGIN")` après le partage, juste avant le
  `Take`). Le total reste calculé sur `filteredQuery` (sans ce filtre), donc `TotalCount !=
  count des lignes filtrées` → le test de dérive rougit. C'est exactement le bug silencieux
  que le propriétaire veut interdire (un total qui ne correspond pas aux lignes affichées).

Chaque endpoint portera son propre `.Spec.cs` anti-dérive ; la mutation adverse est rejouée sur
un endpoint témoin lors de la revue pour confirmer que le filet fonctionne.

## 3. Coût réel du comptage sur le journal d'audit (mesuré, pas estimé)

> La mesure est exécutée via `heavy.sh` sur une base Testcontainers seedée de 5000 lignes
> d'audit, en comparant `FindAsync` (lignes seules) et un `COUNT(*)` sur la requête filtrée
> (`AsNoTracking` + `!IsDeleted`, sans `Take`, sans `ApplyFilter`, sans projection join — le
> chemin exact du total). Sortie collée dans `.dump/measure-audit-count.md` et rappelée ici :

```
Passed PublyApp.Api.Modules.AuditLogs.Handlers.Staff.BenchmarkCountCostSpec.MeasureAuditLogCountCost [27 s]
BENCH rows=5000 lines_only_avg_ms=18.8 exact_count_avg_ms=4.6 count_overhead_ms=4.6
```

**Mesure et conclusion** : le `COUNT(*)` exact sur 5000 lignes d'audit coûte **~4,6 ms**,
soit environ **24 %** du coût d'une page de lignes seules (18,8 ms, qui porte la projection
join utilisateur + le tri keyset + le `Take`). Le comptage exact est **bon marché** ici — il
n'est pas « aussi cher que la page elle-même » (la page paie la jointure et le keyset ; le
count est un parcours agrégé seul, indexé via `(UserId, CreatedAt)`, `(Action, CreatedAt)`,
`(TargetId)`). La clause de repli ci-dessous reste documentée comme filet de sécurité, mais
**n'est pas activée** : le comptage exact est appliqué sur les 10 endpoints.

**Repli conditionnel (NON activé, conservé comme filet)** — uniquement si un déploiement
réel montre un volume d'audit bien supérieur où le `COUNT` dériverait :

- Conserver `includeTotalCount` mais calculer le total via un **comptage approché annoncé
  comme approximatif** (ex. `reltuples` de `pg_class` borné par le filtre `created_at`, ou un
  compteur incrémental matérialisé), et l'étiqueter `totalCountIsEstimate: true` dans la
  réponse ; le front affiche « ~N » au lieu de « N ». Un total estimé *annoncé comme estimé*
  est acceptable (#1556 §3) ; un total exact *silencieusement* lent ne l'est pas.
- Pour les 9 autres endpoints (tenants, profils, users, invitations, organizations, posts),
  le `COUNT` exact reste négligeable (tables bien indexées, volumes bien plus faibles) ; on
  garde le comptage exact partout.

## 4. Échec du comptage alors que les lignes réussissent

**Règle** : la liste s'affiche avec la plage seule (« x–y ») et la cause visible en mots
simples, jamais une page d'erreur.

### Côté API

Dans chaque service, le `totalCount` est calculé dans un `try/catch` isolé **après** la
récupération des lignes (qui elle-même ne doit pas échouer si le comptage échoue). En cas
d'exception de comptage :

- les lignes sont retournées normalement (avec `nextCursor`) ;
- `totalCount` est **omis** de la réponse (comportement « inconnu ») ;
- un log structuré `LogWarning` porte la cause sanitisée (jamais un secret, jamais une stack
  trace) — conforme à la règle propriétaire « transparent failure causes » (2026-08-22) et à
  « jamais loguer le X-Session-Token ».

Le `CursorPaginatedResult<T>` reste inchangé (pas de champ `totalCount` nullable) ; seul le
**type de réponse de chaque endpoint** (ex. `FindAuditLogsResponse`) ajoute
`public int? TotalCount { get; set; }` (optionnel, omis en cas d'échec). Ainsi un champ
absent = inconnu, jamais zéro (#999).

### Côté front

Le `DataTableCursorFooter` construit en #1549 traite déjà `totalCount === undefined` comme
« inconnu » et rend la plage seule (voir `apps/front/src/components/table/data-table.tsx`
`DataTableCursorFooter`, branche `range-of-counted`). Aucun changement nécessaire côté
composant : il suffit de ne pas passer `totalCount` (ou de passer `undefined`) quand le
backend ne le fournit pas. Le front n'affiche **jamais** « sur 0 ».

### Test (API) — spécification nommée (T1-abs, #1595)

Spec par endpoint. Semer N lignes. Forcer l'échec du `COUNT` (via un `IDbContextInterceptor` de test qui lève sur le second `CountAsync`, ou un seed d'erreur). `GET` avec `includeTotalCount=true`. Assertions sur le **corps JSON réel** (désérialisé depuis la réponse HTTP, pas l'objet de retour du handler : seule la sérialisation fait foi) :

- statut `200` ;
- `data` peuplé (les lignes sont retournées normalement, avec `nextCursor`) ;
- la clé `totalCount` est **strictement absente** du JSON — `JsonElement.TryGetProperty("totalCount", out _)` retourne `false`. Pas `null`, pas `0`, pas une clé présente : **absente**.

**Preuve appariée (rouge sans le correctif, vert avec).** Mutation adverse : une lane qui émet `totalCount: null` au lieu d'omettre le champ satisfait `TotalCount == null` côté objet mais le JSON contient la clé — le test rougit. Le défaut récurrent du dépôt est un test vide dont le vert est forcé par un second mécanisme : ici, une assertion sur l'objet de retour (au lieu du JSON) qui reste verte alors que le JSON transporte `null`.

Le front représente la plage seule.

#### T1-ord (#1596) — les lignes survivent à l'échec du comptage

Même jeu de seed. Sous le même échec forcé du `COUNT` :

- le statut est `200` (jamais `500`) ;
- les lignes sont retournées avec leur `nextCursor`.

**Mutation adverse (nommée) : « calculer le total avant les lignes. »** Déplacer le `CountAsync` avant la récupération des lignes de sorte qu'une exception du comptage fasse échouer toute la requête en 500 au lieu de rendre un 200 partiel. Sous cette mutation, T1-ord rougit (500 au lieu de 200) tandis que T1-abs reste vert (rien à voir avec la présence du total) — prouvant que T1-ord capture bien l'ordre, pas la valeur. Variante équivalente : « rattraper l'échec mais émettre `totalCount: null` » — captée par T1-abs (la clé est présente), pas par T1-ord (le statut reste 200). Ensemble, T1-abs + T1-ord ferment la surface : une lane qui implémente l'un sans l'autre laisse passer l'autre moitié.

**Preuve appariée requise** (couleur nommée, `--reporter=verbose`) : appliquer la mutation « compter avant les lignes » → T1-abs VERT, T1-ord ROUGE ; restaurer → les deux VERTS.

## 5. OpenAPI + client Kiota régénéré + câblage front

### Contrat (tous endpoints #1–#10)

1. Chaque `Query` hérite de `CursorPaginatedQuery` et ajoute
   `[FromQuery(Name = "include_total_count")] public string? IncludeTotalCount { get; set; }`
   (booléen interprété comme `true` si présent/non-vide — suivre le motif existant
   `GetSortOrder`/`GetLimit`).
2. Chaque type de réponse (ex. `FindAuditLogsResponse`) ajoute `totalCount` (`int?`,
   camelCase) — absent si non demandé ou si le comptage échoue.
3. `just build-api` puis `just generate-client` régénère `@org/client-ts`. **Aucune
   modification manuelle de `packages/client-ts/`** (PUBLY0004 / Kiota safeguards).

### Câblage front (réutilise le compteur #1549, pas de second mécanisme)

Pour chacune des 10 routes curseur, on modifie **uniquement** le hook de query
(`apps/front/src/lib/query/*`) et le passage à `DataTable`/`DataTableCursorFooter` :

- Le hook ajoute `includeTotalCount: true` aux `StaffAuditLogsQueryVariables` (et équivalents)
  et au paramètre de requête (`buildFindStaffAuditLogsQueryParameters`) ;
- La route lit `query.data?.totalCount` et le passe à `pagination={{ …, totalCount }}`.
- **Invalidation par jeu de filtres** : la `queryKey` de TanStack inclut **déjà** le jeu de
  filtres (sortId, sortOrder, size, search, actions, dates, tenantId…) via
  `staffAuditLogsQueryOptions.queryKey(variables)`. Donc le total est naturellement recalculé
  quand un filtre change, et conservé pendant la navigation entre pages (le `cursor` seul
  change, pas la clé de filtre). Aucune logique de cache additionnelle n'est requise.

Le pied partagé `DataTableCursorFooter` (aussi rendu par la grille de cartes des profils)
couvre les 10 surfaces d'un coup : chaque route passe son `totalCount` connu ou `undefined`.

## 6. Cas à trancher explicitement

### 6a. Tiroir d'assignation de membres (`_assign-members-table.tsx`)

**Décision : EXCLU du périmètre #1556.** Motif : le tiroir réutilise l'endpoint #6
(`GET /staff/tenants/{tenantId}/users`) en sous-ensemble filtré (recherche + scope
d'assignation). Quand #6 gagne `includeTotalCount`, le tiroir **hérite** gratuitement du
total : il suffit de relayer `query.data?.totalCount` depuis le même hook. On n'écrit aucun
endpoint ni aucun comptage distinct. Pas de silence : le total y apparaîtra via le même
mécanisme que #6, sans ligne de code dédiée au tiroir. (Si le tiroir veut un total propre à
son sous-ensemble d'assignation, ce sera un ajout ultérieur explicite, hors #1556.)

### 6b. Intégrations connectées (`settings/integrations.tsx`)

**Décision : EXCLU, argumenté.** Cette surface n'a **pas de vrai pagineur** : `hasNextPage`
est codé en dur à `false` (pas de requête curseur, pas de `nextCursor` du backend). Il n'y a
donc pas de « liste paginée par curseur » au sens de #1556, et aucun contrat `totalCount` à
exposer. Forcer un total ici inventerait un pagineur inexistant — contraire à l'arbitrage
propriétaire (« n'étend pas l'API pour les forcer »). On laisse « x–y » honnête (ou la plage
complète) sans « sur N ».

## 7. Jamais « sur 0 » quand le total est inconnu (#999)

Le comportement honnête construit en #1549 reste le défaut : si `includeTotalCount` n'a pas été
demandé (ou a échoué), le champ `totalCount` est absent, et `DataTableCursorFooter` rend la
plage seule (`range-of-counted`), jamais `range-no-total` avec `count:0`. Le test de non-régression
existant `data-table-range-label.test.tsx` doit continuer de couvrir ce cas ; on ajoute un
cas « total fourni → range-of-total » pour verrouiller « x–y sur N ».

## Découpage en tâches (une tâche = un commit, arbre vert)

- **T1** — `CursorPaginatedResult` : pas de changement de type ; ajout de `TotalCount` optionnel
  sur `FindAuditLogsResponse` + `FindAuditLogsQuery.IncludeTotalCount` + service `CountAsync`
  partagé (anti-dérive) + spec anti-dérive + spec échec-comptage. `just test-api` vert.
- **T2** — Endpoints staff batch 1 : tenants (#2), profiles staff (#3), users staff (#4),
  invitations staff (#5) : même motif. Specs anti-dérive + échec par endpoint.
- **T3** — Endpoints staff batch 2 : tenant-users (#6), tenant-invitations (#7),
  tenant-profiles (#8), organizations (#9) : même motif.
- **T4** — Endpoint tenant : posts (`GET /posts`, #10) : même motif.
- **T5** — `just build-api && just generate-client` : régénère `@org/client-ts` avec
  `includeTotalCount` + `totalCount`. Vérifier `pnpm --filter front typecheck`.
- **T6** — Front : câblage des 10 hooks de query (`includeTotalCount:true` + passage
  `totalCount` à `DataTableCursorFooter`) ; tiroir d'assign (#6a) hérite. `pnpm --filter front
  test` vert (dont `data-table-range-label.test.tsx`).
- **T7** — Repli audit si mesure défavorable : `totalCountIsEstimate` + affichage « ~N ».
- **T8** — PR vers `develop` : `Closes #1556`, `Part of #282`, rebase sur `origin/develop`
  préalable (voir règles de reprise : #1520/#1530/#1542/#1549 ont pu bouger). `gh pr checks`
  vert.

## Règles de citation / preuve

Toutes les références sont `<branche>:<chemin>` + symbole + `git grep -n` (aucun numéro de
ligne sur branche en vol). La preuve `git show … | sed -n` est consignée dans
`.dump/citations-r1.md`, une ligne par citation, PASS/FAIL, aucun commit tant qu'une ligne est
FAIL. Rien sous `.dump/` n'est committé (`git add -f` interdit — voir règle de reprise
2026-08-26 : un lane a forcé `.dump/` et PR #1471 a propagé un DONE étranger).
