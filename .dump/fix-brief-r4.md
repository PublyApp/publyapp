# Fix brief r4 — PR #1171 — one finding from .dump/verdict-r3.md

Worktree: /home/radan/Projects/PublyApp/publyapp/.worktrees/pr1171.

FINDING: `analyzeFile` (apps/front/e2e/__tests__/tag-guard.ts) records an `error` for an unsupported describe shape, but `e2e-tag-guard.test.ts` only asserts tags on `filter(d => d.topLevel)`. A real spec containing one correctly tagged top-level describe PLUS one unsupported-shape describe stays GREEN — the error is produced and never read. That is a silent false negative, the exact class this PR exists to remove.

FIX: the guard test over the real e2e directory must fail if ANY record of ANY file carries `error` (message naming file + position + shape). Keep it as a separate assertion/test case so the failure output is explicit.

PAIRED PROOF (mandatory, in `.dump/proof-r4.md` and the commit body): add a throwaway describe with an unsupported shape (e.g. `const cb = () => {}; test.describe('x', cb)`) to a real spec that already has a valid tagged top-level describe → run the guard → must be RED with the explicit message. Show it was GREEN before your change (git stash the test change, run, restore). Remove the throwaway afterwards.

Gates: `pnpm --filter front test` (run from apps/front or with --filter), `pnpm --filter front typecheck`, `pnpm lint`. Commit `fix(e2e): tag guard fails on any unsupported describe shape, not only on missing tags`, push, PATCH PR body (add R4 row; `gh api -X PATCH repos/radandevist/publyapp/pulls/1171 -f body=@.dump/body-r4.md`), `gh pr checks 1171 --watch` (max 25 min). Last line exactly: `DONE tip=<sha> ci=<green|red> body=patched`.
