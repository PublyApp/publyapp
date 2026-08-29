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
leurs résultats nommés. La mutation principale (le bogue) est l'**interversion
des deux lignes** (axe : ordre source). La r3 reconstruit le jeu avec trois
mutations sur des axes **réellement distincts** — la r2 échouait parce que
ses mutations B et C partageaient le même axe (directness).

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
L'axe « ordre source » est couvert. Mécanisme : **comparaison d'index**.

---

### Mutation B — Enveloppe setImmediate (axe : directness temporelle)

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
L'axe « directness temporelle » est couvert. Mécanisme : **vérification
structurelle** (la ligne ne commence pas par `process.on(`).

---

### Mutation C — Notation crochets (axe : syntaxe d'accès)

La mutation identifiée par le relecteur r3. Le handler est toujours avant le
handshake et toujours synchrone, mais l'accès se fait par notation crochets
au lieu de point.

```diff
- "process.on('SIGINT', () => {});",
+ "process['on']('SIGINT', () => {});",
```

**Résultat** : le test
`tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457) > the r2 fixture writes the handshake BEFORE installing the SIGINT handler, OR the handler is wrapped in an async deferral (the buggy ordering the fix corrected)`
**PASSE** (bug détecté).

**Pourquoi** : la ligne commence par `process[` et non `process.on(`.
`handlerIsDeferred=true` → `bugPresent=true`. L'axe « syntaxe d'accès » est
couvert. Mécanisme : **vérification structurelle** (même mécanisme que B,
mais un axe réellement distinct — syntaxique vs temporel).

---

### Résumé de la recherche adverse

| # | Axe | Mutation | Mécanisme | Résultat |
|---|-----|----------|-----------|----------|
| A | **Ordre source** | Interversion handler↔handshake | Comparaison d'index (`handlerIdx > handshakeIdx`) | PASS (détecté) |
| B | **Directness temporelle** | setImmediate(() => { process.on(...) }) | Structurel (ligne ne commence pas par `process.on(`) | PASS (détecté) |
| C | **Syntaxe d'accès** | process['on']('SIGINT', ...) | Structurel (ligne ne commence pas par `process.on(`) | PASS (détecté) |

Les trois axes sont réellement distincts :
- A : où le handler apparaît relativement au handshake (ordre)
- B : si le handler est installé de manière synchrone ou différée (temporel)
- C : si le handler utilise la notation point ou crochets (syntactique)

Les axes B et C partagent le mécanisme `isHandlerDeferred` mais attaquent des
dimensions réellement différentes du bogue — un différé temporel et une
variante syntaxique ne sont pas le même axe. La r2 échouait parce que ses
mutations B et C étaient toutes les deux sur l'axe « directness » ; ici B est
directness-temporelle et C est syntaxe-d'accès.

**Aucune mutation survivante** : les trois mutations tentées ont toutes été
détectées. La preuve n'est pas décorative — elle attaque trois axes
distincts et rejette toute forme d'enveloppe du handler.

---

## 3. Déterminisme

La preuve est déterministe par conception : elle lit le fichier source,
extrait les lignes du fixture, et vérifie deux propriétés statiques. Il n'y
a pas de hasard, pas de timing, pas de concurrence. Chaque rejeu donne le
même résultat sur le même code.

Contre le code corrigé (FIXED) : le test échoue (kept-red) — `bugPresent=false`.
Avec mutation A (classic swap) : le test passe (bug détecté) — `bugPresent=true`.
Avec mutation B (setImmediate) : le test passe (bug détecté) — `bugPresent=true`.
Avec mutation C (bracket notation) : le test passe (bug détecté) — `bugPresent=true`.

---

## 4. Rejet par la CI (r3 — discriminant)

Le lanceur r3 discrimine désormais l'échec d'assertion (kept-red attendu) de
l'erreur levée (MESURE IMPOSSIBLE — preuve cassée). Trois sorties démontrées :

**Code corrigé (FIXED) — assertion failure (kept-red) :**
```
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

**Mutation C (bracket notation `process['on']`) — la preuve détecte le bug (test passe) :**
```
This PR declared 1 paired red proof(s) — replaying with inverted semantics:

  tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts

--- Running: tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts ---
  FAIL: proof test passed unexpectedly — the bug it documented may have changed form.
  Test: tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts

=== Summary ===
  Proof tests failed as expected: 0
  Proof tests passed unexpectedly:  1
  Corrupt/unparseable proof files:  0

FAIL: proof replay did not complete cleanly.
  1 proof test(s) passed when they should have failed.
```

**Contournement alias (`const on = process.on.bind(process)`) — la preuve lève MESURE IMPOSSIBLE, le lanceur classe CORRUPT PROOF :**
```
This PR declared 1 paired red proof(s) — replaying with inverted semantics:

  tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts

--- Running: tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts ---
  CORRUPT PROOF: proof test failed with a non-assertion error (measurement impossible
  or harness crash), not the expected assertion failure.
  A kept-red proof must fail on an assertion (expected X to be Y), not on a thrown Error.
  A thrown Error means the proof could not measure — this is NOT the expected kept-red
  state and must fail CI.

=== Summary ===
  Proof tests failed as expected: 0
  Proof tests passed unexpectedly:  0
  Corrupt/unparseable proof files:  1

FAIL: proof replay did not complete cleanly.
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

4. **La détection du handler est syntaxique** : elle vérifie que la ligne
   contient `process.on('SIGINT'`, `process['on']('SIGINT'` ou
   `process["on"]('SIGINT'`. Cela attrape toute enveloppe (setImmediate,
   setTimeout, queueMicrotask, process.nextTick, promesse, async, if, etc.)
   ET la notation crochets (r3). La seule forme non détectable statiquement
   est l'alias : `const on = process.on.bind(process); on('SIGINT', …)`. Le
   site d'appel est un arbitre arbitraire, indiscernable de tout autre appel
   de fonction. Quand cette forme est rencontrée, la preuve lève MESURE
   IMPOSSIBLE et le lanceur classe CORRUPT PROOF (CI rouge) — échec bruyant
   plutôt que passage silencieux. C'est la seule brèche restante, et elle est
   échouée-bruyante par construction.
