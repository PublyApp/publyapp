# PublyApp Orchestration Adapter

Fielded adapter for `/home/radan/ai-orchestration-playbook/PLAYBOOK.md`.

## Required Fields

| Field | Value |
|---|---|
| `default_branch` | `develop` |
| `setup_cmd` | `eval "$(fnm env)" && fnm use 24`; `corepack pnpm --version`; `pnpm install --frozen-lockfile`; `dotnet restore PublyApp.slnx` |
| `build_cmd` | Canonical: `just build-api`, `pnpm --filter front build` (the shipped app has no justfile build wrapper; `just build-old-front` targets the retired app). On hosts without `just`, run the recipe bodies from `justfile` directly. |
| `test_cmd` | API: `dotnet test apps/api/Tests/PublyApp.Api.Tests.csproj -c Test`; shared TS: `pnpm --filter @org/shared-ts test`; front e2e: `docker compose -f apps/front/docker-compose.test.yml up -d --build`, then `pnpm --filter front exec playwright test`, then `docker compose -f apps/front/docker-compose.test.yml down -v`. |
| `lint_cmd` | Canonical: `just check-write`, `just tsc-old-front`. For front work: `pnpm --filter front typecheck`; run formatting/lint recipe bodies directly if `just` is unavailable. |
| `acceptance_cmd` | Local exit gate: `pnpm --filter @org/shared-ts test`; `pnpm --filter front typecheck`; run the local e2e harness with `docker compose -f apps/front/docker-compose.test.yml up -d --build`, `pnpm --filter front exec playwright test`, and `docker compose -f apps/front/docker-compose.test.yml down -v`. After API contract changes, also run `just build-api && just generate-client && just tsc-old-front` or the equivalent recipe bodies. |
| `client_regen_cmd` | `just generate-client` for API contract changes; never edit `packages/client-ts/` manually. |
| `worktree_root` | **All task worktrees live under `<repo>/.worktrees/pr<NUMBER>`** (i.e. `/home/radan/Projects/PublyApp/publyapp/.worktrees/pr994`) — NEVER as siblings of the clone (`/home/radan/Projects/PublyApp/<name>`). **Name a worktree after the pull request it produces, never after the issue**: one issue routinely carries several competing implementations, and issue-named directories collide the moment it does, while the PR number is unique by construction and is what a reviewer actually searches for. The PR number does not exist until the branch is pushed, so create under a provisional slug, push and open the PR immediately, then `git worktree move <provisional> .worktrees/pr<NUMBER>`. **Never string-build a worktree path from this convention** — after a move, the git metadata directory keeps the original internal name (`.git/worktrees/<provisional>` still backs `.worktrees/pr994`), so resolve the live path from `git worktree list --porcelain` instead. `.worktrees/` is gitignored and covered by `.vscode/settings.json` `files.watcherExclude`/`search.exclude`; sibling worktrees are not, so each (with its own `node_modules`) is watched by the VS Code remote fileWatcher and shows as top-level clutter on the Windows/Samba mount — this spiked host RAM to ~12 GB (4.4 GB fileWatcher) on 2026-07-11. Create with `git worktree add -b <branch> .worktrees/<provisional> origin/develop`, then rename once the PR number exists; tear down promptly after the PR merges with `git worktree remove <path>` (preserves the branch; refuses on dirty/untracked without `--force`, so zero-data-loss). Isolated worktree per task, outside repo-local `node_modules`. (Historical note: the old M1 driver used sibling `ft2-<TASK_ID>` dirs — that convention is superseded by this `.worktrees/` rule.) |
| `host_parallelism` | Host: 64 GB / 12-core (12th-gen i5). Don't cap agent headcount (not ~2); many lightweight agents run in parallel. Serialize only heavy-resource jobs: one Docker/compose e2e stack at a time, no concurrent full `dotnet`/API/e2e runs. |
| `executor` | Implementation and fix passes, either lane: `codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.6-luna -c model_reasoning_effort="high"` **or** `opencode run -m cline-pass/cline-pass/deepseek-v4-flash --auto --dir <worktree> "<brief>"` (the `cline-pass` provider id is doubled in the model string, and `--auto` is required or the run stalls on the first permission prompt with no terminal to answer it). Review passes: `codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.5 -c model_reasoning_effort="high"` **or** `claude -p --dangerously-skip-permissions --model claude-opus-4-8` (feed the brief as an argv prompt or via stdin; `claude -p` buffers all output until exit, so an empty log mid-run means "still thinking", not `FAILED-EMPTY`). For M1, use `.dump/exec/driver.sh <TASK_ID>` after writing `.dump/exec/<TASK_ID>/brief.md` and `accept.md`. |
| `model_ladder` | **Updated 2026-08-01 (Radan).** Implementation/fix lanes: `gpt-5.6-luna` (codex) and `cline-pass/cline-pass/deepseek-v4-flash` (opencode). Review lanes: `gpt-5.5` @ high or `claude-opus-4-8` @ high. **The playbook's cross-family review rule is explicitly waived by Radan** — any reviewer from either family may review any implementer. **`gpt-5.3-codex-spark` is available again.** OpenAI reverted the decommissioning; the previous `400 invalid_request_error — "The 'gpt-5.3-codex-spark' model is not supported when using Codex with a ChatGPT account."` no longer reproduces. Re-probed 2026-08-01 and it answers normally, so it is routable once more. Effort ≤ `high`; `xhigh`/`max` only with a ledgered escalation reason (owner-requested model evaluation counts). Epic #700 still requires a real reviewer `VERDICT: APPROVED` before its PR. If a lane is unavailable or quota-limited, reroute to the sibling lane in the same role and ledger the reroute. **Lane selection (Radan, 2026-07-10, still holds): deepseek is not strong on broad tasks — brief it narrowly.** Route well-specified fix packets (enumerated findings, file:line, named call sequences) to deepseek; route open-ended build-a-screen packets to `gpt-5.6-luna`. For deepseek, always state the intended **user-visible end state**, not only the change to make — its defects land where the brief left a judgment call open (it removed fabricated 2FA values as asked, then rendered `TODO(contract): 2FA status` as visible UI text). **Verified reachable 2026-08-01** (each probed, not assumed): via `codex -m` — `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.6-sol`, `gpt-5.3-codex-spark`. Via `opencode run -m` — provider `cline-pass` exposes `deepseek-v4-flash`, `deepseek-v4-pro`, `glm-5.2`, `kimi-k2.6`, `kimi-k2.7-code`, `kimi-k3`, `mimo-v2.5`, `mimo-v2.5-pro`, `minimax-m3`, `qwen3.7-max`, `qwen3.7-plus`; provider `opencode-go` exposes `deepseek-v4-flash` and `deepseek-v4-pro`. **Route deepseek through `cline-pass`, not `opencode-go`:** the updated V4 Flash on `opencode-go` refuses with *"The latest version of this model is only available hosted in China and requires explicit opt in"*, and that opt-in is an owner decision, not an executor's. Reaching for a model outside the named implementation/review lanes for *routine* work is still a stop-and-ask; drawing from the verified list above for an owner-sanctioned evaluation is not. |
| `push_guard` | Active hook path should be Husky (`core.hooksPath=.husky/_`); `.husky/pre-push` blocks direct pushes to protected branches. Feature-branch policy is brief-driven plus CI. Never push or commit directly to `develop`. |
| `verification_floor` | Every implementation/fix packet's verification block MUST include `npx oxlint <changed files>` with **0 errors**. Vitest + typecheck + `check:design-system` are all green over defects that oxlint catches (e.g. `react(jsx-key)` is an error, not a warning). Executors omit lint unless the brief names it. |
| `known_quirks` | **A stray `vite dev` watcher rewrites `apps/front/src/routeTree.gen.ts` from its own stale in-memory route config.** If a dev server was started before a `routes.ts` entry existed, it strips that route from the generated tree on every write — including immediately after `git checkout --`. Symptoms: a route that `routes.ts` declares never appears in `routeTree.gen.ts`, `tsc` reports `TS2820 … Did you mean` for a route you just added, and the file reverts under you. **Before diagnosing any route-registration or generated-file problem, run `pgrep -af vite` and kill strays.** `routeTree.gen.ts` is generated and tracked; regenerate with `vite build`, never hand-edit. Playwright `toHaveCSS` compares the **computed** style, never the authored one. Chrome resolves `fr` grid tracks to used pixels (`grid-template-columns: 1fr 1fr` → `"471.5px 471.5px"`), and Tailwind opacity modifiers (`bg-background/97`, `bg-destructive/10`) compute to `oklab(...)`. Assert computed values — equality/ratio for grid tracks, literal-rgba custom properties for colors — never the source string. `check:design-system` is a **regex scanner, not a type checker**: it greps for hex/rgba literals and only within `appliesTo` roots. A `--publy-*` token that is *referenced but never declared* renders transparent and passes clean — verify declarations (`grep -- '--publy-x:'`), not just usages. Tabler ships as `@tabler/icons-react` **components**; there is no webfont, so `<i className="ti ti-check" />` mounts and renders nothing while every test passes. A Playwright glob's `*` compiles to `([^/]*)` and cannot cross `/`; only `**` becomes `(.*)`. A `page.route()` glob ending in a single `*` matches the collection endpoint but never its sub-paths, so the handler is dead code and the request escapes to the **real API while the spec still passes** — a mock that fails to intercept does not fail the test. This defeated three specs across two packets *after* it was written into the trap list, so it is now a gate rule (`no-single-star-route-glob`, `check:design-system`, which also scans `e2e/`). Suppression requires `// design-system-ignore: <rule-id> — <reason>`; a bare marker does not suppress. **Lesson: a trap that recurs after being documented needs to become a control, not a louder paragraph.** opencode `run --dir <worktree>` auto-rejects any path outside the dir in non-interactive mode: briefs, distilled context files, and STATUS markers must live INSIDE the target worktree (gitignored `.dump/` is absent from fresh worktrees — copy bundles in). Implementation packets must be single-screen sized with captain-distilled design context; never point an executor at the raw 546KB design canvas (`PublyApp front-2.dc.html`) or at SPEC.md wholesale — it has killed an executor's context window. This was first learned on the now-decommissioned `gpt-5.3-codex-spark` and applies at least as strongly to `gpt-5.6-luna`, which is a fast/affordable tier. The captain greps the canvas and hands down the extracted values. TanStack route filenames contain `$` (`$userId.tsx`): executors must single-quote such paths in every shell command or write via patch tools — unquoted `$userId` shell-expands to an empty string and silently writes broken filenames like `.tsx`. `just` may be unavailable on this host; run recipe bodies directly. Use `fnm use 24` per shell. Review must be diff-based from the main repo cwd, not `--cd` into a worktree with `node_modules`, because Codex can hang crawling it. Feed prompts via stdin redirect. `codex exec` can exceed foreground wrappers; run long drivers backgrounded and poll `STATUS`. Verify LLM API-shape blockers against installed package types plus runtime smoke before fixing. HeroUI v3.2.1 `Button variant="primary"` is correct. TanStack Start `server.ts` uses single-arg `createStartHandler(defaultStreamHandler)`. PG18 Docker data mounts must target `/var/lib/postgresql`, not `/var/lib/postgresql/data`. |
| `additive_merge_files` | `.oxlintrc.json`, `.editorconfig`, `AGENTS.md`, `packages/lint-ts/src/index.js`, `docs/guides/lint-rules.md`. Conflicts outside this list are STOP-and-report. |
| `dump_dir` | `.dump/` for run artifacts, briefs, review output, squash bodies, and handoffs. |
| `issue_hierarchy` | Front-2 Phase 1 epic: `#700`. M1 tracking issue: `#707`; M1 PR must include plain-text `Closes #707`. Every PR needs a linked issue and `closingIssuesReferences` verification. Never merge without explicit per-PR confirmation from Radan. |

## M1 Run Binding

- Integration branch: `feat/front-2-phase-1-m1`.
- Task sequence: M1.1 solo, then M1.2 and M1.4 in parallel, then M1.3 solo.
- Per-task status file: `.dump/exec/<TASK_ID>/STATUS` with `APPROVED`, `MAXR`, or `FAILED-EMPTY`.
- After each task reaches `APPROVED`, merge its task branch into `feat/front-2-phase-1-m1` before starting dependent work.
- Final gate: global GPT-5.5 xhigh review after all four tasks, loop until `VERDICT: APPROVED`, then PR to `develop`.

## Hard Stops

- Missing or dirty source checkpoint before dispatch.
- Unknown required preflight ledger field.
- Any implementation route requiring Claude or a non-Codex model.
- Reviewer returns `CHANGES REQUIRED`, `MAXR`, or no clean `VERDICT: APPROVED`.
- Non-additive merge conflict outside `additive_merge_files`.
- Need to merge a PR without explicit Radan authorization.
- Scope change, secret exposure risk, auth/security invariant uncertainty, or e2e harness failure with unclear cause.

## Owner deliverables — do these without being asked

These are standing obligations, not per-task instructions. Radan should never have to ask for any of
them. Every one below has had to be requested more than once.

**A squash body is written the moment a PR is review-approved.** Not when merging is proposed, not when
asked. The approval is the trigger. Write it to `.dump/squash-<PR>.md` and say only the path in chat.

**Deliverables go to files under `.dump/`, never inline in chat.** Squash bodies, PR bodies, review
output, plans, analyses. Chat gets a path pointer and the few sentences that need a decision. Pasting the
artefact into chat instead of writing the file is the single most repeated correction in this repo's
history; if a request seems to ask for the content, it is asking where the file is.

**Squash body format, strictly.** Plain text. No leading conventional-commit subject line, no `##`
headers, no bold, no backticks, no code fences, plain `-` bullets. Owner-facing plain language: describe
what changed and why it matters, not the commit sequence. Ends with `Closes #N` — the
require-linked-issue gate fails without a closing keyword, so `Part of #N` alone will red the PR. Never
include a "generated with" line or a `Co-Authored-By` trailer, in the body or in any commit message.
Offer the subject line separately, in chat.

**Every PR opens against `develop` with a linked issue.** If no issue exists, file one first and describe
the defect there, including how it was found. Never push to `develop` directly; branch, then PR.

**`gh pr edit` is broken on this repository.** It exits 1 and silently writes nothing. Use
`gh api -X PATCH` and verify by reading the body back, not by checking the exit code.

**Worktrees live under `publyapp/.worktrees/` and are named `pr<NUMBER>`** after the PR they produce.
Create under a provisional slug, open the PR, then `git worktree move` onto the `pr<NUMBER>` name. Never
string-build a worktree path — `git worktree move` leaves git metadata under the original internal name,
so read paths from `git worktree list --porcelain`.

**When a PR is merged, remove its worktree and delete its branches** without being asked.

**Report status in plain language.** Keep SHAs, branch names and internal jargon out of owner-facing
summaries unless they are the point. Say what is ready, what is blocked, and on what.

## Verification lessons — front-2 owner-feedback batch (2026-07-10)

**A green check is a claim, not evidence. Probe the claim.** Three defects in this batch passed every
gate the executor could run:

1. **A test that mocks the seam it exists to prove.** `$userId/index.test.tsx` did
   `vi.mock('~/routes/.../$userId')` — the exact module whose duplicate instantiation was the bug.
   362 vitest tests, clean typecheck, clean oxlint, and a page that threw at runtime. Under vitest
   there is a single module graph, so *no* unit test can observe a duplicate-module defect. Only a
   **build-output check** can.
2. **A guard that cannot fail.** The chunk-isolation guard written to catch (1) matched
   `createContext(` while the code says `createContext<T>(`. It found zero contexts and exited 0
   unconditionally; its six fixtures passed because they used the non-generic form. Caught only by
   planting a duplicate chunk in the real `dist/client/assets` and watching the guard let it through.
3. **A mock that never intercepts.** A `page.route()` glob ending in a single `*` cannot cross `/`,
   so the request escapes to the real API *and the spec still passes*.

**Rules that follow:**
- When you add a guard, **prove it fails**: plant the defect it targets and watch it fire. A guard
  without a demonstrated failure is decoration. Require the failing transcript in the packet report,
  not a passing fixture suite.
- A defect that recurs after being documented must become a **control**, not a louder paragraph
  (`no-single-star-route-glob`, `no-icon-font-classes`, `check:context-chunk-isolation`).
- Ask what a passing test would look like if the feature were broken. If the answer is "the same",
  the test is worthless.
- **Executors cannot run Playwright** (the captain owns the single Docker stack). They therefore write
  e2e blind, and did so wrongly three times this batch: `getByRole('dialog')` vs the real
  `role="alertdialog"`; a `columnheader` name matching two headers under strict mode; a detail route
  navigated with a non-GUID id (`400 malformed-id` → error view, no page content). **Hand executors
  the seeded fixtures, the real `data-testid`s, and the exact role names**, or let the stack owner
  write the spec. Do not send a blind author back to write blind again — the captain fixes these.
- **The brief is a defect source.** Three times the captain's own brief was wrong (declaring live code
  dead; a wrong `data-testid`; a self-contradictory ordering instruction). Always require the executor
  to report "anything in this brief that turned out to be wrong" — it caught all three.
