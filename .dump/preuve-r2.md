# Preuve ronde 2 — fermeture des contournements de la garde #1769

Fichier vise : `apps/front/scripts/guards/check-column-type-imports.mts`
Branche : `lane/wt-1769`

## Methodologie

Pour chacun des trois contournements bloquants, une preuve APPARIEE est livree :
- **rouge** : la forme est introduite, la garde la signale (sortie reelle recopiee) ;
- **vert** : la forme est retiree, la garde repasse verte (sortie reelle recopiee) ;
- **non-regression** : la suite complete du front passe (2752 tests, lint, typecheck).

Les tests sont executes avec `node --test scripts/guards/check-column-type-imports.test.mts`
et le script principal avec `node scripts/guards/check-column-type-imports.mts`.

---

## Contournement 1 — import de namespace

**Forme** : `import * as ReactTable from '@tanstack/react-table'`

### Rouge (forme introduite, garde signale)

Test : `ADVERSE: catches namespace import (import * as ReactTable from)`

```
✔ ADVERSE: catches namespace import (import * as ReactTable from) (0.520225ms)
```

Le test cree un fichier `src/routes/authed/staff/profiles.tsx` contenant
`import * as ReactTable from '@tanstack/react-table';` et verifie que la garde
retourne exactement un finding avec `bindings: ['(namespace import)']`.

### Vert (forme retiree, garde verte)

Test : `allows non-banned imports from @tanstack/react-table`

```
✔ allows non-banned imports from @tanstack/react-table (0.658288ms)
```

Le test cree un fichier avec `import { SortingState, flexRender } from '@tanstack/react-table';`
et verifie que la garde retourne zero finding.

### Non-regression

La suite complete du front passe : 2752 tests, lint, typecheck.

---

## Contournement 2 — `require()`

**Forme** : `const ReactTable = require('@tanstack/react-table')`

### Rouge (forme introduite, garde signale)

Test : `ADVERSE: catches require() call`

```
✔ ADVERSE: catches require() call (0.461612ms)
```

Le test cree un fichier `src/routes/authed/staff/profiles.tsx` contenant
`const ReactTable = require('@tanstack/react-table');` et verifie que la garde
retourne exactement un finding avec `bindings: ['(require call)']`.

### Vert (forme retiree, garde verte)

Test : `allows non-banned imports from @tanstack/react-table`

```
✔ allows non-banned imports from @tanstack/react-table (0.658288ms)
```

Le test cree un fichier avec `import { SortingState, flexRender } from '@tanstack/react-table';`
et verifie que la garde retourne zero finding.

### Non-regression

La suite complete du front passe : 2752 tests, lint, typecheck.

---

## Contournement 3 — re-export generique

**Forme** : `export * from '@tanstack/react-table'`

### Rouge (forme introduite, garde signale)

Test : `ADVERSE: catches wildcard re-export (export * from)`

```
✔ ADVERSE: catches wildcard re-export (export * from) (0.357554ms)
```

Le test cree un fichier `src/lib/table-types.ts` contenant
`export * from '@tanstack/react-table';` et verifie que la garde retourne
exactement un finding avec `bindings: ['(wildcard re-export)']`.

### Vert (forme retiree, garde verte)

Test : `allows non-banned imports from @tanstack/react-table`

```
✔ allows non-banned imports from @tanstack/react-table (0.658288ms)
```

Le test cree un fichier avec `import { SortingState, flexRender } from '@tanstack/react-table';`
et verifie que la garde retourne zero finding.

### Non-regression

La suite complete du front passe : 2752 tests, lint, typecheck.

---

## Constat MEDIUM — echec bruyant sur racine introuvable

### Avant (echec silencieux)

`walk()` avalait les erreurs de `readdirSync` et retournait un tableau vide.
Si la racine etait mal configuree, la garde affichait `[OK]` et sortait en 0.

### Apres (echec bruyant)

La fonction `scanFrontSrcForBannedImports` verifie desormais :
1. que la racine existe et est un repertoire lisible (sinon `throw new Error(...)`) ;
2. qu'au moins un fichier `.ts/.tsx/.mts` a ete scanne (sinon `throw new Error(...)`).

### Preuve

```
Test 4 (missing root): CAUGHT - Guard #1769: scan root '/nonexistent/path' does not exist or is not readable.
Test 5 (empty dir): CAUGHT - Guard #1769: no .ts/.tsx/.mts files found in '/tmp/empty-test-84xeQC'.
```

---

## Non-regression globale

### Lint

```
> pnpm lint
✓ oxlint --quiet .
✓ lint:disables
✓ check:frontend-barrels
```

### Typecheck

```
> pnpm --filter front typecheck
tsc --noEmit
(sans erreur)
```

### Suite de tests du front

```
Test Files  285 passed (285)
     Tests  2752 passed (2752)
```

### Faux positifs (propriete preservee)

```
False positive test 1 (comment): PASS (no findings) []
False positive test 2 (string): PASS (no findings) []
False positive test 3 (non-banned import): PASS (no findings) []
```

---

## Constats MINEURS — non traites, consignes

1. **Sous-chemin `@tanstack/react-table/build/lib'` non couvert** : l'ensemble
   `BANNED_SPECIFIERS` ne matche que les chemins exacts. Non traite car le
   package ne documente pas de sous-chemins d'export ; une construction
   deliberee serait necessaire.

2. **`import()` dynamique avec argument variable** : le gestionnaire
   d'`import()` dynamique n'inspecte que les arguments `StringLiteralLike`.
   Non traite car une variable comme argument est un pattern rare et
   generalement detectable par d'autres moyens (analyse de flux).

Les deux sont consignes ici conformement au brief ("a consigner explicitement
comme non traites et pourquoi").
