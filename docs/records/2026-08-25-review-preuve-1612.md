# Preuve — issue #1612 : garde des chemins d'import partagés

Worktree : `.worktrees/wt-1612`, branche `lane/wt-1612`.
Garde : `apps/front/scripts/guards/check-shared-ts-import-paths.mts`.
Modèle : Jcode v0.81.1. Effort : `medium`.

Toutes les commandes ci-dessous ont été exécutées dans `apps/front` (sauf indication), sur
l'arbre de travail propre au départ (`git status` vide). Aucune réintroduction n'est laissée
dans l'arbre (voir §5).

## 0. État de base (GREEN) — avant toute modification

```text
$ node scripts/guards/check-shared-ts-import-paths.mts
No shared-ts module is re-exported from apps/front/src [OK]
exit=0
```

```text
$ node --test scripts/guards/check-shared-ts-import-paths.test.mts
✔ RED: a front-side re-export of a shared-ts module is detected
✔ GREEN: without the shim, no shared-ts re-export is found
✔ GREEN: existing front code importing shared-ts directly is NOT flagged
✔ front-local re-exports are NOT flagged
✔ regex sanity: only shared-ts re-exports match
tests 5 | pass 5 | fail 0
exit=0
```

Comptage des fichiers balayés (arbre de base) :
- `apps/front/src` : **734** fichiers `.ts/.tsx/.mts`
- `packages/shared-ts/src` : **72** fichiers (hors périmètre à ce stade)
- Aucun réexport `@org/shared-ts/...` interne à `packages/shared-ts/src` (zéro faux positif
  potentiel au départ).

## 1. Prouver la garde ROUGE — côté front (nouvelle réintroduction adversariale)

La réintroduction est volontairement **adversariale** : non pas le shim `export *`
caricatural déjà couvert par le test existant, mais un **réexport nommé d'un seul symbole**
(`export { shouldLogoutForFailure } from '@org/shared-ts/lib/...'`) dans un barrel de
convenance plausible (`src/lib/should-logout.ts`) — exactement ce qu'un développeur ajoute
sans y penser.

```text
$ cat > apps/front/src/lib/should-logout.ts <<'EOF'
// Convenience barrel for a couple of shared helpers used across the staff surface.
export { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';
EOF

$ node scripts/guards/check-shared-ts-import-paths.mts
Dual-path violation: a shared-ts module is re-exported from apps/front/src, creating a second import path (#1533).
  lib/should-logout.ts:2  export { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';
exit=1
```

**État : ROUGE** (exit 1). La garde nomme le fichier, la ligne et le texte exact.

Puis retrait et retour au VERT :

```text
$ rm apps/front/src/lib/should-logout.ts

$ node scripts/guards/check-shared-ts-import-paths.mts
No shared-ts module is re-exported from apps/front/src [OK]
exit=0
```

**État : VERT** (exit 0). `git status` vide (réintroduction retirée).

## 2. Extension du périmètre à `packages/shared-ts/src`

La garde (version livrée) ne balayait que `apps/front/src`. Modifications :

- Nouveau point d'ancrage `sharedTsSrc = path.resolve(scriptDir, '../../../../packages/shared-ts/src')`
  (4 niveaux : `apps/front/scripts/guards` → racine du dépôt).
- Réfactoring : `scanTreeForSharedTsReExports(tree)` générique, préservant
  `scanFrontSrcForSharedTsReExports` (compatibilité du test existant) et ajoutant
  `scanSharedTsSrcForSharedTsReExports`. Les `Finding.file` sont désormais préfixés par
  l'étiquette de l'arbre (`apps/front/src/...` ou `packages/shared-ts/src/...`).
- `main()` balaie les **deux** arbres et sort non-zéro si l'un des deux contient un
  réexport `@org/shared-ts/...`.
- En-tête du fichier mis à jour : le périmètre documente maintenant les deux arbres et ce
  qui est *délibérément* non signalé (réexport relatif `./x` à l'intérieur de shared-ts —
  il ne crée pas un second chemin *publié*).

## 3. Prouver l'extension ROUGE — côté paquet partagé

Réintroduction adversariale dans le paquet partagé lui-même : un barrel interne qui
réexporte un module frère sous un second spécificateur `@org/shared-ts/...`.

```text
$ cat > packages/shared-ts/src/lib/_staff-barrel.ts <<'EOF'
// Staff-surface convenience barrel: re-surface a couple of shared helpers under
// a shorter published path.
export { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';
EOF

$ node scripts/guards/check-shared-ts-import-paths.mts
Dual-path violation: a shared-ts module is re-exported under a second import path (#1533).
  packages/shared-ts/src/lib/_staff-barrel.ts:3  export { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';
exit=1
```

**État : ROUGE** (exit 1). L'extension attrape bien le cas dans le paquet partagé.

Puis retrait et retour au VERT :

```text
$ rm packages/shared-ts/src/lib/_staff-barrel.ts

$ node scripts/guards/check-shared-ts-import-paths.mts
No shared-ts module is re-exported (apps/front/src, packages/shared-ts/src) [OK]
exit=0
```

**État : VERT** (exit 0).

## 4. Pas de faux positif sur l'arbre réel (après extension)

Après extension, la garde roule sur l'arbre réel complet et reste VERT (sortie ci-dessus,
« No shared-ts module is re-exported (apps/front/src, packages/shared-ts/src) [OK] », exit 0).
Aucun fichier légitime n'est signalé.

Comptage des fichiers balayés (après extension) :
- `apps/front/src` : 734 fichiers (inchangé)
- `packages/shared-ts/src` : **72** fichiers (nouveau périmètre)
- **Total : 806 fichiers** (avant : 734, soit +72).

Les tests permanents couvrent aussi les non-faux-positifs :
- `GREEN: shared-ts/src with no internal re-export is clean`
- `GREEN: a shared-ts file re-exporting a sibling via a relative path is NOT flagged`
  (réexport `../should-logout-for-failure` relatif → reste VERT, car aucun second chemin publié)

## 5. Tests permanents (après modification de la garde)

```text
$ node --test scripts/guards/check-shared-ts-import-paths.test.mts
✔ RED: a front-side re-export of a shared-ts module is detected
✔ RED: a named (non-barrel) front-side re-export of a shared-ts module is detected
✔ GREEN: without the shim, no shared-ts re-export is found
✔ GREEN: existing front code importing shared-ts directly is NOT flagged
✔ front-local re-exports are NOT flagged
✔ RED: a shared-ts-internal re-export of a sibling shared-ts module is detected
✔ GREEN: shared-ts/src with no internal re-export is clean
✔ GREEN: a shared-ts file re-exporting a sibling via a relative path is NOT flagged
✔ scanTreeForSharedTsReExports labels findings with the tree label
✔ regex sanity: only shared-ts re-exports match
tests 10 | pass 10 | fail 0
exit=0
```

Les deux nouveaux tests RED (`RED: a named (non-barrel) front-side re-export ...` et
`RED: a shared-ts-internal re-export ...`) verrouillent la preuve de l'efficacité : ils
réintroduisent le shim dans un sandbox miroir et exigent une trouvaille. S'ils passent au
VERT, le test casse — la garde décorative n'est plus possible.

## 6. Arbre de travail propre

```text
$ git status --porcelain
 M apps/front/scripts/guards/check-shared-ts-import-paths.mts
 M apps/front/scripts/guards/check-shared-ts-import-paths.test.mts
```

Aucune réintroduction laissée : les fichiers `src/lib/should-logout.ts` et
`packages/shared-ts/src/lib/_staff-barrel.ts` ont été supprimés (§1 et §3).

## Ce qui est prouvé / non prouvé

Prouvé :
- La garde détecte une réintroduction front-side (shim `export *` ET réexport nommé
  d'un symbole) — ROUGE→VERT (§1, test `RED: ...`).
- L'extension détecte une réintroduction dans `packages/shared-ts/src` — ROUGE→VERT (§3,
  test `RED: a shared-ts-internal re-export ...`).
- Aucun faux positif sur l'arbre réel après extension (806 fichiers, VERT) ; les réexports
  relatifs internes à shared-ts restent VERT (§4, test `GREEN: ... relative path`).

Non prouvé par ce travail (limites assumées) :
- La garde ne couvre que les réexports `export ... from '@org/shared-ts/(lib|utils|validations|types)'`.
  Un second chemin créé par alias TS hors de ce motif, ou par une redirection de build
  hors source (ex. `tsconfig` paths), n'est pas dans le périmètre — ce n'est pas le défaut
  que #1533 cible, et l'en-tête le documente.
- Le branchement CI (`pnpm test` → `test:shared-ts-import-paths`) est inchangé et exécute
  désormais les 10 tests ; la validation CI réelle se fait sur le PR (front-e2e 4/4 par CI,
  conformément à la politique de vérification : pas de stack e2e locale).
