# CI gate: bind the event merge commit to live content, not object id

Date: 2026-10-28. Supersedes, without editing, the oid-equality rule in
[`2026-09-05-spec-ci-consolidation-design.md`](2026-09-05-spec-ci-consolidation-design.md).
Issues: #2216 (stale event SHA), #2159 (partial re-runs).

## Superseded rule

The 2026-09-05 record requires `event_sha == live potentialMergeCommit.oid` for a `pull_request`
run. It states this at line 214 (the gate's first policy step), line 273 (the closure algorithm's
snapshot record), line 275 (the evidence binding) and line 288 (the "Realistic PR run binding"
fixture row), and relies on it in the base-advance rows around line 287 and in the risk table at
line 443. Equality of object ids is no longer the rule.

## Why

GitHub re-creates a pull request's test merge commit with the same parents and the same tree but a
new object id (new timestamp) on `ready_for_review`, description edits and similar events. A
re-run keeps the original `GITHUB_SHA`, so the event SHA can never equal the recomputed oid again.
A fully green run therefore failed `ci-final-gate` with "stale event SHA does not match merge
commit", and re-running could not recover. The oid is an accident of when GitHub minted the
commit, not evidence about what is being merged.

## New rule

The gate (`packages/scripts-ts/src/ci-pr-snapshot.ts`, `validatePrSnapshotBinding`) accepts a
pull-request run when either the oids are equal (fast path) or **all three** of these hold between
the event merge commit (`GITHUB_SHA`) and the live potential merge commit:

1. same head: the second parent equals the live PR `headRefOid` (and the run's `head_sha`);
2. same base tip: the first parents are equal;
3. same tree.

Anything else is rejected with a message naming what moved (head, base, tree, content
unavailable, or not a two-parent merge). A moved head or base, or a different tree, is still
stale evidence.

The live side is read in one GraphQL query (`headRefOid`, `potentialMergeCommit` oid, tree,
parents). The event side is read from the gate job's own `fetch-depth: 0` checkout with
`git --no-replace-objects cat-file commit`, falling back to the REST commits API when the object
is missing or is not a two-parent commit. The policy-read to snapshot-write comparison applies the
same content rule to the merge commit.

## Snapshot contract (additive, `schema_version` stays 1)

`ci-pr-snapshot-<run_id>-<run_attempt>` keeps every existing field, including
`potential_merge_commit_oid` and `event_sha`, and gains optional fields:

| Field | Meaning |
| --- | --- |
| `event_merge_tree` | tree oid of the event merge commit |
| `event_merge_parents` | `[base tip, PR head]` of the event merge commit |
| `potential_merge_tree` | tree oid of the live potential merge commit when the gate ran |
| `potential_merge_parents` | `[base tip, PR head]` of the live potential merge commit |

A field is omitted when the gate could not read the content. Readers that check only
`schema_version` and the older fields keep working.

## External consumers

A consumer that previously required `snapshot.event_sha == live potentialMergeCommit.oid` (for
example the PR-closure tool in the shared orchestration playbook) should accept the pair when the
oids are equal, or when its own fresh live read of the PR's potential merge commit has the same
head (second parent), the same base tip (first parent) and the same tree as the snapshot's
`event_merge_*` fields. It must still reject when the snapshot is missing those fields and the
oids differ, and when head, base or tree differ.

## Partial re-runs (#2159)

`ci-final-gate` now downloads `ci-lane-result-<run_id>-*` across every attempt of the run and keeps
the highest-attempt artifact per lane. Superseded lower-attempt containers are neither read nor
validated. The retained artifacts are validated exactly as before, the central `needs.*` results
remain the backstop, and the full 15-lane set is still required. The e2e shards keep refusing a
partial re-run through their image-tag guard.
