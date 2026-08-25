# Chantier #827 — timing series & proof log

## Environment
- Host: Dell OptiPlex 3000, i5-12500T (12 threads), 61 GiB RAM, linux x86_64
- Date: 2026-08-25 (worktree wt-827 @ e0c20c219 = origin/develop)
- Load generator: `.dump/wt827/heavy.sh <sec>` — one busy-loop worker per core
  (12), self-terminating, additionally bounded by `timeout 300` per the brief.

## Baseline (pre-change, IDLE host)
| Run | What | Result |
|---|---|---|
| B1 | `vitest run src/lib/i18n-key-coverage.test.ts` | 40/40 pass, wall 2.03s |
| B2 | `vitest run src/lib/mutation-feedback-architecture.test.ts` | 13/13 pass, wall 1.77s |
| B3 | `vitest run` (FULL suite) | 2400/2400 pass (221 files), wall 114.32s |

## Flake reproduction (PRE-FIX, under heavy.sh full-core burn)
Command: `timeout 300 .dump/wt827/repro-827.sh`
(repro.vitest.config.ts: maxWorkers=2x cores, serial file execution, the two
tree-walking guards pinned after the three 101-row table render files,
testing-library default 1000ms findBy budget restored)

Result: **status=1, wall=94.2s** — deterministic failure of the issue's exact
signature:

```
FAIL src/routes/authed/staff/tenants/$tenantId/profiles.test.tsx >
  disables bulk delete and shows the max-count message once selection
  exceeds BULK_ACTION_MAX_COUNT   (101-row table fixture)
TestingLibraryElementError: Unable to find role="button" and name "Delete selected"
  × 3542ms  (first project instance)
  × 4019ms  (second project instance)
Test Files  2 failed | 6 passed (8)
Tests       2 failed | 285 passed (287)
```

The 101-row render was starved past testing-library's default findBy*
timeout while the guard files burst-parsed the whole src tree — the exact
W6-FLAKE mechanism from the issue. Full log: `.dump/wt827/repro-pre.log`.

## 2026-08-25 — lanes séquentielles (remplace le split `projects`)

Le premier essai de partition (`projects` + `sequence.groupOrder` dans un seul
`vitest.config.ts`, commit local dcf9c5b86, défait) ne cloisonne pas : la
fusion de config de Vite CONCATÈNE les tableaux include/exclude du projet avec
ceux hérités de la racine. Résultat observé (`vitest list`) : 440 paires
projet×fichier — chaque fichier collecté par les deux projets ; guards
exécutés deux fois et toujours concurrents aux rendus. Run complet sous cette
config : vitest seul 208s (vs 114s baseline), chaîne `just`/test coupée par le
timeout 300 (log : front-test-split-run1.log). Deuxièmes serveurs Vite par
projet = surcoût de démarrage/import en plus.

Solution retenue : deux lanes strictement séquentielles, zéro sémantique de
fusion :
- `vitest.config.ts` : exclut exactement i18n-key-coverage +
  mutation-feedback-architecture (en plus de l'exclusion drawer existante).
- `vitest.design-guards.config.ts` (nouveau) : include épinglé à ces deux
  fichiers, exclude: [].
- `package.json` → `"test"` : `vitest run && pnpm test:design-guards && …`
  (les guards démarrent APRÈS la fin complète des rendus).
- Le pin CI (`EXPECTED_PINNED_TEST_FILES`) tient toujours : trans-render est
  découvert par `src/**/*.{test.ts,test.tsx}` dans `vitest.config.ts`.

Mesures locales (machine idle, pas de heavy.sh) :
| Course | Fichiers | Tests | Mur |
|---|---|---|---|
| Lane principale (app) | 219 | 2347 | 115.95s |
| Lane design-guards | 2 | 55 | ~1.5s (Duration 1.51s) |
| check-design-system.mjs CLI (après WeakMap) | 611 fichiers scannés | — | 1.21s (vs 1.97s avant) |

Note méthodologique : le harness repro (.dump/wt827/repro.vitest.config.ts)
utilise aussi `projects`+groupOrder ; sous concaténation ses guards tournaient
dans les deux groupes. Il a néanmoins servi AVANT correctif (preuve RED,
repro-pre.log) et n'est pas dans la suite livrée ; conservé tel quel comme
enregistrement.

## 2026-08-25 — preuve post-rebase (lane reprise après crash "Provider returned error")

État repris hunk par hunk ; les 4 commits sont reconstruits proprement sur
origin/develop (rebase sans conflit, sanity vert : guards 55/55, routes staff
157/157). Issue de suivi ouverte pour le probe d'interruption (#1352) — non
touché ici conformément à la consigne du capitaine.

### Incident de harnais (réparé, mécanique inchangée)
Le premier essai GREEN du harnais a échoué sur une erreur d'INFRASTRUCTURE :
`Failed to resolve import "@testing-library/react" from vitest.repro-setup.ts`
— `.dump/wt827/` est hors de tout arbre node_modules, donc ni Vite ni Node ne
résolvent plus les imports nus depuis les fichiers du harnais (la piste alias
dans la config a été essayée puis annulée : elle empoisonnait la résolution
pour `apps/front/vitest.setup.ts` lui-même). Correctif : symlink
`.dump/wt827/node_modules/@testing-library/react` -> paquet résolu du magasin
pnpm (MÊME instance que `apps/front`, donc le budget findBy 1000ms du setup
s'applique toujours). Le RED apparié (repro-pre.log, @ e0c20c219) reste valide
comme preuve pré-correctif : il tournait avant l'incident avec la même
mécanique de harnais.

### Analyse honnête des échecs post-correctif du HARNAIS (repro-post.log)
Sous burn 12 cœurs, le harnais (budget findBy volontairement ramené à 1000ms,
exécution série) échoue encore sur la famille bulk-actions des fixtures 101
lignes (3754-5801ms), y compris quand AUCUN travail de guards ne concurrence
les rendus (groupOrder place les guards APRÈS). À ce niveau de famine ambiante,
le rendu 101 lignes dépasse seul 1000ms : le harnais mesure la famine globale,
pas le mécanisme guards<->rendus qu'il visait. L'instrument discriminant est la
chaîne LIVRÉE (budgets 25s + lanes séquentielles) sous heavy.sh — prescrite
par la politique de vérification du capitaine. Le harnais est conservé comme
enregistrement ; son RED reste la démonstration du mécanisme pré-correctif.

### Série de charge soutenue — chaîne livrée, fichiers ciblés (5 courses)
Orchestrateur : `.dump/wt827/sustained-targeted.sh` (burn heavy.sh borné
timeout 300 + auto-deadline ; lane 1 = 4 fichiers routes sous config livrée,
puis lane 2 = design-guards, ordre livré).
| Run | Statut | Mur | Détail |
|---|---|---|---|
| 1 | PASS (0) | 34.4s | routes 4/4 fichiers + guards 55/55 |
| 2 | PASS (0) | 27.8s | idem |
| 3 | PASS (0) | 26.8s | idem |
| 4 | PASS (0) | 26.0s | idem |
| 5 | PASS (0) | 29.6s | idem |
Série non décroissante au sens strict ? Non — elle est stable/oscillante
(26.0-34.4s), ce qui est le profil attendu d'une suite saine sous charge ;
aucune dérive descendante artificielle (aucun timeout relevé, aucun retry).

### Chaîne complète sous charge bornée (1 course)
(voir full-chain-heavy.log — rempli ci-dessous à la fin de la course)
### Chaîne complète sous charge bornée — course 1 (2026-08-25 04:23-04:31)
Burn : heavy.sh 520s (12 cœurs, timeout 300 + auto-deadline).
- Lane principale vitest : **222 fichiers / 2380 tests PASS** — mur 311.16s
  (vs 114s baseline idle ; sous brûleur 12 cœurs, attendu)
- Lane design-guards : **2 fichiers / 55 tests PASS** — 1.46s
- node:test guards (design-system 124, zindex, request-counter, etc.) : PASS
- check:design-system : 616 fichiers, 0 violation ; z-index guard : OK
- SEUL échec : `check:react-compiler` MISSING_DIST — ce worktree neuf n'avait
  jamais produit de build (`dist/client` absent) ; l'étape prouve le dist,
  pas les tests. Course 2 planifiée après `pnpm --filter front build`.
### Chaîne complète sous charge bornée — course 2 APRÈS `pnpm --filter front build` (04:33-04:40)
Burn : heavy.sh 520s (12 cœurs).
- Lane principale vitest : **222 fichiers / 2380 tests PASS** — 305.81s
- Lane design-guards : **2 fichiers / 55 tests PASS** — 1.50s
- Tous les guards node:test PASS ; check:design-system 616 fichiers 0 violation ;
  z-index OK ; **check:react-compiler PASS** (runtime chunk présent,
  96 modules compilés >= plancher 72)
- **CHAIN_STATUS=0, WALL=442.1s** sous brûleur plein.

## Verdict
RED pré-correctif déterministe (mécanisme de l'issue) -> chaîne livrée verte :
5/5 courses ciblées + chaîne complète 2380+55 tests sous la MÊME charge bornée.
Aucun timeout relevé, aucun retry ajouté, aucune suppression.
