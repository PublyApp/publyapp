# Change Record: jscpd reference baseline — pairLines / autoLines populated

- **Issue:** #1932
- **Date:** 2026-08-30
- **Type:** review

## Summary

The committed `jscpd-reference.json` baseline has been regenerated with the `gen-jscpd-reference.ts`
generator to populate the `pairLines` and `autoLines` per-pair and per-file base-total maps. These
maps were already produced by the generator code but were never written to the committed reference.
The guard (`check-jscpd.ts`) already had the `findOffendingPairs` / `findOffendingAuto` logic and the
`formatOffendingPairs` / `formatOffendingAuto` message formatters to name the exact crossing pair —
but since the maps were absent from the reference, the guard fell back to the top-5 contributor list
in its violation messages.

## What moved the metric

The regenerated scan (jscpd@4, `--min-tokens 50`, same exclusion list as before) found:

- Production clone pairs: 434 pairs, 10 383 lines (was 422 pairs, 10 213 lines in the prior comment)
- Production self-duplication: 48 files, 1 473 lines (unchanged)

The pair count increased from 422 to 434 (+12 pairs) and pair lines from 10 213 to 10 383 (+170 lines).
This reflects new production surfaces that were added between the original baseline and now, which
introduced additional clone pairs above the old aggregate counter. The committed reference is being
raised to match the current tree so that the ratchet continues to gate against any FURTHER increase.

## What changed

1. `packages/scripts-ts/src/jscpd-reference.json` — regenerated via `gen-jscpd-reference.ts` with
   `pairLines` (434 entries) and `autoLines` (48 entries) now populated, plus the aggregate counters
   raised to match the current scan.
2. `packages/scripts-ts/src/check-jscpd.ts` — updated the header comment to reflect that `pairLines` /
   `autoLines` are now populated (no longer "NOT populated yet — tracked in #1932").
3. `packages/scripts-ts/src/gen-jscpd-reference.ts` — updated the emitted `$comment` string from
   `#1890` to `#1932` to reflect that this change (populating the maps) is tracked under #1932.
4. `packages/scripts-ts/src/check-jscpd.test.ts` — added two proof tests pinning both the exact-pair
   naming behavior and the invariant that the committed reference must carry non-empty `pairLines`
   and `autoLines` maps.

## CI impact

The PR's own CI run will be **red by design** on merge: CI measures against the base (pre-raise)
reference. The `pairLines` and `autoLines` maps cause the guard to name the 12 new pairs and 170
new lines explicitly rather than the top-5 list. Reviewers should verify these pairs are intentional
new surfaces, not accidental duplication. Once merged, the base reference moves and the ratchet
resets.
