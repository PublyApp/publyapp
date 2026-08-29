# Preuve r4 — deux mécanismes de détection, un seul rouge gardé

**Issue :** #1457 / #1783 (PR #1806)
**Ronde :** r4
**Branche :** `lane/wt-1783`
**Worktree :** `wt-1774`
**Fichier de preuve :** `apps/front/tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts`

## Ce que la ronde a fait

Le test décoratif de la ronde précédente appelait `isHandlerDeferred` avec des
chaînes codées en dur et n'exerçait jamais `findHandlerLine`. Il restait vert
même si `findHandlerLine` régressait entièrement. La ronde referme cet écart en
réécrivant le second test pour exercer le pipeline de détection réel en deux
étapes :

1. **`extractR2FixtureLines`** — extrait les lignes réelles du fixture de production
   (pas des chaînes codées en dur).
2. **`findHandlerLine`** — localise la ligne du handler via regex (gère `process.on(`
   ET `process['on']('SIGINT')`).
3. **Test THROW (pas assertion)** — sur une variante bracket-notation du même
   handler : si `findHandlerLine` régressé en dot-only ne trouve pas la ligne,
   elle lève `MESURE IMPOSSIBLE` → le coureur classe en `CORRUPT PROOF` (CI rouge).
4. **Assertion rouge gardé** — sur une ligne `setImmediate(() => { ... })` dérivée
   du handler réel : `isHandlerDeferred(deferredLine)` renvoie `true` sur code
   correct ; l'assertion exige `false` → échoue sur code correct (rouge gardé).

Le commentaire d'en-tête « Adverse mutation search » est passé de « three axes,
two mechanisms » à « two-step detection pipeline » pour refléter que les deux
mécanismes sont séquentiels (localiser, puis classifier), pas redondants.

## Mutations défensives — trois axes, toutes détectées

| # | Mutation | Effet attendu | Résultat |
|---|---------|---------------|----------|
| C | `findHandlerLine` régressé en regex dot-only (`/process\.on/…`) | Ne trouve pas `process['on']('SIGINT')` → `findIndex` retourne `-1` → lève `MESURE IMPOSSIBLE` → **CORRUPT PROOF** (CI rouge) | ✓ CI rouge |
| D | `isHandlerDeferred` inversé (`return line.trim().startsWith('process.on(')`) | `isHandlerDeferred(deferredLine)` → `false` (ne commence PAS par `process.on(`) → assertion `toBe(false)` **passe** → coureur signale FAILURE (passage inattendu) → CI rouge | ✓ CI rouge |
| E | `isHandlerDeferred` toujours faux (`return false`) | `isHandlerDeferred(deferredLine)` → `false` → assertion **passe** → coureur signale FAILURE → CI rouge | ✓ CI rouge |

Chaque mutation est sur un axe **différent** de la mutation primaire (le bug) et
détectée par un mécanisme distinct. Le pipeline en deux étapes est séquentiel,
pas redondant : l'étape 1 trouve la ligne, l'étape 2 la classifie.

## Preuve que la preuve n'est pas décorative

La preuve réfute explicitement le risque qu'une mutation sur `findHandlerLine`
laisse la preuve silencieusement verte. La mutation C est précisément ce cas :
avec la regex dot-only, la bracket-notation n'est plus localisée, et la preuve
lève `MESURE IMPOSSIBLE` — le coureur classe en CORRUPT PROOF (CI rouge), pas
en succès silencieux.

Le second test (« the r2 fixture writes the handshake BEFORE installing the
SIGINT handler ») ne dépend pas de `findHandlerLine` — il cherche directement
`process.on(` dans les lignes extraites. La mutation C ne le touche pas. C'est
intentionnel : le premier test couvre l'axe de l'ordre (A), le second couvre
les axes de la directivité temporelle (B) **et** de la syntaxe d'accès (C).

## Vérifications

- [x] Les deux tests échouent sur code correct (rouge gardé, état attendu)
- [x] Typecheck passe (exit code 0)
- [x] Mutation C → CORRUPT PROOF (MESURE IMPOSSIBLE)
- [x] Mutation D → assertion passe inopinément → FAILURE (CI rouge)
- [x] Mutation E → assertion passe inopinément → FAILURE (CI rouge)

## Fichiers modifiés

- `apps/front/tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts`
  - En-tête « Adverse mutation search » réécrit (two-step detection pipeline)
  - Second test réécrit pour exercer le pipeline réel (extract → find → throw → assert)
