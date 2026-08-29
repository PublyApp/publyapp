# Preuve r6 — correction du Step 4b et ajout du Step 3b

**Issue :** #1457 / #1783 (PR #1806)
**Ronde :** r6
**Branche :** `lane/wt-1783`
**Worktree :** `wt-1774`
**Fichier de preuve :** `apps/front/tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts`
**Remplace :** `docs/records/2026-08-29-preuve-r4-two-step-pipeline.md`

## Ce que la ronde a fait

### Problème identifié dans la ronde r5

La ronde r5 a ajouté un **Step 4b** (sanity check) pour faire passer une ligne
de notation crochet différée à `isHandlerDeferred`. Mais la ligne choisie était :

```js
const knownBracketDeferredLine = `setImmediate(() => { process['on']('SIGINT', () => {}); });`;
```

Cette ligne commence par `setImmediate(`, **pas** par `process['on'](`. La
fonction `isHandlerDeferred` ne regarde que le préfixe de la ligne, donc elle
classait correctement cette ligne comme différée (true) — même si le bug
Mutation F (accepter la notation crochet comme non-différé) était présent.

**Résultat :** Step 4b ne lançait jamais `MESURE IMPOSSIBLE` pour Mutation F.
Le coureur n'avait aucun signal d'erreur et classait le fichier comme OK (CI vert).
La mutation F survivait à la CI verte.

Le document r4 (`2026-08-29-preuve-r4-two-step-pipeline.md`) revendiquait à tort
que Mutation F est détectée par Step 4b — cette revendication est **fausse**.

### Problème identifié dans la ronde r5 — Mutation G

Une mutation supplémentaire, **Mutation G** (`isHandlerDeferred` retourne toujours `true`),
n'était pas détectée non plus. Sans Step 3b :

- **Test 1** (le test principal) échoue sur assertion : `bugPresent` est `true`
  (handler misé en évidence comme différé) → assertion `expect(bugPresent).toBe(true)` PASSE.
- **Test 2** (pipeline) échoue sur Step 5 : `expect(isHandlerDeferred(deferredLine)).toBe(false)`
  — mais `isHandlerDeferred` retourne toujours `true`, donc l'attente `false` ÉCHEC.

Le coureur voit "Tests 1 failed" avec AssertionError. Sans `MESURE IMPOSSIBLE` dans
la sortie, il classifie comme "échec attendu" → CI verte. **La mutation G survivait.**

### Fix r6

#### Step 4b corrigé

`knownBracketDeferredLine` est changé de :

```js
// AVANT (r5 — ne commence pas par process['on']()
const knownBracketDeferredLine = `setImmediate(() => { process['on']('SIGINT', () => {}); });`;
```

à :

```js
// APRÈS (r6 — commence bien par process['on'()
const knownBracketDeferredLine = `process['on']('SIGINT', () => {});`;
```

Cette ligne commence par `process['on'](` — la forme crochet directe. Sauf
forme `process.on(`, elle ne commence PAS par `process.on(`, donc
`isHandlerDeferred` **doit** la classer comme différé (true). Si Mutation F
affaiblit `isHandlerDeferred` pour accepter `process['on'](` comme non-différé,
la fonction renvoie `false`, le sanity check lance `MESURE IMPOSSIBLE`, et le
coureur classe en **CORRUPT PROOF** (CI rouge).

#### Step 3b ajouté

Un nouveau sanity check avant Step 4b :

```js
const knownDirectLine = `process.on('SIGINT', () => {});`;
if (isHandlerDeferred(knownDirectLine)) {
    throw new Error(`MESURE IMPOSSIBLE — isHandlerDeferred misclassified a known-direct handler line as deferred...`);
}
```

Sur le code correct, `isHandlerDeferred` renvoie `false` pour une ligne directe.
Mutation G (`return true`) renvoie `true` → lance `MESURE IMPOSSIBLE` → **CORRUPT PROOF**.

### Pourquoi deux sanity checks (Step 3b et Step 4) sont nécessaires

- **Step 3b** attrape `isHandlerDeferred` = toujours `true` (Mutation G) : la fonction
  classe un direct comme différé.
- **Step 4** attrape `isHandlerDeferred` = toujours `false` (Mutation E) ou inversée
  (Mutation D) : la fonction classe un différé comme non-différé.
- **Step 4b** attrape Mutation F : la fonction accepte la notation crochet comme non-différé.

Chacun de ces trois affirmations est l'opposé de l'autre — un seul sanity check
ne peut pas attraper les trois mutations car elles produisent des effets
contradires sur la même entrée.

## Mutations défensives — tableau récapitulatif

| # | Mutation | Axe | Détecté par | Résultat |
|---|---------|-----|-------------|----------|
| C | `findHandlerLine` régressé en regex dot-only (`/process\.on/…`) | Syntaxe (localisation) | Step 3 THROW : `findHandlerLine` lève `MESURE IMPOSSIBLE` sur `process['on']` → **CORRUPT PROOF** | ✓ CI rouge |
| D | `isHandlerDeferred` inversé (`return line.trim().startsWith('process.on(')`) | Temporalité (classification) | Step 4 sanity THROW : `isHandlerDeferred(knownDeferredLine)` → `false` → lève `MESURE IMPOSSIBLE` → **CORRUPT PROOF** | ✓ CI rouge |
| E | `isHandlerDeferred` toujours faux (`return false`) | Temporalité (classification) | Step 4 sanity THROW : `isHandlerDeferred(knownDeferredLine)` → `false` → lève `MESURE IMPOSSIBLE` → **CORRUPT PROOF** | ✓ CI rouge |
| F | `isHandlerDeferred` accepte les crochets comme non-différés (`!(startsWith('process.on(') \|\| startsWith("process['on']"))`) | Syntaxe + temporalité | Step 4b sanity THROW : `isHandlerDeferred(knownBracketDeferredLine)` → `false` → lève `MESURE IMPOSSIBLE` → **CORRUPT PROOF** | ✓ CI rouge (r6) |
| G | `isHandlerDeferred` toujours vrai (`return true`) | Temporalité (classification) | Step 3b sanity THROW : `isHandlerDeferred(knownDirectLine)` → `true` → lève `MESURE IMPOSSIBLE` → **CORRUPT PROOF** | ✓ CI rouge (r6) |

### Ce que le document r4 affirmait à tort

Le document r4 revendiquait :

> - [x] Mutation F → CORRUPT PROOF (r5 : Step 4b lève MESURE IMPOSSIBLE sur ligne crochet difféée)

Cette assertion est **fausse**. La ronde r5 n'a pas vérifié que `knownBracketDeferredLine`
commençait réellement par `process['on'](`. La ligne choisie commençait par `setImmediate(`,
donc `isHandlerDeferred` la classait correctement comme différé même avec Mutation F
appliquée. Aucun `MESURE IMPOSSIBLE` n'était lancé. La mutation F a survivé.

Le document r4 a également omis Mutation G (`return true`), qui survivait pour
la même raison : le coureur malclassifiait un AssertionError comme "échec attendu"
sans l'absence de `MESURE IMPOSSIBLE` dans la sortie.

## Processus de détection en deux étapes

1. **LOCALISER** — `findHandlerLine` localise la ligne du handler via regex
   (gère `process.on(`, `process['on']`, et `process["on"]`). Rétrogration en dot-only → `MESURE IMPOSSIBLE`.
2. **CLASSIFIER** — `isHandlerDeferred` classe la ligne comme directe
   (`process.on(` → `false`) ou différée (tout le reste → `true`). Rétrogradation → `MESURE IMPOSSIBLE`
   via Step 3b, 4, ou 4b selon la forme de la rétrogradation.

## Vérifications

- [x] Les deux tests échouent sur code correct (rouge gardé, état attendu)
- [x] Typecheck passe (exit code 0)
- [x] Mutation C → CORRUPT PROOF (MESURE IMPOSSIBLE depuis findHandlerLine)
- [x] Mutation D → CORRUPT PROOF (MESURE IMPOSSIBLE depuis Step 4 sanity)
- [x] Mutation E → CORRUPT PROOF (MESURE IMPOSSIBLE depuis Step 4 sanity)
- [x] Mutation F → CORRUPT PROOF (MESURE IMPOSSIBLE depuis Step 4b sanity) — **corrigé en r6**
- [x] Mutation G → CORRUPT PROOF (MESURE IMPOSSIBLE depuis Step 3b sanity) — **nouveau en r6**

## Fichiers modifiés

- `apps/front/tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts`
  - Step 4b corrigé : `knownBracketDeferredLine` changé de `setImmediate(() => { process['on'](...) })` à `process['on'](...)` direct
  - Step 3b ajouté : sanity check sur une ligne directe `process.on('SIGINT', () => {})`
  - En-tête "Enhancement (r5/r6)" mis à jour
  - Mutations F et G documentées dans la section "Mutations to introduce the red"
  - Commentaires Step 5 mis à jour pour mentionner Mutation G
- `docs/records/2026-08-29-preuve-r6-step4b-step3b.md` (ce fichier — remplace le r4)
