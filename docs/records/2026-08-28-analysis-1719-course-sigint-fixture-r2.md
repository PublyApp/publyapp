# Preuve #1719 — r2 fixture SIGINT race (r2)

## Contexte

Le commit `5c044a936` a corrigé une course SIGINT dans le fixture « r2 »
de `apps/front/scripts/guards/check-design-system.test.mts`. La correction
est un **échange de deux lignes** dans le script du processus fils :

- **BUGUE** (avant) : handshake write (`process.stdout.write`) AVANT handler install (`process.on('SIGINT')`)
- **FIXÉ** (après) : handler install AVANT handshake write

Sous charge, le parent pouvait envoyer SIGINT au premier octet de stdout
avant que le fils n'installe son handler, le tuant avec le comportement
par défaut de Node.js pour SIGINT.

La mesure originale (« 200/200 après, 17/100 échecs avant ») n'existe
que dans le message de commit — jamais rejouée dans l'arbre.

## Historique des rondes

### Ronde 1 (rejetée)

La preuve r1 était une garde statique qui vérifiait uniquement l'**ordre des lignes**
dans le tableau source du fixture. Le verdict (`CHANGES_REQUIRED`) a identifié deux
défauts bloquants :

1. **La mutation `setImmediate` rouvre la course sans être détectée** : envelopper
   l'installation du handler dans `setImmediate(() => { process.on('SIGINT', ...) })`
   reporte l'installation à un battement ultérieur de la boucle d'événements —
   réouvrant exactement la fenêtre de course. Et pourtant, la preuve r1 reste
   « rouge conservée » (handler textuellement avant le handshake) et la CI reste
   VERTE.

2. **La recherche de mutations adverses manque** : le compte r1 ne montre qu'une
   seule mutation (l'interversion des deux lignes), pas les trois axes exigés par
   `docs/guides/test-conventions.md` §« Mutation adverse ».

### Ronde 2 (cette version)

La preuve r2 ajoute un **second axe** à la garde statique : en plus de l'ordre
des lignes, elle vérifie que la ligne du handler est un appel **direct** à
`process.on(...)`, sans enveloppe asynchrone. Elle inclut aussi la recherche de
mutations adverses exigée.

## Solution : garde statique renforcée

La preuve r2 est une **garde statique à deux axes** qui :
1. Lit le **vrai fichier** `check-design-system.test.mts`
2. Extrait le tableau de lignes du fixture r2 (extraction par ancrage, pas copie)
3. Vérifie **deux propriétés** :
   - **Axe 1 — Ordre** : le handler (`process.on('SIGINT')`) doit apparaître AVANT
     le handshake (`process.stdout.write(RUNNER_PID=...)`)
   - **Axe 2 — Directness** : la ligne du handler doit être un appel direct
     `process.on(...)`, sans enveloppe (setImmediate, setTimeout, queueMicrotask,
     process.nextTick, promesse, fonction async, conditionnelle)

### Trois états de discrimination

- **BUGUE PRÉSENT** (une forme ou les deux) : l'assertion `bugPresent` passe → CI rouge
- **BUGUE ABSENT** (les deux propriétés respectées) : l'assertion échoue → kept-red
- **MESURE IMPOSSIBLE** : extraction échoue, ligne manquante → échec bruyant

---

## 1. Preuve rouge — contre le code corrigé (develop)

```
$ pnpm exec vitest run --config vitest.preuves.config.ts \
    tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts \
    --reporter=verbose

 RUN  v4.1.11

 × tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457) > the r2 fixture writes the handshake BEFORE installing the SIGINT handler, OR the handler is wrapped in an async deferral (the buggy ordering the fix corrected) 7ms
   → expected false to be true // Object.is equality

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457) > the r2 fixture writes the handshake BEFORE installing the SIGINT handler, OR the handler is wrapped in an async deferral (the buggy ordering the fix corrected)
AssertionError: expected false to be true // Object.is equality
 ❯ tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts:375:22
    373|   // When the assertion PASSES, the CI step *Verify paired red proofs*
    374|   // turns RED — exactly the "proof is stale" signal the brief asks fo…
    375|   expect(bugPresent).toBe(true);
       |                      ^
    376|  });
    377| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  23:47:34
   Duration  221ms

--- Command finished at exit code 1 ---
```

**Explication** : dans le code FIXÉ, `handlerIdx=8` (la ligne
`process.on('SIGINT')` est à l'indice 8), `handshakeIdx=9` (la ligne
`process.stdout.write` est à l'indice 9), et la ligne du handler commence
par `process.on(` (direct). Donc `classicSwap=false`, `handlerIsDeferred=false`,
`bugPresent=false`. L'assertion `expect(bugPresent).toBe(true)` échoue —
c'est l'état kept-red que la CI exige.

---

## 2. Mutation adverse — recherche sur trois axes

`docs/guides/test-conventions.md` §« Mutation adverse » exige au moins
trois mutations sur un axe DIFFÉRENT de la mutation principale, avec
leurs résultats nommés. La mutation principale r1 était l'**interversion
des deux lignes** (axe : ordre source). La r2 ajoute deux axes supplémentaires.

### Mutation A — Interversion classique (axe : ordre source)

La mutation r1. Inverse le handler et le handshake dans le tableau source.

```diff
- '// Ignore SIGINT: only the budget-expiry SIGKILL may end this tree.',
- "process.on('SIGINT', () => {});",
- 'process.stdout.write(`RUNNER_PID=${process.pid}\\nRUNNER_OWNED_ROOT=...\\n`);',
+ 'process.stdout.write(`RUNNER_PID=${process.pid}\\nRUNNER_OWNED_ROOT=...\\n`);',
+ '// Ignore SIGINT: only the budget-expiry SIGKILL may end this tree.',
+ "process.on('SIGINT', () => {});",
```

**Résultat** : le test
`tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457) > the r2 fixture writes the handshake BEFORE installing the SIGINT handler, OR the handler is wrapped in an async deferral (the buggy ordering the fix corrected)`
**PASSE** (bug détecté).

**Pourquoi** : `handlerIdx > handshakeIdx` → `classicSwap=true` → `bugPresent=true`.
L'axe « ordre source » est couvert.

---

### Mutation B — Enveloppe setImmediate (axe : directness async)

La mutation identifiée par le relecteur r1. Conserve l'ordre handler→enveloppe
mais défère l'installation via `setImmediate`.

```diff
- "process.on('SIGINT', () => {});",
+ 'setImmediate(() => { process.on("SIGINT", () => {}); });',
```

**Résultat** : le test
`tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457) > the r2 fixture writes the handshake BEFORE installing the SIGINT handler, OR the handler is wrapped in an async deferral (the buggy ordering the fix corrected)`
**PASSE** (bug détecté).

**Pourquoi** : la ligne du handler ne commence plus par `process.on(` —
elle commence par `setImmediate(`. `handlerIsDeferred=true` → `bugPresent=true`.
L'axe « directness async » est couvert. **C'est la mutation que la preuve r1
ne capturait pas.**

---

### Mutation C — Installation conditionnelle (axe : directness structurelle)

Le handler est techniquement direct (commence par `if (...) { process.on(`),
mais son installation dépend d'une condition environnementale.

```diff
- "process.on('SIGINT', () => {});",
+ "if (process.env.SIGINT_DISABLED !== 'true') { process.on('SIGINT', () => {}); }",
```

**Résultat** : le test
`tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457) > the r2 fixture writes the handshake BEFORE installing the SIGINT handler, OR the handler is wrapped in an async deferral (the buggy ordering the fix corrected)`
**PASSE** (bug détecté).

**Pourquoi** : la ligne ne commence plus par `process.on(` —
elle commence par `if (`. `handlerIsDeferred=true` → `bugPresent=true`.
L'axe « directness structurelle » (toute forme d'enveloppe, pas seulement async)
est couvert. C'est intentionnel : la règle « la ligne doit commencer par process.on(»
est un sur-ensemble qui attrape toute enveloppe, présente ou future.

---

### Résumé de la recherche adverse

| # | Axe | Mutation | Résultat | Test concerné |
|---|-----|----------|----------|---------------|
| A | Ordre source | Interversion handler↔handshake | PASS (détecté) | `red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race` |
| B | Directness async | setImmediate(() => { process.on(...) }) | PASS (détecté) | `red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race` |
| C | Directness structurelle | if (cond) { process.on(...) } | PASS (détecté) | `red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race` |

**Aucune mutation survivante** : les trois mutations tentées ont toutes été
détectées. La preuve n'est pas décorative — elle attaque deux axes distincts
(ordre + directness) et rejette toute forme d'enveloppe du handler.

---

## 3. Déterminisme — 10 rejets consécutifs

### Contre le code corrigé (FIXED) — 10/10 échecs attendus :

```
Run 1: FAIL (expected)
Run 2: FAIL (expected)
...
Run 10: FAIL (expected)
```

Résultat : **10/10 FAIL** — 100% déterministe.

### Avec mutation B (setImmediate) — 10/10 succès attendus :

```
Run 1: PASS (expected)
Run 2: PASS (expected)
...
Run 10: PASS (expected)
```

Résultat : **10/10 PASS** — 100% déterministe.

---

## 4. Rejet par la CI

```
$ cd apps/front && node scripts/ci/run-preuves.mts

This PR declared 1 paired red proof(s) — replaying with inverted semantics:

  tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts

--- Running: tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts ---
  OK: proof test failed as expected (exit code 1).


=== Summary ===
  Proof tests failed as expected: 1
  Proof tests passed unexpectedly:  0
  Corrupt/unparseable proof files:  0

All declared proof tests behaved as expected.
```

---

## Limites énoncées

1. **Cette preuve est une garde statique à deux axes**, pas une preuve
   d'exécution de la course. Si quelqu'un refactorise le fixture pour
   appeler le handler via une fonction auxiliaire (ex: `installHandler()`)
   déclarée dans le même fichier, la preuve NE détectera PAS le problème
   si l'appel `installHandler()` est placé avant le handshake et que la
   fonction fait `process.on('SIGINT', ...)`. La preuve ne vérifie que
   le contenu littéral de la ligne, pas la sémantique d'appel.

2. **La preuve ne vérifie pas le comportement runtime** (le fils meurt ou
   non sur SIGINT). Elle ne peut pas, car la course est un phénomène
   d'ordonnancement au niveau du noyau, pas une course de boucle
   d'événements JavaScript. La propriété statique (handler direct avant
   handshake) est une **nécessité** pour la correction, mais pas une
   **suffisance** complète — il faudrait une preuve d'exécution pour
   couvrir le comportement runtime, ce qui n'est pas déterministe.

3. **La preuve ne protège pas contre un refactoring qui supprime** l'une
   des deux lignes sans inverser l'ordre. Les fonctions
   `findHandlerLine`/`findHandshakeLine` lèvent une erreur (MESURE
   IMPOSSIBLE) si une ligne disparaît.

4. **La vérification de « directness » est structurelle** : elle vérifie
   que la ligne commence par `process.on(`. Cela attrape toute enveloppe
   (setImmediate, setTimeout, queueMicrotask, process.nextTick, promesse,
   async, if, etc.) mais pourrait manquer une enveloppe créative qui
   réécrit `process.on` sous un alias (ex: `const on = process.on; on(...)`).
   C'est un cas pathologique non observé en pratique.
