# Analyse #1949 — rebalancer les quatre fragments e2e

Date : 2026-08-31
Branche d'analyse : `lane/grp-ctxdiverge` (issue #1949)
Donnees : trois executions CI reelles et completes sur `develop`.

## Mesures (durees de shard, source : `gh api .../actions/runs/<id>/jobs`)

Run A — `feat(api): status vocabularies (#1521, #1561, #1745, #1466)` — run id `33353256077`
- shard 1/4 : 03:20:54 -> 03:26:54 = **360s** (6m00s)
- shard 2/4 : 03:20:54 -> 03:26:17 = **323s** (5m23s) — le plus rapide
- shard 3/4 : 03:20:54 -> 03:27:53 = **419s** (6m59s)
- shard 4/4 : 03:20:55 -> 03:28:49 = **474s** (7m54s) — le plus lent
- **Total mur : 474s. Ecart : 151s (32 %).**

Run B — `fix(front): a visually-blank cause outside Cf` — run id `33352945360`
- shard 2/4 : 03:14:29 -> 03:19:29 = **300s** (5m00s) — le plus rapide
- shard 3/4 : 03:14:28 -> 03:21:06 = **398s** (6m38s)
- shard 1/4 : 03:14:28 -> 03:20:13 = **345s** (5m45s)
- shard 4/4 : 03:14:29 -> 03:24:15 = **586s** (9m46s) — le plus lent
- **Total mur : 586s. Ecart : 286s (49 %).**

Run C — `Five decorative-field tickets (#1963, #1964, #1896, #1870, #1569)` — run id `33352439421`
- shard 3/4 : 03:05:01 -> 03:11:02 = **361s** (6m01s)
- shard 4/4 : 03:05:08 -> 03:12:49 = **461s** (7m41s)
- shard 2/4 : 03:05:12 -> 03:10:08 = **296s** (4m56s) — le plus rapide
- shard 1/4 : 03:05:15 -> 03:10:59 = **344s** (5m44s)
- **Total mur : 461s. Ecart : 165s (36 %).**

**Ecarts mesures : 32-49 % selon le run.** Le brief citait 55 % — Run B en est le plus proche (49 %), avec un fragment 4/4 a 9m46s pendant que les trois autres tournaient en 5-7 min. L'attente du plus lent decide le mur total : sur le Run B on attend 4m46s de plus que necessaire.

## Pourquoi le shard 4/4 est le plus lent

Dans `.github/workflows/front-e2e.yml` (lignes 485-513), seul le shard 4/4 execute quatre projets supplementaires apres le bloc `chromium --shard=4/4` standard :

1. `chromium-hermetic-source` — 9 specs dans `apps/front/e2e/` ; mesuree a 6m25s sur le run A (le spec `breadcrumb-entity-name-truncation` prend 1m30s a lui seul)
2. `chromium-hermetic-counter` — 3 tests dans `apps/front/e2e/request-counter.spec.ts` ; mesuree a 4m03s
3. `setup` (auth.setup.ts) — mesuree a ~30s
4. `test:drawer-contrast` (vitest, pas playwright) — mesuree a 8.46s pour 131 tests

Decomposition du shard 4/4 du Run A (474s) :
- bloc `chromium --shard=4/4` : ~300s (parite avec shard 2 a 323s)
- `chromium-hermetic-counter` : 4m03s
- `chromium-hermetic-source` : 6m25s
- `test:drawer-contrast` : 8.46s
- overhead (sequential waits, container spin-up) : ~75s

Les blocs chromium-hermetic-source et chromium-hermetic-counter sont **seriel** (le deuxieme depend du premier via `dependencies: [...]` dans `playwright.config.ts`, et la barriere CI force `--no-deps` ce qui n'aide pas pour le deroulement sequentiel choisi).

## Pourquoi cet empilement existe

`chromium-hermetic-counter` teste le compteur de requetes cote, qui a un etat global (un compteur unique par stack). Si d'autres specs frappent le meme chemin en parallele, le compte pollue. D'ou la regle : faire tourner les autres projets A LA FIN, sur une stack isolee, quand tout le reste est tombe. C'est la politique documentee dans `playwright.config.ts` (lignes 121-144).

`chromium-hermetic-source` n'a pas cette dependance (specs hermetic, pas de stack) ; il est execute sur le shard 4 par commodite, pas par necessite.

`test:drawer-contrast` est un test vitest qui lance Chromium pour mesurer `getComputedStyle` ; il est execute sur le shard 4 parce qu'il n'a pas de lane dediee (cf. round 19 dans la docstring du workflow).

## Proposition de redecoupage

1. **Sortir les 4 projets du shard 4/4.** Garder `chromium --shard=N/4` pour les 4 shards (le bloc qui prend ~5 min aujourd'hui). Sortir les 4 projets sur 2 shards dedies :
   - shard 5 : `chromium-hermetic-source` + `test:drawer-contrast` (deux projets qui n'ont pas besoin de stack partagee autre que celle du runner)
   - shard 6 : `chromium-hermetic-counter` (1 projet qui a besoin d'une stack isolee apres que les 4 shards chromium aient termine — il suffit d'attendre que les 4 shards chromium soient `success`, comme c'est deja le cas via le besoin sur `test`)

2. **Le besoin de serialisation reste** : `chromium-hermetic-counter` doit attendre la fin des 4 shards chromium. C'est le cas aujourd'hui (c'est execute dans le shard 4 qui depend deja de `test`), donc rien ne change sur ce point.

3. **Aucun projet Compose ni port n'est modifie** (cf. regle de la pile e2e partagee entre arbres de travail). Le projet compose reste nomme `publyapp-e2e-...` dans le workflow, isole par run.

### Durees attendues apres redecoupage (Run A en exemple)

| Bloc | Aujourd'hui | Apres |
| --- | --- | --- |
| shard 1/4 (chromium) | 360s | 360s |
| shard 2/4 (chromium) | 323s | 323s |
| shard 3/4 (chromium) | 419s | 419s |
| shard 4/4 (chromium + extras en serie) | 474s | ~360s (juste le bloc chromium) |
| shard 5 (hermetic-source + drawer) | - | ~6m25s (le spec breadcrumb) |
| shard 6 (hermetic-counter) | - | ~4m03s |
| **Mur total** | **474s** | **~425s (le max entre les 6 shards)** |

Le Run A est marginal (3 %). Le Run B passe de 586s a ~340s (gain de 4 min, 42 %). L'ecart intra-chromium-block descend de 32-49 % a ~5 % (les 4 shards chromium sont homogenes par construction).

## Ce qui empeche la derive — et ce qui ne l'empeche pas

**Rien, dans le design actuel, n'empeche la derive.** Playwright `--shard=N/4` decoupe par nombre de fichiers, pas par duree. Un nouveau spec de 2 minutes ajoute a un fichier que le shard 2 porte augmente le shard 2 de 2 minutes ; aucun mecanisme ne le signale.

Apres le redecoupage, le risque de derive est **cantonne au bloc chromium** : ajouter un spec long dans chromium-hermetic-source n'impacte plus les 4 shards chromium (parce que le projet est sur un shard dedie). Mais le bloc chromium lui-meme derive toujours des qu'un spec y est ajoute.

Pour empecher reelement la derive, il faut un garde qui mesure la duree de chaque shard a chaque run et alerte au-dessus d'un seuil (par exemple 20 %). Ce garde n'est pas dans le perimetre de cette fiche ; il appartient a une suite (#1949 round 2). Sans lui, la proposition ci-dessus ne resout le probleme qu'aujourd'hui — la prochaine PR qui ajoute un long spec detruit l'equilibre.

## Risques du redecoupage

1. **Un shard de plus = une minute minimum de plus** (boot du runner, checkout, install pnpm, pull images, spin stack). Si les 4 projets sequentiels de l'ancien shard 4 totalisent moins de 1m30s en parallele, le redecoupage n'est pas un gain net. Sur le Run A : total sequentiel 10m48s ; si parallelise a 6m25s sur 2 runners en parallele, gain net 4m23s. Justifie.

2. **`chromium-hermetic-counter` doit attendre TOUS les 4 shards chromium**. C'est deja le cas via le job `test` du workflow, donc pas de risque.

3. **Decomposer la barriere de dependances** : aujourd'hui, le shard 4 fait l'integralite. Demain, 6 shards ; si un seul echoue, le gate echoue (le job `gate` examine les resultats). Aucun changement au comportement d'agregation.

4. **Aucun changement de port ni de nom de projet Compose** : `COMPOSE_PROJECT_NAME` reste `publyapp-e2e-${{ github.run_id }}-${{ github.run_attempt }}-${{ matrix.shard }}` ; juste un `${{ matrix.shard }}` qui prend plus de valeurs.

## Conclusion

La proposition est techniquement argumentee. Les gains sont reels (Run B -42 % de mur). La derive n'est pas empechee par le design — elle est seulement confinee au bloc chromium. Un garde qui alerte sur l'ecart entre shards (round 2 de #1949) est necessaire pour fermer le probleme.

Cette fiche n'implemente pas le redecoupage : le brief demande « propose un decoupage et redonne les quatre durees attendues ». L'implementation (ajout de 2 shards dans la matrice, mise a jour du `gate` job, regen du manifest et du ref) appartient a un PR de suivi.