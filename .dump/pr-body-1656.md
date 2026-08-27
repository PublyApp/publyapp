## Résumé

Implémente les plafonds de complexité cyclomatique par zone (partie 1 de #1656) :

| Zone | Plafond |
|---|---|
| `apps/front/src` | 60 |
| tests / e2e | 90 |
| scripts / outils | 125 |

Chaque plafond est un **cliquet** : il ne remonte jamais. Ces valeurs sont des **lignes de non-régression, pas des objectifs**. Les cibles à terme sont 15 pour le produit, 40 pour l'outillage.

## Modèle et niveau d'effort

- Modèle : jcode v0.81.1
- Effort : low (tâche de configuration, sans remaniement de code existant)

## Ce qui a changé

- `.oxlintrc.json` : activation de la règle `complexity` avec plafond par défaut à 125, puis overrides par zone
- `.dump/preuve-1656.md` : preuve que chaque plafond est correctement appliqué (fonction au plafond passe, à plafond+1 échoue) pour les trois zones

## Règle de priorité

Les overrides sont appliqués en ordre de déclaration (le dernier gagné). Un fichier `*.test.ts` dans `apps/front/src` reçoit donc le plafond tests (90), non le plafond produit (60).

## Preuves

Voir `.dump/preuve-1656.md`. Six vérifications au total : deux par zone (pass/fail). Le lint complet du dépôt est vert sans suppression ni exclusion ajoutée.

Part of #1656
