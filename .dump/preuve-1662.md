# Preuve #1662 — le classificateur « pas de liste » analyse les génériques à l'expression régulière

**Branche** : `lane/wt-1662`
**Modèle** : gpt-5.5 (effort: high)

## Choix effectué (brief, « deux réponses acceptables — choisis, et dis pourquoi »)

**Option choisie** : **Épingler l'invariant** « pas de générique imbriqué en troisième argument » par un test qui **rougit** si quelqu'un en introduit un — et corriger le classificateur pour qu'il compte correctement les génériques imbriqués.

**Pourquoi pas l'autre** (analyser réellement la syntaxe) : le dépôt est en TypeScript 7.0.2, dont l'API compilateur classique n'est pas exposée par un `require('typescript')` nu (seule `version` est accessible, `createSourceFile` inatteint). Le précédent du dépôt passe par `ts-morph` (`apps/front/scripts/guards/check-design-system.mts`). Passer par ts-morph ajouterait une dépendance d'exécution à la chaîne de tests, un démarrage lourd pour un détecteur secondaire qui n'a besoin que de nommer les types — le regex ciblé est plus léger, plus lisible, et l'invariant épinglé empêche toute régression vers l'ancienne rupture.

## Ce qui a été fait

Deux correctifs au détecteur secondaire de la garde de cohérence des invalidations (`apps/front/src/lib/query/mutation-invalidation.guard.test.ts`) :

1. **Découpage des arguments génériques** : `countListQueryFactories` extrait désormais le nom du type `*QueryVariables` depuis n'importe où dans le troisième argument (y compris dans un générique imbriqué), puis recherche la définition de CE type — au lieu de supprimer le générique imbriqué et de vérifier le nom du wrapper.
2. **Rejouage de la preuve négative** (#1610, partie 2) : un test rejoué prouve que l'ancienne garde (liste « no-list » tenue à la main) reste verte quand un module sans liste en acquiert une, tandis que la nouvelle garde l'attrape (rouge).

## Preuves exigées (brief `.dump/brief.md`)

### Partie 1 — découpage des génériques

- **`splitTopLevel` extraite** (exportée, testable séparément) :
  - Test `splitTopLevel — flat arguments split on top-level commas` → GREEN
  - Test `splitTopLevel — nested angle brackets are not split` → GREEN
  - Test `splitTopLevel — nested parens do not break splitting` → GREEN

- **Fabrication du cas imbriqué** :
  - Source `NESTED_GENERIC_SOURCE` : `buildStaffQueryOptions<ApiClient, Response, SomeWrapper<PageQueryVariables>>`
  - L'ancien code appliquait `replace(/<.*$/, '')` → `SomeWrapper` (ne correspond pas à `*QueryVariables`) → retournait 0 (sous-comptage silencieux).
  - Le nouveau code extrait `PageQueryVariables` du troisième argument, recherche sa définition (`{ cursor?: string; size?: number }`) et compte 1.
  - Test `FABRICATION — nested-generic third argument is now correctly counted (proves the fix)` → **GREEN** (la fabrication prouve que le correctif compte bien 1).

- **Non-régression** :
  - Test `INVARIANT PIN — a flat *QueryVariables third argument is still counted (no regression)` → **GREEN** (le cas plat sans générique imbriqué est toujours compté).

### Partie 2 — rejouage de la preuve négative (#1610, partie 2)

- Fabrication d'un module « no-list » qui acquiert une requête de liste (`buildStaffQueryOptions` avec `StaffAuditLogsQueryVariables { cursor, size, sortOrder }`) mais dont la mutation (téléchargement de fichier) ne touche jamais cette liste.
- **Ancienne garde (pré-#1610)** : liste « no-list » tenue à la main, ne lit jamais la source → **GREEN** (la passe silencieusement).
- **Nouvelle garde (#1610)** : lit la source, compte la fabrique de liste acquise → **ROUGE** (attrape le module qui a acquis une liste qu'il n'invalide jamais).
- Test `REPLAY — old guard (hand-asserted list) stays GREEN when a no-list module acquires a list query; new guard catches it (RED)` → **GREEN** (la nouvelle garde compte bien 1 ; l'ancienne garde simulée reste verte).

## Commandes exécutées

```bash
# Test unitaire ciblé (29 tests, tous GREEN)
timeout 60 ~/ai-orchestration-playbook/tools/heavy.sh pnpm --filter front exec vitest run src/lib/query/mutation-invalidation.guard.test.ts

# Typecheck (propre)
timeout 120 ~/ai-orchestration-playbook/tools/heavy.sh pnpm --filter front typecheck

# Lint (propre)
timeout 120 ~/ai-orchestration-playbook/tools/heavy.sh pnpm --filter front exec oxlint src/lib/query/mutation-invalidation.guard.test.ts

# Suite complète lib/query (250 tests, tous GREEN)
timeout 120 ~/ai-orchestration-playbook/tools/heavy.sh pnpm --filter front exec vitest run src/lib/query/
```

## Résultats

```
src/lib/query/mutation-invalidation.guard.test.ts:
  Test Files  1 passed (1)
  Tests  29 passed (29)

src/lib/query/*:
  Test Files  18 passed (18)
  Tests  250 passed (250)

typecheck: exit 0
lint: exit 0
```

## Tests nommés (preuve exécutable)

Tous les tests sont dans `apps/front/src/lib/query/mutation-invalidation.guard.test.ts` :

- `splitTopLevel — flat arguments split on top-level commas`
- `splitTopLevel — nested angle brackets are not split`
- `splitTopLevel — nested parens do not break splitting`
- `nested-generic third argument is not silently skipped (#1662, part 1) > FABRICATION — nested-generic third argument is now correctly counted (proves the fix)`
- `nested-generic third argument is not silently skipped (#1662, part 1) > INVARIANT PIN — a flat *QueryVariables third argument is still counted (no regression)`
- `no-list classification is proven (no owned list query) (#1610, part 2) > REPLAY — old guard (hand-asserted list) stays GREEN when a no-list module acquires a list query; new guard catches it (RED)`

Tous GREEN.

## Ce qui reste suivi (ouvert)

L'assertion **principale** de la garde (la couverture de la famille de clés par la vraie fabrique) n'a pas été touchée. Le détecteur « pas de liste » est désormais exact pour les formes plates ET imbriquées. La preuve négative de la partie 2 est désormais exécutable (rejouée), plus seulement raisonnée.
