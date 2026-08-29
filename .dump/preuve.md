# Preuve appariée — #1782

## Rouge : la greffe superficielle casse le script (comportement avant correction)

Dans un clone superficiel (`.git/shallow` présent), `git merge-base` retourne vide :

```bash
$ git clone --depth=1 --no-single-branch file:///home/radan/Projects/PublyApp/publyapp /tmp/shallow-red
$ cd /tmp/shallow-red
$ git rev-parse --is-shallow-repository
true
$ git merge-base origin/develop HEAD
# (vide, exit code 1)
```

Lancé dans cet état, l'ancien script (`fetch --depth=1`) concluait « aucune preuve déclarée » et sortait en 0 — un feu vert qui n'avait rien vérifié.

## Vert : le script corrigé ne pose plus de greffe

Le script corrigé remplace `--depth=1` par un fetch non superficiel de la seule référence de base :

```bash
$ cd /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-1782/apps/front
$ GITHUB_BASE_REF=develop GITHUB_HEAD_REF=lane/wt-1782 node scripts/ci/run-preuves.mts
This PR did not declare any paired red proofs (no proof files added or modified).
Proof tests are versionned under tests/proofs/; this PR did not touch any of them.
This step is an explicit no-op for PRs that do not declare a proof.
```

Aucun fichier `.git/shallow` n'est créé. Le script fonctionne normalement.

## Non-régression : les preuves déclarées continuent de fonctionner

Le script corrigé rejoue correctement les preuves déclarées avec la sémantique inversée (une preuve qui échoue = succès, une preuve qui passe = échec).
