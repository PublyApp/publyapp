# Preuve de la garde des raisons — #1725

## Test 1 : La troncature rend la garde ROUGE

**Mutation rejouée** : Tronquer `front-ci.yml::gate-selftest::Run CI gate guard tests (mirrors just ci-drift)` de 2 856 à 100 caractères.

**Résultat** : La garde échoue avec le message suivant :

```
CI drift detected — the local gate no longer matches .github/workflows:

  packages/scripts-ts/src/ci-gate-manifest.json: entry "front-ci.yml::gate-selftest::Run CI gate guard tests (mirrors `just ci-drift`)" reason SHRANK from 2856 to 100 characters while the step hash is unchanged (expected reason hash 84382a71d89940dd, got 3640a71d5ee612f2). Truncation is not a rewrite — restore the original reason, or update reason-guard-ref.json in the same commit if the rewrite is deliberate.

Reconcile packages/scripts-ts/src/ci-gate-manifest.json. See docs/guides/local-ci-gate.md for what each finding means.
```

**Code de retour** : 1 (échec)

**Nom du test** : `packages/scripts-ts/src/check-ci-drift.ts` — détection de troncature via `getReasonGuardProblem()`.

---

## Test 2 : La restauration rend la garde VERTE

**Action** : Restaurer la raison originale (2 856 caractères).

**Résultat** : La garde passe au vert.

```
CI drift guard: every workflow step is reconciled with the local gate.
```

**Code de retour** : 0 (succès)

---

## Mutation adversariale : réécriture assumée

**Objectif** : Trouver une mutation qui abîme un `reason` tout en gardant la garde **verte**.

**Mutation testée** : Tronquer le `reason` ET mettre à jour `reason-guard-ref.json` dans le même commit.

**Résultat** : La garde passe au vert.

**Analyse** : C'est le mécanisme assumé, explicitement documenté. La garde ne peut pas distinguer une réécriture délibérée (avec mise à jour de la référence) d'une troncature accidentelle. C'est le même compromis que pour les plafonds de complexité (`cyclomatic-bound-ref.json`) : une modification délibérée est possible en mettant à jour la référence dans le même commit.

**Conclusion** : La garde est efficace contre la troncature **accidentelle** (re-sérialisation complète du manifeste), mais ne peut pas empêcher une réécriture **délibérée** qui met à jour la référence. C'est le prix à payer pour permettre les réécritures assumées. La protection principale reste la relecture humaine du diff.

---

## Fichiers modifiés

- `packages/scripts-ts/src/check-ci-drift.ts` — Ajout de la garde des raisons
- `packages/scripts-ts/src/reason-guard-ref.json` — Fichier de référence des empreintes
- `packages/scripts-ts/src/reason-guard-ref.ts` — Wrapper TypeScript pour l'import JSON
- `packages/scripts-ts/src/_gen-reason-ref.mts` — Script de génération de la référence
- `packages/scripts-ts/src/_test-reason-guard.mts` — Script de test (temporaire, à supprimer)
