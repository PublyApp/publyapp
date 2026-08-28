# Preuve r2 — Quatre correctifs CI reason-guard (#1729)

## Contexte

Branche : `fix/ci-drift-reason-blindness`
Brief : `brief-r2.md`

La raison d'être du reason-guard : détecter quand une raison de step CI est silencieusement tronquée ou modifiée alors que le hash du step reste inchangé (ce qui échapperait à la détection normale de drift). PR #1571 a tronqué une raison de 384 à 361 caractères — le guard maintenant attrapé cette perte.

## Correctif 1 — CI rouge (TypeScript / oxlint)

**Fichier :** `packages/scripts-ts/src/check-ci-drift.ts` + `packages/scripts-ts/src/check-ci-drift.test.ts`

- Remplacement de `parseInt` par `Number.parseInt` (lint strict).
- Typage de tous les paramètres/fonctions atypés avec `@ts-expect-error rung-0` (8 dans `check-ci-drift.ts`, 6 dans le test).
- Suppression de tous les commentaires `rung-0: add proper type in later rung` — aucune trace restante.

**Vérification :** `pnpm lint` (oxlint + lint:disables + check:frontend-barrels) → vert.

## Correctif 2 — Suppression de `normalizeReason` (no-op)

**Preuve de no-op :** Inspection directe des données du manifeste — `JSON.parse` décode déjà les séquences `\uXXXX`. 165/165 entrées du manifeste confirment qu'aucune ne contient de séquence backslash-u littérale.

```
node -e: 165 entrées inspectées, 0 séquence \uXXXX littérale trouvée
```

- `normalizeReason` supprimée du code.
- `hashReason` hache le texte directement.
- `reason-guard-ref.json` généré avec `gen-reason-ref.ts` — 165/165 entrées matchent sans normalisation.

## Correctif 3 — Suppression du fichier de preuve non-tracké

```
git rm --cached .dump/preuve-reason-guard.md
```

Commité : `chore: untrack .dump/preuve-reason-guard.md` (b022aa04a).

## Correctif 4 — Création de `gen-reason-ref.ts`

**Fichier :** `packages/scripts-ts/src/gen-reason-ref.ts`

- Script non-préfixé par underscore (convention repo) pour régénérer `reason-guard-ref.json`.
- Tous les messages d'erreur dans `check-ci-drift.ts` citent exactement : `node packages/scripts-ts/src/gen-reason-ref.ts`.
- Sortie inclut un newline final.
- `docs/guides/local-ci-gate.md` mis à jour avec la section reason guard.

**Vérification :** régénération → `git diff` sur `reason-guard-ref.json` identique (0 ligne changée).

## Vérifications finales

### Test verbose (19/19)

```
✓ reason guard: passes when the reason is unchanged
✓ reason guard: fails when a reason SHRINK while step hash is unchanged
✓ reason guard: fails when a reason CHANGES while step hash is unchanged
✓ reason guard: does not fire when step hash also changes
✓ reason guard: distinct reasons produce distinct fingerprints

Test Files  1 passed (1)
Tests       19 passed (19)
```

### Probe replay — SHRINK de la raison #1571 (384 → 361)

Troncature simulée de la raison du step `quality-gate.yml::quality::Verify complexity bounds are not drifting (#1661)` du manifeste (`ci-gate-manifest.json`) à 361 caractères :

**Avant restauration (rouge attendu) :**

```
CI drift detected — the local gate no longer matches .github/workflows:

  packages/scripts-ts/src/ci-gate-manifest.json: entry "quality-gate.yml::quality::Verify complexity bounds are not drifting (#1661)" reason SHRINK from 384 to 361 characters while the step hash is unchanged (expected reason hash 1cbb6db7d59ba3f0, got 74c416c85a449e0e). Truncation is not a rewrite — restore the original reason, or regenerate reason-guard-ref.json in the same commit if the rewrite is deliberate (run `node packages/scripts-ts/src/gen-reason-ref.ts`).

Reconcile packages/scripts-ts/src/ci-gate-manifest.json. See docs/guides/local-ci-gate.md for what each finding means.
GUARD_RC=1
```

**Après restauration (vert attendu) :**

```
CI drift guard: every workflow step is reconciled with the local gate.
GUARD_RC=0
```

### `just ci-drift` (passe complète)

Tous les sous-gates passent, y compris `:test` (19), `:gate-structure` (68), `:cyclomatic-bound` (11), `:actions-pin` (27), `:ci-gate-aggregation` (203), `:e2e-rerun-guard` (5), etc. RC=0.

## État du dépôt

```
git status --short
 M packages/scripts-ts/src/gen-reason-ref.ts
```

Seul `gen-reason-ref.ts` a un diff (formatage + newline final). `reason-guard-ref.json` et `ci-gate-manifest.json` sont identiques au HEAD.
