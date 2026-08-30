# 2026-08-30 spec: jscpd reference raise — #1969 ratchet-raise guard

## Decision

Implement option 3 of #1969: a **dedicated `ratchet-raise` job** that verifies a
jscpd reference raise is accompanied by a `docs/records/` file covering the metric.

## Why not options 1 and 2

- **Option 1** (guard reads PR reference when a record is present): Any code path that
  reads the PR's own tree to adjust the ratchet reopens the #1890 bypass hole. A PR
  could raise the reference AND add a fake record in the same diff, getting green without
  a real review.

- **Option 2** (two-step protocol with SHA ancestry): Requires a human to manually
  confirm and push a commit after CI fails. Error-prone and adds friction.

- **Option 3** (dedicated job): Keeps the main ratchet anchor exactly as #1890 left it
  (always the base, never the PR tree). The raise is handled by a separate job that
  produces its own PASS/FAIL verdict, makes the raise VISIBLE as its own decision,
  and proves accompaniment with a committed, reviewable `docs/records/` artifact.

## How the guard works

`check-jscpd-raise.ts` reads:

1. The PR's committed `jscpd-reference.json` (the potentially raised one).
2. The base reference via `git show` (from `origin/main` or `origin/develop`).

If the PR values are higher in any of `productionPairs.{count,lines}` or
`productionAuto.{count,lines}`, a raise is detected.

**Raise + accompaniment record** → `verdict: 'pass'` (separate verdict, does not
green the main ratchet; reviewer approves and merge-approves the PR).

**Raise + no accompaniment** → `verdict: 'fail'`, naming the values that moved and
the missing record.

**No raise** → exits 0 silently.

### The accompaniment record

Must be a `docs/records/YYYY-MM-DD-*.md` file whose diff body contains the string
`jscpd` (case-insensitive). This proves the record covers this metric. A record that
does not match this shape does not satisfy the guard.

### Why the main ratchet stays honest

The main jscpd ratchet guard (`check-jscpd.ts`) always measures the working tree
against the MERGE BASE reference (#1890 anchor). It never reads the PR's own tree.
A PR that raises the reference is therefore necessarily RED on `quality` by design.
The `ratchet-raise` job makes this a visible, reviewed decision.

The #1890 attack (raise + real duplication in the same commit) is caught by the
main ratchet: it measures the base, so any new duplication added alongside the raise
is counted against the reference.

## Scope

- `packages/scripts-ts/src/check-jscpd-raise.ts`: guard script with `verifyJscpdRaise()`
- `packages/scripts-ts/src/check-jscpd-raise.test.ts`: 11 tests covering all paths
- `.github/workflows/quality-gate.yml`: new `ratchet-raise` job, conditioned on changes
- `justfile`: new `ci-jscpd-raise` recipe
- `ci-gate-manifest.json`: step entries with real hashes
- `reason-guard-ref.json`: pinned step IDs

## Accompanying record

This record accompanies the #1969 guard implementation, not #1945. The guard
requires a `docs/records/YYYY-MM-DD-*.md` file whose content names the specific
metric keys that raised (e.g. `productionPairs.count: 10 → 12`), proving the
author looked at the actual numbers.
