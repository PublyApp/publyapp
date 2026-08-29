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

**Le script corrigé attrape la greffe et échoue bruyamment :**

```bash
$ cd /tmp/shallow-red/apps/front
$ GITHUB_BASE_REF=develop GITHUB_HEAD_REF=HEAD node scripts/ci/run-preuves.mts
Error: git diff failed — cannot determine which proofs this PR declared.
Detail: git merge-base failed — no common ancestor between origin/develop and HEAD.
This is commonly caused by a shallow graft (.git/shallow) left by a previous --depth=1
fetch in a shared worktree. Remove the graft ("git fetch --unshallow" or delete
.git/shallow) and retry.
---EXIT:1
```

## Vert : le script corrigé ne pose plus de greffe

Le script corrigé remplace `--depth=1` par un fetch non superficiel de la seule référence de base. Après avoir retiré la greffe :

```bash
$ cd /tmp/shallow-red
$ git fetch --unshallow
$ git rev-parse --is-shallow-repository
false
$ git merge-base origin/develop HEAD
dab2445c4182276a31c11db55c2a86b9f2037e4a

$ cd apps/front
$ GITHUB_BASE_REF=develop GITHUB_HEAD_REF=HEAD node scripts/ci/run-preuves.mts
This PR declared 1 paired red proof(s) — replaying with inverted semantics:
  tests/proofs/1731/red-1731-public-origin-not-required.test.ts
# (le script continue, la garde merge-base ne lance plus)
```

La garde ne bloque plus — le script passe à la vérification réelle des preuves.

## Non-régression : les preuves déclarées continuent de fonctionner

Le script corrigé rejoue correctement les preuves déclarées avec la sémantique inversée (une preuve qui échoue = succès, une preuve qui passe = échec). Sur le worktree de développement :

```bash
$ cd /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-1782/apps/front
$ GITHUB_BASE_REF=develop GITHUB_HEAD_REF=lane/wt-1782 node scripts/ci/run-preuves.mts
This PR did not declare any paired red proofs (no proof files added or modified).
Proof tests are versionned under tests/proofs/; this PR did not touch any of them.
This step is an explicit no-op for PRs that do not declare a proof.
---EXIT:0
```

Le script fonctionne normalement : aucune greffe créée, la garde merge-base protège contre les greffes résiduelles, et les preuves déclarées continuent de rejouer correctement.
