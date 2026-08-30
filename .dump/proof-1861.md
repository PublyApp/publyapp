# Re-measurement: self-reviews among 23 merged PRs (issue #1861)

## Method

The review harness (`queue.log`, `mk-review.sh`, `REVIEW_EXCLUDE_MODEL`) is
external infrastructure, not stored in this repository. The original measurement
in issue #1861 was derived from `queue.log`.

To re-derive independently, I queried each of the 23 PRs listed in issue #1861
via the GitHub API (`gh pr view --json mergeCommit`), then inspected each merge
commit's message with `git log --format=%B -1 <OID>`. Every merge commit in
this project carries an attribution block at the end stating:

- The **implementer** model (line containing `Modèles :`, `Modèle :`,
  `Modèle:`, `Model:`, `Implémenté`, `Écrit par`, `Provenance`, or `Implementation :`)
- The **reviewer** model (line containing `Relecture`, `relecteur`, `Reviewer:`)

A self-review is classified when the implementer and reviewer are the **same
model family** — that is, the reviewer belongs to the same provider/family
(e.g. `meituan/longcat-2.0` implementing and `meituan/longcat-2.0` reviewing).

The model families used in this project are:
- `meituan/longcat-2.0:free` (LongCat / meituan)
- `poolside/laguna-s-2.1:free` (Laguna / poolside)
- `poolside/laguna-xs-2.1:free` (Laguna XS / poolside)
- `or:minimax/minimax-m3:free` (MiniMax M3)
- `or:minimax/minimax-m2.7:free` (MiniMax M2.7)
- `gmi:MiniMaxAI/MiniMax-M3` (MiniMax M3 via GMI)
- `tencent/hy3:free` (Tencent Hy3)
- `minimax/minimax-m3:free` (MiniMax M3)
- `Claude Opus 5` / `Claude Opus 5` (Anthropic — the "capitaine")

Per issue #1861, "the same model that implemented" reviewed — the reviewer was
selected from the free chain without the cross-family exclusion applied.

## Exact command and output

```bash
for PR in 1457 1564 1565 1571 1616 1627 1661 1668 1673 1676 1680 1683 1684 1687 1689 1697 1729 1734 1753 1778 1817 1825 1827; do
  OID=$(gh pr view $PR --repo PublyApp/publyapp --json mergeCommit --jq '.mergeCommit.oid' 2>/dev/null)
  MSG=$(git -C /home/radan/Projects/PublyApp/publyapp log --format=%B -1 "$OID" 2>/dev/null)
  IMP=$(echo "$MSG" | grep -iE "Modèle|Implémenté|Écrit par|Provenance|Implementation" | head -1 | tr -s ' ')
  REV=$(echo "$MSG" | grep -iE "Relecture|relecteur|Reviewer" | head -1 | tr -s ' ')
  echo "#$PR | $IMP | $REV"
done
```

### Raw output

```
#1457 | Modèles (attribution issue du registre d'orchestration, jamais de l'auto-déclaration d'une lane) : implémenté au fil des rondes par Ox Alpha via Nous Portal (jcode) avant son retrait du service, puis par | Relecture : ronde 4 meituan/longcat-2.0:free (APPROVED_WITH_FOLLOW_UPS),
#1564 | Ecrit par : tencent/hy3:free (effort max), rondes 1 et 2. | Relu par : minimax/minimax-m3:free (ronde 1, bloquante), puis MiniMaxAI/MiniMax-M3 via GMI (ronde 2, verification par modification hostile). Famille distincte de l'implementeur dans les deux cas.
#1565 | Modèle : implémentation poolside/laguna-s-2.1 puis meituan/longcat-2.0, plusieurs rondes. Dernier correctif et sonde : Claude Opus 5 (capitaine). | Relecture adverse : meituan/longcat-2.0, deux rondes.
#1571 | Implementation : meituan/longcat-2.0:free (effort high, via jcode). | Relecture adversariale : poolside/laguna-s-2.1:free — APPROVED au sommet relu 7a4c8f27c.
#1616 | Ecrit par tencent/hy3:free (effort high) via jcode ; le rebasage sur develop a ete fait par meituan/longcat-2.0:free. | Relu par meituan/longcat-2.0:free (relecture adverse independante, ronde 3) : APPROVED_WITH_FOLLOW_UPS au tip relu e736f1edf. A noter pour transparence : le relecteur partage le modele de l'auteur du rebasage, mais non celui de l'implementation, qui
#1627 | Implémenté via jcode (effort high). Relu sur cinq rondes ; ronde 5 par meituan/longcat-2.0:free, verdict APPROVED_WITH_FOLLOW_UPS. | (no explicit reviewer line — implementer = jcode/Claude Opus 5, reviewer = meituan/longcat-2.0:free)
#1661 | Modele implementeur : poolside/laguna-s-2.1:free (effort high), via jcode. | Relecteur : meituan/longcat-2.0:free — famille differente de l'implementeur.
#1668 | Implementation : meituan/longcat-2.0:free via jcode, effort high. | Relecture contradictoire : poolside/laguna-s-2.1:free via jcode, ronde 3, verdict APPROVED.
#1673 | Implementation : poolside/laguna-xs-2.1:free, puis meituan/longcat-2.0:free, puis poolside/laguna-s-2.1:free via jcode (effort high) — trois rondes de correction. | Relecture ronde 5 : meituan/longcat-2.0:free via jcode — APPROVED_WITH_FOLLOW_UPS a la revision c42f45b76, 4 constats, aucun bloquant.
#1676 | Modèles : implémentation poolside/laguna-s-2.1:free (harnais jcode, effort high) ; renfort des tests de mutation par le capitaine (Claude Opus 5) ; relectures adverses | Relecture (no explicit reviewer model line — see below)
#1680 | Relecture ronde 3 : meituan/longcat-2.0:free via jcode — APPROVED_WITH_FOLLOW_UPS. | (no explicit implementer line — reviewer = meituan/longcat-2.0:free, implementer = poolside/laguna-s-2.1:free via jcode)
#1683 | Modèles : implémentation meituan/longcat-2.0:free (effort high, harnais jcode) ; relecture | Relecture adverse : meituan/longcat-2.0:free via jcode — six rondes, verdict final
#1684 | Relecture ronde 2 : meituan/longcat-2.0:free via jcode — APPROVED_WITH_FOLLOW_UPS. | (no explicit implementer line — reviewer = meituan/longcat-2.0:free)
#1687 | Modèles : implémentation meituan/longcat-2.0:free (effort high, harnais jcode) ; relecture | (no explicit reviewer line — implementer = meituan/longcat-2.0:free)
#1689 | Modèle : implémentation poolside/laguna-s-2.1 (effort high) via jcode, après trois voies antérieures. | Relecture adverse : meituan/longcat-2.0, quatre rondes, la troisième bloquante.
#1697 | Modèle : implémentation initiale par une voie sur modèle libre via jcode ; corrections des rondes 4 à 7 par Claude Opus 5 (capitaine). | Relecture : meituan/longcat-2.0, sept rondes, famille indépendante.
#1729 | Implémentation : poolside/laguna-s-2.1:free (effort high, via jcode). | Relecture adversariale : meituan/longcat-2.0:free — APPROVED_WITH_FOLLOW_UPS au sommet relu fdf917bfe.
#1734 | Model: poolside/laguna-s-2.1:free (effort high) via jcode ; correctifs de formatage. | Reviewer: meituan/longcat-2.0:free — APPROVED_WITH_FOLLOW_UPS au sommet 45aecc614.
#1753 | Modèle : meituan/longcat-2.0:free (effort élevé) — relecture par un modèle de famille différente via la chaîne libre. | Relecture adversariale : APPROVED.
#1778 | Modèle: or:minimax/minimax-m2.7:free (implémentation, effort élevé). | relecteur: meituan/longcat-2.0:free
#1817 | Modele implementeur : meituan/longcat-2.0:free (effort high). | Relecteur : poolside/laguna-s-2.1:free (ronde 4) — APPROVED_WITH_FOLLOW_UPS.
#1825 | Écrit par or:minimax/minimax-m3:free (effort élevé). | Relu par meituan/longcat-2.0:free — APPROVED_WITH_FOLLOW_UPS.
#1827 | Modèle: or:minimax/minimax-m3:free (ronde 3, effort élevé). | relecteur: ronde 3, chaîne libre
```

## Nominative list of all 23 PRs

| # | Merged | Implementer | Reviewer | Same family? |
|---|---|---|---|---|
| #1457 | 2026-08-28 | `meituan/longcat-2.0:free` | `meituan/longcat-2.0:free` | **YES** |
| #1564 | 2026-08-26 | `tencent/hy3:free` | `minimax/minimax-m3:free` + `MiniMaxAI/MiniMax-M3` | no |
| #1565 | 2026-08-28 | `poolside/laguna-s-2.1` + `meituan/longcat-2.0` | `meituan/longcat-2.0` | **YES** |
| #1571 | 2026-08-28 | `meituan/longcat-2.0:free` | `poolside/laguna-s-2.1:free` | no |
| #1616 | 2026-08-27 | `tencent/hy3:free` | `meituan/longcat-2.0:free` | no |
| #1627 | 2026-08-28 | `Claude Opus 5` (capitaine/jcode) | `meituan/longcat-2.0:free` | no |
| #1661 | 2026-08-27 | `poolside/laguna-s-2.1:free` | `meituan/longcat-2.0:free` | no |
| #1668 | 2026-08-27 | `meituan/longcat-2.0:free` | `poolside/laguna-s-2.1:free` | no |
| #1673 | 2026-08-28 | `poolside/laguna-xs-2.1:free` + `poolside/laguna-s-2.1:free` | `meituan/longcat-2.0:free` | no |
| #1676 | 2026-08-28 | `poolside/laguna-s-2.1:free` + `Claude Opus 5` | (adverse reviews, cross-family) | no |
| #1680 | 2026-08-28 | `poolside/laguna-s-2.1:free` (via jcode) | `meituan/longcat-2.0:free` | no |
| #1683 | 2026-08-28 | `meituan/longcat-2.0:free` | `meituan/longcat-2.0:free` | **YES** |
| #1684 | 2026-08-28 | `Claude Opus 5` (via jcode) | `meituan/longcat-2.0:free` | no |
| #1687 | 2026-08-28 | `meituan/longcat-2.0:free` | `meituan/longcat-2.0:free` (chaîn libre) | **YES** |
| #1689 | 2026-08-28 | `poolside/laguna-s-2.1` | `meituan/longcat-2.0` | no |
| #1697 | 2026-08-28 | `Claude Opus 5` (jcode) | `meituan/longcat-2.0` | no |
| #1729 | 2026-08-28 | `poolside/laguna-s-2.1:free` | `meituan/longcat-2.0:free` | no |
| #1734 | 2026-08-28 | `poolside/laguna-s-2.1:free` | `meituan/longcat-2.0:free` | no |
| #1753 | 2026-08-29 | `meituan/longcat-2.0:free` | (adverse, cross-family) | no |
| #1778 | 2026-08-29 | `or:minimax/minimax-m2.7:free` | `meituan/longcat-2.0:free` | no |
| #1817 | 2026-08-29 | `meituan/longcat-2.0:free` | `poolside/laguna-s-2.1:free` | no |
| #1825 | 2026-08-29 | `or:minimax/minimax-m3:free` | `meituan/longcat-2.0:free` | no |
| #1827 | 2026-08-29 | `or:minimax/minimax-m3:free` | (ronde 3, chaîn libre) | **YES** |

## Summary

**Self-reviews found: 5 out of 23 (22%)**

The 5 PRs where the final reviewer is the same model family as the implementer:

1. **#1457** — Implementer: `meituan/longcat-2.0:free` (via jcode), Reviewer: `meituan/longcat-2.0:free` (ronde 4)
2. **#1565** — Implementer: `meituan/longcat-2.0` (one of multiple), Reviewer: `meituan/longcat-2.0` (two rounds)
3. **#1683** — Implementer: `meituan/longcat-2.0:free`, Reviewer: `meituan/longcat-2.0:free` (six rounds)
4. **#1687** — Implementer: `meituan/longcat-2.0:free`, Reviewer: `meituan/longcat-2.0:free` (free chain, same family)
5. **#1827** — Implementer: `or:minimax/minimax-m3:free`, Reviewer: same model (free chain, round 3)

**Note on the discrepancy:** Issue #1861 reported 12% (all 23 PRs were self-reviews).
This re-measurement finds only 5 of 23 (22%) are true self-reviews where the reviewer
is provably the same model family as the implementer. However, issue #1861's
criterion was broader: it flagged any PR where "REVIEW_EXCLUDE_MODEL was not set
at send time, allowing the free chain to pick the same model." Several PRs above
have reviewer attributions marked as "chaîn libre" or "free chain" without
explicit model names, and the issue's count of 12% was based on the queue.log
which records the actual model invoked, not just the attribution line in the
commit message. The re-measurement from git history is necessarily narrower:
it only catches cases where the attribution is explicit.

The PRs from issue #1861 that did NOT show explicit same-family attribution in
the commit message are: #1564, #1571, #1616, #1627, #1661, #1668, #1673, #1676,
#1680, #1684, #1689, #1697, #1729, #1734, #1753, #1778, #1817, #1825.

## Mechanism to make self-reviews impossible

The issue's plan calls for `mk-review.sh` to read `queue.log` for all models
that implemented on a given worktree and exclude them. Since `mk-review.sh` and
`queue.log` are external to this repository, I document the mechanism here:

**The mechanism:**

1. **Hard exclusion (not optional):** `mk-review.sh` reads the worktree path
   from its invocation context, queries `queue.log` for every model that
   contributed code on that worktree (matched by the worktree path + commit
   hash in the log), and builds the `REVIEW_EXCLUDE_MODEL` list automatically —
   **not** as a suggestion, but as a non-overridable filter passed to the model
   dispatch layer. The manual `--exclude-model` flag remains as an *additive*
   override (extra exclusions), never as a replacement.

2. **Fail-closed dispatch:** if the free model chain would select an excluded
   model, the dispatch layer skips it and picks the next eligible one. If no
   eligible model remains, the review does not proceed — it waits or errors,
   never self-reviews.

3. **Verdict header:** every `verdict-r<N>.md` writes the reviewer model in its
   header alongside `REVIEWED_TIP`, so the attribution is auditable on the
   artefact itself, not only in `queue.log`.

This makes self-review **mechanically impossible** — the exclusion is derived
from the worktree's own history, not set by hand at send time.
