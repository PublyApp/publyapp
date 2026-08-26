# Lane 936 — DONE

Tip SHA: `8a97dced03f311ee03a47fb0dc30ce4f38d5601e` (branch `lane/wt-936`)
PR: https://github.com/PublyApp/publyapp/pull/1471 (`Closes #936`)

## Checklist against the brief

- Evidence first: `.dump/evidence.md` committed (40c6fd378) and pushed BEFORE the fix. Last 10 develop runs tabulated + playwright artifacts from every retrievable failed run downloaded.
- ONE hypothesis: store initializes on hardcoded defaults; persisted panel state applied only in ThemeHydrationListener's post-commit effect → every load renders default panel state first, then flips. App race, fixed at the root in the app.
- Fix: `ui-store.ts` reads persisted UI state into INITIAL_UI_STATE at module load (client-only path; SSR keeps neutral defaults). Regression test added in `app-shell.test.tsx`.
- RED property proven: with the fix stashed the regression test fails (1 failed / 13 skipped); with it, green.
- No `test.retry`, no `waitForTimeout`, no `test.fixme/skip`, no disable comments, no `!`, no local e2e runs.
- CI: run 32939683197 — all checks pass including front-e2e 4/4 shards; `gh run rerun` executed once and the rerun completed success (both greens witnessed).
- PR body set from `.dump/pr-body.md` via `gh api -X PATCH`.

## Lane 1461 — already delivered upstream (no work by this lane)

While preparing the RED proof we found issue #1461 CLOSED at 2026-08-26T05:53Z by merged PR #1465
(`refactor(posts): PostMediaAssetService stops injecting IUploadAssetReferenceService — boundary ratchet (#1461)`,
merge commit e13ee04a7), one hour before this lane reached implementation. That PR covers the whole brief:
allowlist entry deleted, acquire/release moved into AttachPostImageForTenant/RemovePostImageForTenant/DeletePostForTenant,
RED proof quoted, 146 targeted + 2158 total API tests green under heavy.sh, adversarial mutation reported honestly,
zero OpenAPI drift. Re-implementing it would have conflicted with develop for no value; local scratch branch deleted.

Model: Ox Alpha via Nous Portal (jcode), effort max
