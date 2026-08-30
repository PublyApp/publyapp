# 2026-08-30 review: jscpd reference raise — lane/grp-ratchet-raise (#1969)

## What moved

The jscpd reference was raised to match the post-format baseline:

| Key | Before | After | Delta |
|-----|--------|-------|-------|
| productionPairs.count | 434 | 436 | +2 |
| productionPairs.lines | 10383 | 10409 | +26 |

## Why

The dot format changes (#1821) caused jscpd to detect 2 additional C#
using-block clone pairs (+26 lines) across handler files. The guard mechanism
was added in the same PR to allow reviewed reference raises to land.

## Guard

`check-jscpd-raise.ts` — verifies accompaniment with a `docs/records/` file
that names the raised keys and their values.
