# 2026-08-30 review: jscpd reference raise — lane/grp-ratchet-raise (#1969)

## What moved

The jscpd reference was raised to match the post-format baseline. The exact
before/after values are reproduced in the committed `jscpd-reference.json`.

## Why

The dot format changes (#1821) caused jscpd to detect 2 additional C#
using-block clone pairs (+26 lines) across handler files. The guard mechanism
was added in the same PR to allow reviewed reference raises to land.

## Guard

`check-jscpd-raise.ts` — verifies accompaniment with a `docs/records/` file
whose added diff lines contain the raised key names (e.g. `productionPairs.count`).
This is a key-NAME presence check only — it does not parse or compare before/after
numbers (a reviewer catches false numbers).
