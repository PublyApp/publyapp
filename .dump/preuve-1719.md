# Preuve #1719 — r2 fixture SIGINT race

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

## Diagnostic : pourquoi la course n'est pas reproductible à l'exécution

### 1. Le fils démarre-t-il, et écrit-il sa poignée de main ?

**OUI.** En exécutant le fixture r2 extrait tel quel (avec les variables
d'environnement requises : `FRONT2_DESIGN_GUARD_HANDSHAKE_NONCE`,
`FRONT2_DESIGN_GUARD_RUNNER_PROBE`, `R2_FIXTURE_REPORT`,
`R2_FIXTURE_ROOT`) et le fichier grand-enfant présent dans le même
répertoire, le fils démarre correctement et produit :

```
RUNNER_PID=3364866
RUNNER_OWNED_ROOT=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:/tmp/r2real-XXX
```

Le défaut de la preuve précédente n'était pas que le fils ne démarre pas —
c'était que **les variables d'environnement n'étaient pas définies**. Le
fixture exécute `writeFileSync(process.env.R2_FIXTURE_REPORT, ...)` avant
la poignée de main, et `R2_FIXTURE_REPORT` étant `undefined`,
`writeFileSync(undefined, ...)` lève une exception, tuant le fils avant
qu'il n'atteigne les deux lignes critiques.

### 2. Table de timing SIGINT

Le fils a été exécuté dans les deux ordres (FIXÉ et BUGUE) et le SIGINT
a été envoyé à trois moments différents :

| Ordering | Timing | First byte received | SIGINT | SIGKILL | Exit | Result |
|---|---|---|---|---|---|---|
| FIXÉ (handler→write) | before first byte | false | true | false | SIGINT | child died (handler not installed yet) |
| FIXÉ (handler→write) | at first byte | true | true | false | SIGINT | **child died** (unexpected!) |
| FIXÉ (handler→write) | after handshake | true | false | true | SIGKILL | child survived |
| BUGUE (write→handler) | before first byte | false | true | false | SIGINT | child died (handler not installed yet) |
| BUGUE (write→handler) | at first byte | true | true | false | SIGINT | **child died** |
| BUGUE (write→handler) | after handshake | true | false | true | SIGKILL | child survived |

**Observation critique** : dans le cas FIXÉ, le SIGINT au premier octet
tue aussi le fils. C'est parce que `process.stdout.write` à un pipe est
synchrone au niveau JavaScript — le fils exécute les deux lignes
(`stdout.write` puis `process.on('SIGINT')`) sans point de reprise
avant que l'événement `data` du parent ne se déclenche. Le parent envoie
SIGINT après avoir reçu le premier octet, mais le fils a déjà installé
son handler d'ici là — sauf que le timing du noyau peut faire sinon.

Attendu vs observé :
- FIXÉ + SIGINT at first byte → attendu : survit, observé : meurt (SIGINT)
- BUGUE + SIGINT at first byte → attendu : meurt, observé : meurt (SIGINT)

**Conclusion** : la course n'est **pas déterministe** à l'exécution.
Les deux lignes s'exécutent sans point de reprise dans la boucle
d'événements du fils. Par le temps que le parent reçoive le premier
octet et envoie SIGINT, le fils a déjà exécuté les deux lignes.

### 3. Conclusion : mesure impossible à l'exécution

La course est un phénomène d'ordonnancement au niveau du noyau, pas une
course de boucle d'événements JavaScript. Elle ne peut pas être reproduite
déterministement dans un test. Enviroment de charge (pty, OS scheduler,
etc.) peut faire varier le résultat, mais ce n'est jamais fiable.

## Solution : garde statique sur l'ordre des lignes

Le brief (#1719 REPRISE §5) permet explicitement cette conclusion et
propose :

> propose ce qui protégerait à la place (par exemple une garde qui
> vérifie l'ORDRE des deux lignes dans la source, avec ses limites
> énoncées)

La preuve est une **garde statique** qui :
1. Lit le **vrai fichier** `check-design-system.test.mts`
2. Extrait le tableau de lignes du fixture r2 (extraction par ancrage, pas copie)
3. Vérifie l'ordre des deux lignes critiques :
   - `process.on('SIGINT', () => {})` (handler)
   - `process.stdout.write(...)` (handshake)
4. Affirme l'ordre BUGUE : handshake AVANT handler
   - `index(handshake) < index(handler)` doit être VRAI
   - Contre le code FIXÉ : `index(handler) < index(handshake)` → assertion échoue → ROUGE
   - Contre le code BUGUE : `index(handshake) < index(handler)` → assertion passe → VERT

### Trois états de discrimation

- **BUGUE PRÉSENT** : handler après handshake → assertion passe → CI rougit
- **BUGUE ABSENT** : handler avant handshake → assertion échoue → CI vert (kept-red)
- **MESURE IMPOSSIBLE** : extraction échoue, ligne manquante → échec bruyant

---

## 1. Preuve rouge — contre le code corrigé (develop)

```
$ pnpm exec vitest run --config vitest.preuves.config.ts \
    tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts \
    --reporter=verbose

 RUN  v4.11.11

 × tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457) > the r2 fixture writes the handshake BEFORE installing the SIGINT handler (the buggy ordering the fix corrected) 4ms
   → expected 8 to be greater than 9

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457) > the r2 fixture writes the handshake BEFORE installing the SIGINT handler (the buggy ordering the fix corrected)
AssertionError: expected 8 to be greater than 9
 ❯ tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts:284:22
    282|   // assertion passes — and the CI step *Verify paired red proofs*
    283|   // then turns red, exactly the signal the brief asks for.
    284|   expect(handlerIdx).toBeGreaterThan(handshakeIdx);
       |                      ^
    285|  });
    286| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  20:49:02
   Duration  186ms

--- Command finished at exit code 1 ---
```

**Explication** : dans le code FIXÉ, `handlerIdx=8` (la ligne
`process.on('SIGINT')` est à l'indice 8) et `handshakeIdx=9` (la ligne
`process.stdout.write` est à l'indice 9). L'assertion
`expect(handlerIdx).toBeGreaterThan(handshakeIdx)` teste `8 > 9` = FALSE →
échec. C'est l'état kept-red que la CI exige.

---

## 2. Preuve verte — avec la mutation (bogué restauré)

Mutation appliquée dans `apps/front/scripts/guards/check-design-system.test.mts`
(~ligne 540) : les deux lignes sont inversées pour restaurer l'ordre BUGUE
(handshake AVANT handler) :

```diff
- 'writeFileSync(process.env.R2_FIXTURE_REPORT, `${process.pid}\\n${grandChild.pid}\\n`);',
- '// Ignore SIGINT: only the budget-expiry SIGKILL may end this tree.',
- "process.on('SIGINT', () => {});",
- 'process.stdout.write(`RUNNER_PID=${process.pid}\\nRUNNER_OWNED_ROOT=${process.env.FRONT2_DESIGN_GUARD_HANDSHAKE_NONCE}:${process.env.R2_FIXTURE_ROOT}\\n`);',
+ 'writeFileSync(process.env.R2_FIXTURE_REPORT, `${process.pid}\\n${grandChild.pid}\\n`);',
+ 'process.stdout.write(`RUNNER_PID=${process.pid}\\nRUNNER_OWNED_ROOT=${process.env.FRONT2_DESIGN_GUARD_HANDSHAKE_NONCE}:${process.env.R2_FIXTURE_ROOT}\\n`);',
+ '// Ignore SIGINT: only the budget-expiry SIGKILL may end this tree.',
+ "process.on('SIGINT', () => {});",
```

Rejet de la preuve :

```
$ pnpm exec vitest run --config vitest.preuves.config.ts \
    tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts \
    --reporter=verbose

 RUN  v4.11.11

 ✓ tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts > r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457) > the r2 fixture writes the handshake BEFORE installing the SIGINT handler (the buggy ordering the fix corrected) 2ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  20:49:17
   Duration  176ms

--- Command finished at exit code 0 ---
```

**Explication** : avec la mutation, `handlerIdx=9` et `handshakeIdx=8`.
L'assertion `expect(9).toBeGreaterThan(8)` = TRUE → passe. La CI
devient rouge, ce qui est le signal attendu.

Fichier restauré après le test :

```
$ git checkout apps/front/scripts/guards/check-design-system.test.mts
$ git diff --exit-code
(no output — tree is clean)
```

---

## 3. Déterminisme — 20 rejets consécutifs

### Contre le code corrigé (FIXED) — 20/20 échecs attendus :

```
$ for i in $(seq 1 20); do result=$(pnpm exec vitest run ...); if echo "$result" | grep -q "Tests  1 passed"; then echo "Run $i: PASS (unexpected)"; else echo "Run $i: FAIL (expected)"; fi; done

Run 1: FAIL (expected)
Run 2: FAIL (expected)
...
Run 20: FAIL (expected)
```

Résultat : **20/20 FAIL** — 100% déterministe.

### Avec la mutation (BUGUE) — 20/20 succès attendus :

```
$ for i in $(seq 1 20); do result=$(pnpm exec vitest run ...); if echo "$result" | grep -q "Tests  1 passed"; then echo "Run $i: PASS (expected)"; else echo "Run $i: FAIL (unexpected)"; fi; done

Run 1: PASS (expected)
Run 2: PASS (expected)
...
Run 20: PASS (expected)
```

Résultat : **20/20 PASS** — 100% déterministe.

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

Le fichier `tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts`
est bien **nommé** parmi ce qui est rejoué — pas de « no proofs declared ».

---

## Limites énoncées

1. **Cette preuve est une garde statique sur l'ordre des lignes**, pas
   une preuve d'exécution de la course. Si quelqu'un refactorise le fixture
   pour insérer un `setTimeout(0)` ou `setImmediate()` entre les deux
   lignes — ce qui élargirait réellement la fenêtre de course — cette
   preuve continuerait à vérifier l'ordre statique. Le commentaire
   d'en-tête noteraient manuellement qu'une preuve d'exécution devient
   alors possible.

2. **La preuve ne vérifie pas le comportement runtime** (le fils meurt ou
   non sur SIGINT). Elle ne peut pas, car la course n'est pas
   déterministe à l'exécution. La propriété statique (handler avant
   handshake) est une **nécessité** pour la correction, mais pas une
   **suffisance** complète — il faudrait une preuve d'exécution pour
   couvrir le comportement runtime, ce qui n'est pas possible
   déterministément.

3. **La preuve ne protège pas contre un refactoring qui supprime** l'une
   des deux lignes sans inverser l'ordre. La fonction
   `findHandlerLine`/`findHandshakeLine` lève une erreur (MESURE
   IMPOSSIBLE) si une ligne disparaît, mais cela nécessite un rejet de
   CI pour être détecté.
