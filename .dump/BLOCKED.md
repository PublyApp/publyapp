# BLOCKED: Task 2 — `POST /posts/{postId}/publish-now` endpoint

**Blocked since:** 2026-08-25, after Task 1 GREEN (`34eaf68dd`, pushed).

## Exact symbol

`AppPermissions.Tenant.SocialAccounts` (class
`SocialAccountPermissionsForTenant`, member `PUBLISH`, wire key
`tenant.socialaccounts.publish`).

Defined only on **`origin/lane/wt-641` @ fb4f03c7b**
(`feat(permissions): socialaccounts view/manage/publish tenant verbs (#641)`),
inside C2 (#1439), which is under final review and NOT merged into develop.

## Why Task 2 cannot proceed on this branch

Plan Task 2 Step 2 maps the route with:

```csharp
.WithTenantPermission([
    AppPermissions.Tenant.Posts.PUBLISH,
    AppPermissions.Tenant.SocialAccounts.PUBLISH   // <- C2-only symbol
])
```

`AppPermissions.Tenant.SocialAccounts` does not exist in this tree (verified:
`git grep socialaccounts` over the worktree returns nothing). The line cannot
compile until the branch carries C2. Per `.dump/brief.md`: "if a task needs a
social-account symbol that only exists there … stop that task, note it in
`.dump/BLOCKED.md` with the exact symbol, and continue with tasks that do not.
Do NOT merge or cherry-pick wt-641 yourself."

## Unblocking action (owner)

Merge C2 (`origin/lane/wt-641`) into develop, then rebase/merge develop into
`lane/wt-645b`. No other change is needed; Task 2 RED artifacts can be written
the moment the symbol lands.

## Lane continues with non-blocked tasks

Task order adjusted per the brief's "continue with tasks that do not [need C2]":

- Task 3 (History read `GET /publishing/publications`) — pure develop symbols,
  IN PROGRESS now.
- Task 5 RED proof (architecture guard) — guard file is develop-side; will
  verify no C2 dependency before starting.
- Tasks 4, 6, 8 reference `tenant.socialaccounts.publish` / C2 hook inputs —
  expected blocked like Task 2.

## Mise à jour dépendances C2 (post-Tâche 6/7)

- **Tâche 4** : BLOQUÉE. Le endpoint exige `.WithTenantPermission([AppPermissions.Tenant.SocialAccounts.PUBLISH])`
  et le cas de spec « sans la permission → 403 » requiert ce même symbole (C2 uniquement).
  Sans lui aucun appelant autorisé n'est même testable.
- **Tâche 8** : BLOQUÉE transitivement. La mutation publishNow appelle l'opération Kiota
  `publishNow`, générée depuis le endpoint de la Tâche 2 (bloquée C2). Tout le reste du
  contrat du bloc est prêt (hook Tâche 6 + testids).
- **Tâche 7** : PARTIELLE, livrée. Regen Kiota effectuée → `findPublications` disponible ;
  couche `tenant-publications.ts` (builder CSV statut, mapper lignes, clé scopée,
  invalidation) verte 9/9. `publishNowMutation` + `getPublishTargets` attendent les
  endpoints des Tâches 2/4.
- **Tâche 9** : exécutable en entier (contrat de lecture réel existe).
