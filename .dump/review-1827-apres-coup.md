# Retrospective review: PR #1827 (dfbd06eaf) — after the fact

## Context

PR #1827 was merged against `dfbd06eaf35308ecdc1563ebd706d886b3e78ee8` on 2026-08-29. It
closes #1815. The issue that triggered the retrospective (#1860) reports that the final
reviewer was `meituan/longcat-2.0:free` — the same model family as the implementer, because
`REVIEW_EXCLUDE_MODEL` was not set at send time.

The code is already on `develop`; this verdict does not revert. It re-reviews the diff of
#1827 with the same surface d'attaque as the original.

## What was reviewed

The diff touches exactly two test files:

1. `apps/front/src/routes/authed/staff/jobs/cause-a11y.test.tsx`
2. `apps/front/src/routes/authed/staff/jobs/drawer-cause-parity.test.tsx`

These repair the "dead-letter drawer" tests: previously, the tests passed without ever
opening the drawer, used an inert stub instead of the real `Drawer` component and the real
`useQuery` hook, and shared the same dataset value for both the detail cause and the row
cause — making the parity assertion vacuous.

## Retrospective verdict: APPROVED (with follow-ups — all already tracked)

The substantive fix is sound. The reviewer (this pass) is from a **different model family**
than the implementer (`poolside/laguna-xs-2.1:free` reviewing code implemented by
`or:minimax/minimax-m3:free`).

### Findings against the three questions raised in #1860

**Q1: Are the repaired drawer tests empty?**
No — not vacuous after this PR. The tests now use the real `~/components/ui/drawer`, open it
via a real click, assert `role="dialog"`, and drive the real `useQuery` seam. The detail
cause and row cause datasets are now distinct values. The mutation proof in the original PR
confirms this: mutating `formatFailureCause` → identity turns 4 of 8 tests red.

**Q2: Is there a mutation that restores the defect while keeping all 8 tests green?**
The implementer's own mutation (`formatFailureCause` → identity) only breaks 4 of 8 — the
other 4 test a different code path and are documented as intentionally out of scope for that
mutation. No single mutation simultaneously restores the vacuous test AND defeats both
subsets. A composite mutation across both code paths would be required, and the surviving
tests still pin the parity distinction. The defense is layered, not single-point.

The reviewer confirms: the 8 tests are green on the reviewed tip, the 4/8 red count holds
under the documented mutation, and the tests drive real component seams (verified by the
`role="dialog"` assertion which would fail if the drawer were not actually opened).

**Q3: Is the `??` / `||` gap (#1858) the only untracked defect?**
Confirmed as the single outstanding gap. The issue body states: "le relecteur a remplacé
l'un par l'autre : aucun test n'a rougi." The follow-up #1858 is tracked separately. No
additional `??`/`||` confusion or similar operator-collapse defect was found in the diff of
these two test files.

### Known follow-ups (already on the issue tracker)

| Issue | Topic | Status |
|---|---|---|
| #1858 | `??` vs `||` on cause selection — 0 tests red under substitution | open, tracked |
| #1814 | `succeededCount > 0` guard on 8 surfaces — broader scope not addressed by #1827 | open, tracked |

The implementer explicitly scoped #1827 to #1815 only and deferred #1814. The reviewer
confirms this scoping is correct and declared in the commit message.

## Conclusion

PR #1827's technical content is approved. The self-review on the original pass means the
original verdict was not an independent signal — but this retrospective pass, conducted by a
different model family, finds no defect to correct in the shipped code. The two known gaps
(#1858, #1814) are already on the tracker and were declared by the implementer.

No follow-up PR is needed for the content of #1827 itself. The recommendation for issue
#1861 stands: the process that allowed this self-review to ship must be made
hard-failing rather than optional.

## Attestation

- Reviewed diff tip: `dfbd06eaf35308ecdc1563ebd706d886b3e78ee8`
- Reviewer: `poolside/laguna-xs-2.1:free`
- Implementer (original): `or:minimax/minimax-m3:free`
- Family match: **no** (independent)
- Tests passing on reviewed tip: 8/8 (6.35s)
