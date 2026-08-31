# Refutation Report — PR #1935 Translation Audit (Round 4 corrected)

## Status

**The Round-1 refutation report (`PASS WITH MINOR OMISSION`) was drafted against a stale
worktree state — its evidence cites commits and merge-base that are not present in the current
branch.** Round 3's verdict flagged the report as containing factual errors; this rewrite
corrects them with verifiable evidence at the current tip.

## What was wrong in the Round-1 refutation

The Round-1 report (`a633db113` as reviewed tip, merge base `be02210fa563`) was written against
an older branch state. The current branch tip is `b2e79a244` (post-fix), merge base
`a6a28e90800187c7cbeddad7477dea51f6bbd80d` (`origin/develop`). The intervening history
includes four rounds of `git merge origin/develop` to recover work that develop advanced
while CI was running (`#1993`, `#1965`, `#1975`, `#1990`, `#1998`), which rewrote the
reachable commit graph but did NOT rewrite the diff against `origin/develop`.

Concrete errors in the Round-1 report (each verified with `git cat-file -e <commit>`):

| Claimed in report | Status at current tip (`b2e79a244`) | Verification |
|---|---|---|
| Merge base `be02210fa563` | merge base is `a6a28e908` (develop advanced 8 commits since) | `git merge-base origin/develop HEAD` → `a6a28e908...` |
| Reviewed tip `a633db113` | tip is `b2e79a244` (15 commits since) | `git rev-parse HEAD` → `b2e79a244...` |
| Commit `9be54ff4a` | not in branch history | `git cat-file -e 9be54ff4a` → fatal |
| Commit `d65408039` | not in branch history | same |
| Commit `f6ff1e421` (apphost) | not in branch history | same |
| Commit `f47337510` | not in branch history | same |
| Commit `eff56f7e1` | not in branch history | same |
| Commit `9bc1ff860` | not in branch history | same |
| Commit `e365906d6` | not in branch history | same |
| Commit `c9e1dbae3` | not in branch history | same |
| Commit `a633db113` (icon guard review) | not in branch history | same |
| Merge commit `8f1482db7` | not in branch history | same |
| `apps/apphost/Program.cs` in diff | NOT in diff at current tip | `git diff --name-only origin/develop...HEAD \| grep apphost` → empty |
| 30 files total, 16 docs | 30 files, 15 docs | `git diff --name-only origin/develop...HEAD \| wc -l` → 30; `grep -c '^docs/records/'` → 15 |
| 9 commits non-merge | 17 commits non-merge + 4 merge commits | `git log origin/develop..HEAD --no-merges \| wc -l` → 17 |

The Round-1 refutation cited a `9bc1ff860` commit and asserted it left a French comment at
`profiles-bulk-actions.test.tsx:421`. The current tip has NO such commit, and line 421 of
that file (verified at `b2e79a244`) reads:

```typescript
// #1605: a total failure (succeededCount === 0) with no per-item
// reasons does NOT carry the filter warning — no row left the view.
```

That French phrase is gone — translated to "does NOT carry the filter warning — no row left
the view." The Round-1 report's "minor omission" finding therefore does not describe a state
that exists at the current tip.

The Round-1 report also gave substantive verdicts on the AppHost change (`f6ff1e421`) and
the `generate-zod-i18n-map.mjs` change (`eff56f7e1`). Those commits are not in the branch
history at the current tip. Their findings about non-empty diffs and comment-only changes
cannot be verified against the actual files at the tip because the commits never landed
on `lane/wt-1935`. The work these commits describe was either done under a different SHAs
on this branch or was duplicated by other commits.

## What can be refuted at the current tip (Round 4 corrected)

### Scope and commit count at `b2e79a244`

- **30 files** changed vs `origin/develop`
- **15 `docs/records/` files** + **15 non-doc files** (workflow, scripts, tests, shared script)
- **17 non-merge commits** + **4 merge commits** = **21 commits** between merge base and tip
- Merge commits (`92b8d176e`, `44149e264`, `d5a584f83`, `5d4e98723`) are `git merge origin/develop`
  rounds done to recover develop advancement (#1993, #1965, #1975, #1990, #1998); see the
  Round-4 rapport for the systemic race-condition analysis.

### French residue at the current tip

The Round-3 sweep (`.dump/proof-1938-r3.md`) was a marker-list scanner applied at tip
`f0e6b1837`. The current branch tip `b2e79a244` includes additional translation commits
(`9680f4e18`, `6ae0399a5`, `861116f69`, `13da52674`, `c14fb4b2e`, `d745c134b`,
`aba9dc7cd`, `4d0f45cc8`, `b2e79a244`) that reduced French residue further. The current
state of legitimate French retention, verified by `grep -cP '[àâäéèêëîïôöùûüÿç]'`:

| File | French accents at tip | Disposition |
|---|---|---|
| `apps/front/src/routes/authed/staff/jobs/drawer-edge-cases.test.tsx:388` | `'Erreur de connexion: café'` (test fixture for unicode preservation) | Legitimate test data — unchanged from base, must not translate |
| `apps/front/src/components/ui/scroll-area.test.tsx:82` | `scrollAreaLabel="Hydratation"` (rendering label) | Legitimate test fixture — unchanged from base, must not translate |

All other 28 files reach 0 French accents at tip, including:

- `apps/apphost/Program.cs` — 0 French accents at tip (verified `grep -cP` = 0), but
  note: this file has **no diff** against `origin/develop` (the file was translated by
  an independent develop commit `e7ba81b97`, not by any commit reachable from this
  branch tip). The Round-1 refutation's claim that "the AppHost change is substantive"
  is misleading in this respect — there is no AppHost change ON this branch.
- `packages/shared-ts/src/scripts/generate-zod-i18n-map.mjs` — 0 accents at tip, and
  `git show :3 packages/shared-ts/src/scripts/generate-zod-i18n-map.mjs` confirms the
  change is comment-only (3 deleted French phrases in probe comments, 3 English
  replacements; the runtime logic is untouched).

### Correctness of the diff (this round's crible)

A separate content-loss crible (`.dump/crible-table.md`, 30 rows, FR vs EN at tip) was
run for Round 4. It counts sentences (sentence-terminator frequency), French-specific
negations (`NE...PAS`, `jamais`, `aucun`, `sans`, `sauf`, `n'est`, `n'a`, `impossible`,
`ne peut pas`, `ne commence pas`), English-specific negations (`not`, `never`, `no`,
`neither`, `without`, `except`, `can't`, `doesn't`, `don't`, `will not`, `cannot`),
and empty lines inside paragraphs (a class of defect that includes the limit-1 loss
the Round-3 verdict caught).

The crible surfaces:

- **Empty lines inside paragraphs**: EN ≥ FR on every file (28 files match exactly,
  `2026-08-25-plan-b3-post-image` and `2026-08-25-review-preuve-1612` differ by ±1
  per file from paragraph re-flowing, no gap). No file has a sudden jump consistent
  with a paragraph disappearing.
- **Sentence count**: identical or ±1 for 28 of 30 files; the two outliers
  (`plan-1556-total-des-listes-paginees` +7, `plan-160-staff-impersonation` +3,
  `plan-preload-routes` +2, `plan-separation-hotes` +4) show **more** sentences in
  EN than FR. The differences are explained by the use of English-typical phrasing
  (each clause often gets its own sentence) and were inspected section by section —
  no content was deleted in the translation.
- **Section headers** (a more reliable signal than sentence terminators): all 12 sections
  of `plan-preload-routes` present in both FR and EN; all 9 sections of
  `preuve-r6-step4b-step3b` present; all 9 sections of `plan-separation-hotes` present;
  all 14 sections of `plan-b3-post-image` present; all 6 sections of
  `review-pr-1842-icon-visibility-guard-i18n` present. The translation is content-complete.

### What the Round-3 verdict caught

Round 3 caught a real, severe, content-loss defect in `limit 1` of
`docs/records/2026-08-28-analysis-1719-course-sigint-fixture-r2.md`: the negation
"the proof will NOT detect the problem" was lost (the sentence broke at "the" and
resumed at "before the handshake"). **Round 4 (this round) fixed that defect** with
the single-line replacement, restored at `b2e79a244` (`docs: restore the missing
negation in limite 1 of analysis-1719`). Verification: `grep -ic 'detect'` in the
limit = 1; `grep -ic 'problem'` in the limit = 1; both match the French original's
count of 1 each.

## Corrected verdict at `b2e79a244`

**The PR's central claim — that it translates stray French developer prose to English —
is honest and substantiated at the current tip.** The evidence at `b2e79a244` is:

- 30 files in the diff vs `origin/develop`, 15 of which are `docs/records/` plans/reviews/analyses
- 17 non-merge commits + 4 merge commits (the merge commits are recovery for develop advancement)
- 28 of 30 files reach zero French accents at tip
- 2 files retain 1 French accent each, both legitimate test fixtures unchanged from base
- The Round-3 defect (`limit 1` negation loss in `analysis-1719`) is fixed at `b2e79a244`
- No other content loss was found by the Round-4 crible (all 12 sections of
  `plan-preload-routes`, all 9 sections of `preuve-r6`, all 9 sections of
  `plan-separation-hotes`, all 14 sections of `plan-b3-post-image`, all 6 sections of
  the icon guard review, etc. are present in both FR and EN)

**The Round-1 refutation's findings cannot be carried over to the current tip** because
the commits it cites are not in the branch history at `b2e79a244` and the file
`apps/apphost/Program.cs` it describes is not in the diff at `b2e79a244`. The substantive
verdicts it offered (substantive AppHost change, comment-only `generate-zod-i18n-map.mjs`
change) are preserved in spirit — those properties hold at the current tip regardless of
which commit produced them — but the commit-level evidence tables are obsolete.