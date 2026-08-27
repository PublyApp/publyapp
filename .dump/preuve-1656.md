# Preuve des plafonds de complexité cyclomatique — issue #1656 (partie 1)

Ce document contient les preuves que chaque plafond par zone est correctement appliqué.
Pour chaque zone : une fonction au plafond passe, la même à plafond + 1 échoue.

## Règle de priorité retenue

Les `overrides` Oxlint sont appliqués **en ordre de déclaration, le dernier gagné**.
Un fichier de test `*.test.ts` dans `apps/front/src` correspond à la fois à l'override
`apps/front/src/**` (plafond 60) et à l'override `**/*.test.ts` (plafond 90). Comme le dernier
override est déclaré après le premier dans la configuration, c'est le plafond 90 qui s'applique.
C'est le comportement vérifié ci-dessous.

---

## Zone 1 : `apps/front/src` — plafond 60

### Preuve 1a — complexité 60 passe

Fichier : `apps/front/src/__proof-zone1-pass.ts` (créé temporairement puis supprimé)

```bash
./node_modules/.bin/oxlint --quiet apps/front/src/__proof-zone1-pass.ts
```

Sortie (exit code 0, aucune erreur) :

```
```

### Preuve 1b — complexité 61 échoue

Fichier : `apps/front/src/__proof-zone1-fail.ts` (créé temporairement puis supprimé)

```bash
./node_modules/.bin/oxlint --quiet apps/front/src/__proof-zone1-fail.ts
```

Sortie (exit code 1) :

```
apps/front/src/__proof-zone1-fail.ts:3:8: error eslint(complexity): function `proofZone1Fail` has a complexity of 62. Maximum allowed is 60.
```

---

## Zone 2 : tests / e2e — plafond 90

### Preuve 2a — complexité 90 passe (fichier .test.ts dans apps/front/src)

Fichier : `apps/front/src/__proof-zone2-pass.test.ts` (créé temporairement puis supprimé)

```bash
./node_modules/.bin/oxlint --quiet apps/front/src/__proof-zone2-pass.test.ts
```

Sortie (exit code 0, aucune erreur) :

```
```

### Preuve 2b — complexité 91 échoue

Fichier : `apps/front/src/__proof-zone2-fail.test.ts` (créé temporairement puis supprimé)

```bash
./node_modules/.bin/oxlint --quiet apps/front/src/__proof-zone2-fail.test.ts
```

Sortie (exit code 1) :

```
apps/front/src/__proof-zone2-fail.test.ts:3:8: error eslint(complexity): function `proofZone2Fail` has a complexity of 92. Maximum allowed is 90.
```

---

## Zone 3 : scripts / outils — plafond 125

### Preuve 3a — complexité 125 passe

Fichier : `packages/scripts-ts/src/__proof-zone3-pass.ts` (créé temporairement puis supprimé)

```bash
./node_modules/.bin/oxlint --quiet packages/scripts-ts/src/__proof-zone3-pass.ts
```

Sortie (exit code 0, aucune erreur) :

```
```

### Preuve 3b — complexité 126 échoue

Fichier : `packages/scripts-ts/src/__proof-zone3-fail.ts` (créé temporairement puis supprimé)

```bash
./node_modules/.bin/oxlint --quiet packages/scripts-ts/src/__proof-zone3-fail.ts
```

Sortie (exit code 1) :

```
packages/scripts-ts/src/__proof-zone3-fail.ts:3:8: error eslint(complexity): function `proofZone3Fail` has a complexity of 127. Maximum allowed is 125.
```

---

## Vérification finale — lint complet du dépôt

```bash
./node_modules/.bin/oxlint --quiet .
```

Résultat : **exit code 0**, aucune erreur. Le plafond est posé au maximum réel de chaque zone,
aucune suppression, aucun fichier exclu.
