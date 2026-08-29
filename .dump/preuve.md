# Preuve — #1781

Ce fichier retrace la preuve d'appariement rouge/vert exigée par le brief.

- **Test concerné** : `apps/front/src/components/table/data-table-selection-integration.test.tsx`
- **Mutation adverse** : `{false ? (` supprime l'icône « moins » (tiret) de l'état indéterminé dans `checkbox.tsx`.
- **Marqueur ajouté en production** : `data-icon="check"` / `data-icon="minus"` sur les SVG, pour distinguer
  les deux icônes par leur sémantique et non par un détail visuel (chemin SVG, taille, classe).

**Justification du marqueur** : aucun test du dépôt n'identifie d'icônes Tabler (recherche exhaustive
vaine). L'attribut `data-icon` porte la sémantique de l'icône (« check » / « minus ») et non sa
représentation visuelle, ce qui le rend robuste à un ajustement graphique (taille, épaisseur du trait).

## 1. Rouge — la mutation adverse rend le nouveau test rouge

```ts
// Mutation : {false ? ( — supprime le tiret de l'état indéterminé
{false ? (
  <IconMinus data-icon="minus" className="size-3.5 stroke-[2.5]" />
) : (
  <IconCheck data-icon="check" className="size-3.5 stroke-[2.5]" />
)}
```

```
$ pnpm --filter front exec vitest run --reporter=verbose src/components/table/data-table-selection-integration.test.tsx

 ✓ src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders all row checkboxes unchecked when nothing is selected 87ms
 ✓ src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders a row checkbox as checked when that row is in the selection map 21ms
 ✓ src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders the header checkbox as checked when all visible rows are selected 21ms
 × src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders the header checkbox as indeterminate when some but not all rows are selected 23ms
   → expected 'check' to be 'minus' // Object.is equality
 ✓ src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders the header checkbox as unchecked when no rows are selected (not indeterminate) 15ms

 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```

**Test qui rougit** : `renders the header checkbox as indeterminate when some but not all rows are selected` —
l'icône rendue est `check` au lieu de `minus`.

## 2. Vert — retrait de la mutation, les cinq tests d'origine PLUS les assertions icône passent

```
$ pnpm --filter front exec vitest run --reporter=verbose src/components/table/data-table-selection-integration.test.tsx

 ✓ src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders all row checkboxes unchecked when nothing is selected 113ms
 ✓ src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders a row checkbox as checked when that row is in the selection map 32ms
 ✓ src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders the header checkbox as checked when all visible rows are selected 32ms
 ✓ src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders the header checkbox as indeterminate when some but not all rows are selected 26ms
 ✓ src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders the header checkbox as unchecked when no rows are selected (not indeterminate) 22ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

## 3. Mutation symétrique — casser l'icône COCHÉ en laissant l'indéterminé intact

```ts
// Mutation symétrique : l'icône check disparaît au profit du tiret même à l'état coché.
{props.indeterminate ? (
  <IconMinus data-icon="minus" className="size-3.5 stroke-[2.5]" />
) : (
  <IconMinus data-icon="minus" className="size-3.5 stroke-[2.5]" />
)}
```

```
$ pnpm --filter front exec vitest run --reporter=verbose src/components/table/data-table-selection-integration.test.tsx

 ✓ src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders all row checkboxes unchecked when nothing is selected 81ms
 ✓ src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders a row checkbox as checked when that row is in the selection map 21ms
 × src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders the header checkbox as checked when all visible rows are selected 23ms
   → expected 'minus' to be 'check' // Object.is equality
 ✓ src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders the header checkbox as indeterminate when some but not all rows are selected 16ms
 ✓ src/components/table/data-table-selection-integration.test.tsx > DataTable row selection integration (issue #1730) > renders the header checkbox as unchecked when no rows are selected (not indeterminate) 16ms

 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```

**Test qui rougit** : `renders the header checkbox as checked when all visible rows are selected` —
l'icône rendue est `minus` au lieu de `check`. La preuve est symétrique : chaque état détecte
l'icône qui lui correspond.
