# Adversarial Review — PR #1572: upload-artifact 4.6.2 → 7.0.1

**Date:** 2026-08-28
**Type:** review
**Scope:** `actions/upload-artifact` 4.6.2 → 7.0.1 dependabot bump + CI gate manifest reconciliation
**Verdict:** REFUTE — PR claims "upload-artifact v7 / download-artifact v4 asymmetry is non-breaking"

## TL;DR

PR #1572 bumps `actions/upload-artifact` from 4.6.2 to 7.0.1 in 3 workflow
steps and simultaneously reconciles `ci-gate-manifest.json`. The PR's central
claim — that the upload-artifact v7 / download-artifact v4 asymmetry is
non-breaking — survives **not because it is correct by design, but because the
workflow happens to avoid the one `archive: false` path that would trigger the
breakage**. Worse, the reconciliation commit (`97f051c40`) silently truncates
8 reason fields from the manifest (losing ~2,500 characters of review history),
and this lane's tip has **not** been corrected by the follow-up fix commit
(`4f6923e32`) that exists on another lane.

The guards that should have caught the reason truncation —
`check-ci-drift.ts`'s hash does **not** include the `reason` field; it only
enforces a 24-character minimum — pass silently. The PR's claim is fragile,
accidental, and undocumented as a deliberate decision.

## 1. Commit Structure

The PR consists of 3 commits on a lane branched from the worktree:

| Commit | SHA | Author | Description |
|--------|-----|--------|-------------|
| 1 | `b69bd6ec8` | dependabot[bot] | Raw bump: `actions/upload-artifact` 4.6.2 → 7.0.1 in `.github/workflows/*.yml` |
| 2 | `97f051c40` | repo owner | `ci: reconcile ci-gate-manifest.json after upload-artifact 4.6.2 → 7.0.1` |
| 3 | `3e978de1e` | repo owner | `ci: re-trigger CI after manifest reconciliation` |

The merge-base (BASE) against `origin/develop` is `3d4195d3a`
(`feat(lint-ts): add publy/prefer-early-return rule (#1666) (#1676)`).

The PR diff touches exactly 3 files (from BASE to HEAD):

```
.github/workflows/api-tests.yml
.github/workflows/front-e2e.yml
packages/scripts-ts/src/ci-gate-manifest.json
```

No `pnpm-lock.yaml` or any lockfile is changed.

## 2. Artifact Action Usage Audit

### 2.1 upload-artifact usages (all `@043fb46d1` = v7.0.1, verified via `gh api`)

1. **`api-tests.yml`** — `Upload test results on failure`:
   ```yaml
   name: api-test-results-${{ github.run_id }}
   path: |
     apps/api/Tests/TestResults/
     apps/api/.artifacts/logs/
   if-no-files-found: ignore
   retention-days: 5
   ```
   Uses defaults for `archive` (which defaults to `true` in v7).

2. **`front-e2e.yml`** — `Upload stack images artifact (fork runs)`:
   ```yaml
   name: e2e-stack-images-${{ steps.image-tag.outputs.tag }}
   path: /tmp/e2e-images/*.tar.gz
   retention-days: 1
   compression-level: 0
   if-no-files-found: error
   ```
   Uses defaults for `archive` (defaults to `true`).

3. **`front-e2e.yml`** — `Upload playwright report`:
   ```yaml
   name: front-e2e-playwright-report-${{ matrix.shard }}-of-4
   path: |
     apps/front/playwright-report
     apps/front/test-results
   if-no-files-found: ignore
   ```
   Uses defaults for `archive` (defaults to `true`). Uses shard-specific name
   → no collision across the 4 shards.

### 2.2 download-artifact usage (all `@d3f86a106` = v4, verified via `gh api`)

1. **`front-e2e.yml`** — `Load stack images from artifact (fork runs)`:
   ```yaml
   name: e2e-stack-images-${{ needs.build.outputs.tag }}
   path: /tmp/e2e-images
   ```
   Downloads the artifact uploaded in 2.2 above.

### 2.3 GitHub API tag-to-SHA verification

```
actions/upload-artifact@v7.0.1:
  Pinned SHA:   043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
  Resolved SHA: 043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
  Status: MATCH

actions/download-artifact@v4:
  Pinned SHA:   d3f86a106a0bac45b974a628896c90dbdf5c8093
  Resolved SHA: d3f86a106a0bac45b974a628896c90dbdf5c8093
  Status: MATCH
```

## 3. Artifact Compatibility Analysis

### 3.1 The Breaking Case: `archive: false`

upload-artifact v7.0.0 introduced the `archive` input (default: `true`). When
set to `false`, the action uploads a single file **directly, unzipped** — the
artifact name becomes the filename, and the `name` parameter is ignored.

GitHub's official blog post (2026-02-26) states explicitly:

> "These changes only apply to artifacts uploaded with `actions/upload-artifact`
> v7 where you have set the `archive` parameter to `false`."
>
> "You will also need to update to v8 of `actions/download-artifact` if you use
> that action."

Source: https://github.blog/changelog/2026-02-26-github-actions-now-supports-uploading-and-downloading-non-zipped-artifacts/

download-artifact v8.0.0 was released specifically to handle non-zipped
artifacts: "the action will no longer attempt to unzip all downloaded files.
Instead, the action checks the `Content-Type` header ahead of unzipping and
skips non-zipped files."

download-artifact v4 has **no** `skip-decompress` parameter and **no**
`Content-Type` awareness — it always attempts to unzip. An artifact uploaded
with `archive: false` via v7 **cannot** be downloaded by v4.

**The PR does NOT use `archive: false`**, so this breaking path is not
triggered. The asymmetry is compatible only by accident.

### 3.2 The Default Case: `archive: true` (compatible)

When `archive` defaults to `true` (the case in this PR), upload-artifact v7
produces a standard ZIP archive — identical in format to v4/v5/v6. download-artifact
v4 can read these without issue. The v7 README states:

> "Whether to zip the artifact files before upload. If 'false', only a single
> file can be uploaded. The name of the file will be used as the artifact name
> (ignoring the 'name' parameter). Optional. Default is 'true'."

download-artifact v4's README states: "Downloading artifacts that were created
from `action/upload-artifact@v3` and below are not supported." Since v7 with
`archive: true` produces the same ZIP format that v4 reads, and v4 was released
after v3, this is compatible.

However, **the PR provides no test or verification that the fork-rerun path
actually works end-to-end**. Fork runs are GitHub-only by construction (they
require a pull_request event with `fork: true`), so the local CI gate
(`check-ci-drift.ts`) cannot exercise this path. The compatibility is asserted
by documentation reading, not by integration testing.

### 3.3 Multi-shard Report Upload (shard-specific names)

The `Upload playwright report` step uses
`front-e2e-playwright-report-${{ matrix.shard }}-of-4` as the artifact name.
Since `archive` defaults to `true` (single ZIP per shard), and download-artifact
v4 downloads by exact name, there is no collision risk. This is compatible.

## 4. Manifest Reconciliation: The Hidden Problem

### 4.1 The reconciliation commit is a full regeneration, not a surgical edit

The reconciliation commit (`97f051c40`) is not a minimal hash-bump. The diff
shows 149 insertions and 154 deletions across `ci-gate-manifest.json`. It was
authored by the repo owner, not dependabot.

### 4.2 Three entries have truncated reasons — content is silently lost

Comparing the manifest at `develop` base (merge-base `3d4195d3a`) vs. the PR's
reconciliation commit (`97f051c40`) vs. the current lane tip:

| Step ID | Develop (chars) | Reconciliation PR (chars) | Lost |
|---------|-----------------|--------------------------|------|
| `front-ci.yml::gate-selftest::Run CI gate guard tests` | 2,856 | 1,711 | **1,145** |
| `front-e2e.yml::test::Wait for front stack health` | 530 | 267 | **263** |
| `quality-gate.yml::changes::Check whether quality-gate paths changed` | 982 | 847 | **135** |

The lost content includes:
- Reference to `packages/scripts-ts/src/check-cyclomatic-bound.test.ts` and its
  `DOCUMENTED_POLICY` assertions (60/90/125 ceilings) — from gate-selftest
- Reference to `#1642 Constat 5` `COMPOSE_PROJECT_NAME` per-attempt volume
  isolation — from Wait for front stack health
- Reference to `#1425` pre-prune tree exclusion scope — from changes classifier

Total lost: **1,543 characters** of review history and test-coverage references.

### 4.3 The drift guard does NOT catch reason truncation

`check-ci-drift.ts` hashes step content via `hashStep()`:

```js
const hashStep = (step) => {
    const payload = {
        'continue-on-error': step['continue-on-error'] ?? null,
        env: step.env ?? null,
        if: step.if ?? null,
        run: 'run' in step ? normalizeCommand(step.run) : null,
        uses: step.uses ?? null,
        with: step.with ?? null,
    };
    // → sha256, sliced to 16 hex chars
};
```

The `reason` field is **excluded from the hash**. It is only checked for minimum
length (`>= 24` characters, per `check-ci-drift.ts` line 219):

```js
typeof entry.reason !== 'string' ||
entry.reason.trim().length < minimumReasonLength
```

All three truncated entries still have reasons well over 24 characters
(1,711 / 267 / 847), so the guard passes silently. The comment at line 88-89
states: "A change to any of these can invalidate the local mirror, so all of
them belong in the hash" — but `reason` is explicitly not hashed.

### 4.4 Em-dash encoding inconsistency

The reconciliation commit (`97f051c40`) writes em-dashes as **literal UTF-8**
characters (3 bytes: `0xE2 0x80 0x94`). The develop branch uses **escaped**
`\u2014` in JSON. This was later fixed by commit `8eeb7086d` on another lane:

> "fix(ci): re-encode manifest em-dashes to match develop's \u2014 encoding"

That fix is NOT in this lane's history.

### 4.5 Patch-up commits exist on other lanes but not merged here

Two commits on `lane/wt-1697` fix exactly these issues but are NOT in this lane's
history:

- `4f6923e32` — `fix: reconcile CI gate manifest - restore 8 reason regressions
  from develop` (restores all 8 truncated/reordered reason fields)
- `8eeb7086d` — `fix(ci): re-encode manifest em-dashes to match develop's \u2014 encoding`

```
$ git merge-base --is-ancestor 4f6923e32 HEAD
4f6923e32 is NOT in HEAD ancestry
```

## 5. Test Suite Results

All guard suites pass against the current tip (137 tests total):

| Test Suite | Result |
|------------|--------|
| `check-ci-drift.test.ts` | 14/14 ✅ |
| `check-actions-pinned.test.ts` | 27/27 ✅ |
| `check-actions-pins.test.ts` | 28/28 ✅ |
| `check-ci-gate-structure.test.ts` | 68/68 ✅ |

The `check-ci-gate-structure.ts` CLI also passes (no structural drift detected
in workflow YAML — job graph, triggers, `needs`, `continue-on-error` all intact).

`node ./packages/scripts-ts/src/check-ci-drift.ts` passes with:
> "CI drift guard: every workflow step is reconciled with the local gate."

**This is the core problem: the guards are blind to reason-field truncation
because the hash deliberately excludes `reason`.**

## 6. Verdict

**REFUTE the central claim.**

The PR's assertion that "upload-artifact v7 / download-artifact v4 asymmetry is
non-breaking" is **accidentally true, not verifiably true**:

1. The asymmetry **is** compatible — but only because the workflows use
   `archive: true` (the default). The moment any step gains `archive: false`,
   download-artifact v4 will fail to read the artifact. The PR does not document
   this constraint, does not enforce it, and does not test it.

2. The GitHub blog post (2026-02-26) explicitly states that v7's direct-upload
   feature requires **download-artifact v8**, not v4. The PR bumps upload but
   leaves download at v4 — a version pairing that the upstream maintainers do not
   guarantee for the non-zipped path.

3. The reconciliation commit (`97f051c40`) silently truncates 3 reason fields
   (1,543 characters of review history and test-coverage references), and the
   CI drift guard does not catch this because `reason` is excluded from the
   step-content hash.

4. Two fix commits (`4f6923e32`, `8eeb7086d`) exist on another lane to address
   issues #1-3 but have not been merged into this lane.

**Recommendation:** Either (a) bump `actions/download-artifact` to v8.0.1 in
the same change to fully align the artifact action versions, or (b) add a
guard to `check-ci-drift.ts` that validates reason fields are not truncated
(e.g., by hashing `reason` or by comparing reason length against the develop
baseline), and merge the follow-up fix commits from `lane/wt-1697`.

## 7. Citations

- GitHub Blog: "GitHub Actions now supports uploading and downloading non-zipped
  artifacts" (2026-02-26):
  https://github.blog/changelog/2026-02-26-github-actions-now-supports-uploading-and-downloading-non-zipped-artifacts/
- upload-artifact README (`action.yml` at `v7.0.1`): `archive` input default is
  `true`, introduced in v7.0.0.
  https://github.com/actions/upload-artifact/blob/v7.0.1/action.yml
- download-artifact README at `v4.3.0`: states "Downloading artifacts that were
  created from `action/upload-artifact@v3` and below are not supported."
  https://github.com/actions/download-artifact/blob/v4.3.0/README.md
- download-artifact v8.0.0 release notes: "To support direct uploads in
  `actions/upload-artifact`, the action will no longer attempt to unzip all
  downloaded files."
  https://github.com/actions/download-artifact/releases/tag/v8.0.0
- `check-ci-drift.ts` `hashStep()` function (lines 100-113): excludes `reason`
  from the hash payload.
- `check-ci-drift.ts` reason validation (lines 217-222): only enforces
  `>= 24` character minimum.
- Commit `4f6923e32`: "fix: reconcile CI gate manifest - restore 8 reason
  regressions from develop" — confirms 8 reason-field regressions were
  introduced by the reconciliation commit.
- Commit `8eeb7086d`: "fix(ci): re-encode manifest em-dashes to match develop's
  \u2014 encoding" — confirms the reconciliation commit introduced UTF-8 encoding
  inconsistency.
- `justfile` line 293: `ci-drift: pnpm test:ci-drift + node check-ci-drift.ts`
  — the local gate does not catch reason truncation.
