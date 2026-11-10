# PublyApp Orchestration Adapter

Fielded adapter for `/home/radan/ai-orchestration-playbook/PLAYBOOK.md`.

## Required Fields

| Field | Value |
|---|---|
| `default_branch` | `develop` |
| `setup_cmd` | `eval "$(fnm env)" && fnm use 24`; `corepack pnpm --version`; `pnpm install --frozen-lockfile`; `dotnet restore PublyApp.slnx` |
| `build_cmd` | Canonical: `just build-api`, `pnpm --filter front build` (the shipped app has no justfile build wrapper; `apps/old-front` was deleted 2026-08-22 (archive `docs/archive/old-front`)). On hosts without `just`, run the recipe bodies from `justfile` directly. |
| `test_cmd` | API: `dotnet test apps/api/Tests/PublyApp.Api.Tests.csproj -c Test`; shared TS: `pnpm --filter @org/shared-ts test`; front e2e: `docker compose -f apps/front/docker-compose.test.yml up -d --build`, then `pnpm --filter front exec playwright test`, then `docker compose -f apps/front/docker-compose.test.yml down -v`. |
| `lint_cmd` | Canonical: `just lint && just format` (both fix by default). For front work: `pnpm --filter front typecheck`; run formatting/lint recipe bodies directly if `just` is unavailable. |
| `acceptance_cmd` | Local exit gate: `pnpm --filter @org/shared-ts test`; `pnpm --filter front typecheck`; run the local e2e harness with `docker compose -f apps/front/docker-compose.test.yml up -d --build`, `pnpm --filter front exec playwright test`, and `docker compose -f apps/front/docker-compose.test.yml down -v`. After API contract changes, also run `just build-api && just generate-client` or the equivalent recipe bodies. |
| `client_regen_cmd` | `just generate-client` for API contract changes; never edit `packages/client-ts/` manually. |
| `worktree_root` | **All task worktrees live under `<repo>/.worktrees/pr<NUMBER>`** (i.e. `/home/radan/Projects/PublyApp/publyapp/.worktrees/pr994`) — NEVER as siblings of the clone (`/home/radan/Projects/PublyApp/<name>`). **Name a worktree after the pull request it produces, never after the issue**: one issue routinely carries several competing implementations, and issue-named directories collide the moment it does, while the PR number is unique by construction and is what a reviewer actually searches for. The PR number does not exist until the branch is pushed, so create under a provisional slug, push and open the PR immediately, then `git worktree move <provisional> .worktrees/pr<NUMBER>`. **Never string-build a worktree path from this convention** — after a move, the git metadata directory keeps the original internal name (`.git/worktrees/<provisional>` still backs `.worktrees/pr994`), so resolve the live path from `git worktree list --porcelain` instead. `.worktrees/` is gitignored and covered by `.vscode/settings.json` `files.watcherExclude`/`search.exclude`; sibling worktrees are not, so each (with its own `node_modules`) is watched by the VS Code remote fileWatcher and shows as top-level clutter on the Windows/Samba mount — this spiked host RAM to ~12 GB (4.4 GB fileWatcher) on 2026-07-11. Create with `git worktree add -b <branch> .worktrees/<provisional> origin/develop`, then rename once the PR number exists; tear down promptly after the PR merges with `git worktree remove <path>` (preserves the branch; refuses on dirty/untracked without `--force`, so zero-data-loss). Isolated worktree per task, outside repo-local `node_modules`. (Historical note: the old M1 driver used sibling `ft2-<TASK_ID>` dirs — that convention is superseded by this `.worktrees/` rule.) |
| `host_parallelism` | Host: 64 GB / 12-core (12th-gen i5). Don't cap agent headcount (not ~2); many lightweight agents run in parallel. Serialize only heavy-resource jobs: one Docker/compose e2e stack at a time, no concurrent full `dotnet`/API/e2e runs. |
| `executor` | **Updated 2026-11-10 (Radan).** Implementation and fix passes: Claude subagents (Agent tool, `model: sonnet`; `model: haiku` for mechanical one-file work), briefed through a file, leaving changes uncommitted. Review passes: **DeepSeek** through `dsh-go` — `dsh-go --profile headless --patch ~/.dsh/patches/go-deepseek-v4.1-flash.yml - < <prompt-file>` run under `nice`/`ionice` with `timeout`, from the worktree, writing a verdict file. Brief from stdin, never a shell string. |
| `model_ladder` | **Updated 2026-11-10 (Radan), replaces every earlier ladder.** Implementers/fixers = Claude Sonnet (Haiku for mechanical one-file work). Reviewers = DeepSeek `deepseek-v4.1-flash` via `dsh-go` (« je préfère qu'on ait DeepSeek pour les relectures »), always a fresh session that did not write the code; the cross-family rule was dropped by Radan on 2026-11-07. Other OpenCode Go models only as a small occasional extra (the Go subscription is spared until its ~2026-11-29 renewal). Effort ≤ high; higher only with a ledgered reason. Source of truth for the whole machine: `~/ai-orchestration-playbook/PLAYBOOK.md` §1 and `~/.claude/CLAUDE.md`. The previous ladder (codex/opencode/cline-pass lanes, 2026-08-01) is in git history and no longer applies. |
| `push_guard` | Active hook path should resolve to the versioned hooks dir (`core.hooksPath=.husky`); `.husky/pre-push` blocks direct pushes to protected branches. Hooks are auto-wired by the root `prepare` script (packages/scripts-ts/src/install-git-hooks.ts) and shared by every worktree of the clone — a worktree whose `core.hooksPath` points at `.husky/_` (the old husky-generated, untracked dir) has NO hooks and is broken, not blessed (issue #1852). Feature-branch policy is brief-driven plus CI. Never push or commit directly to `develop`. |
| `verification_floor` | Every implementation/fix packet's verification block MUST include `npx oxlint <changed files>` with **0 errors**. Vitest + typecheck + `check:design-system` are all green over defects that oxlint catches (e.g. `react(jsx-key)` is an error, not a warning). Executors omit lint unless the brief names it. |
| `known_quirks` | **A stray `vite dev` watcher rewrites `apps/front/src/routeTree.gen.ts` from its own stale in-memory route config.** If a dev server was started before a `routes.ts` entry existed, it strips that route from the generated tree on every write — including immediately after `git checkout --`. Symptoms: a route that `routes.ts` declares never appears in `routeTree.gen.ts`, `tsc` reports `TS2820 … Did you mean` for a route you just added, and the file reverts under you. **Before diagnosing any route-registration or generated-file problem, run `pgrep -af vite` and kill strays.** `routeTree.gen.ts` is generated and tracked; regenerate with `vite build`, never hand-edit. Playwright `toHaveCSS` compares the **computed** style, never the authored one. Chrome resolves `fr` grid tracks to used pixels (`grid-template-columns: 1fr 1fr` → `"471.5px 471.5px"`), and Tailwind opacity modifiers (`bg-background/97`, `bg-destructive/10`) compute to `oklab(...)`. Assert computed values — equality/ratio for grid tracks, literal-rgba custom properties for colors — never the source string. `check:design-system` is a **regex scanner, not a type checker**: it greps for hex/rgba literals and only within `appliesTo` roots. A `--publy-*` token that is *referenced but never declared* renders transparent and passes clean — verify declarations (`grep -- '--publy-x:'`), not just usages. Tabler ships as `@tabler/icons-react` **components**; there is no webfont, so `<i className="ti ti-check" />` mounts and renders nothing while every test passes. A Playwright glob's `*` compiles to `([^/]*)` and cannot cross `/`; only `**` becomes `(.*)`. A `page.route()` glob ending in a single `*` matches the collection endpoint but never its sub-paths, so the handler is dead code and the request escapes to the **real API while the spec still passes** — a mock that fails to intercept does not fail the test. This defeated three specs across two packets *after* it was written into the trap list, so it is now a gate rule (`no-single-star-route-glob`, `check:design-system`, which also scans `e2e/`). Suppression requires `// design-system-ignore: <rule-id> — <reason>`; a bare marker does not suppress. **Lesson: recurrence is evidence to revisit the control, not automatic permission to add one. A new executable control still needs bespoke-guard admission; otherwise fix the root cause or strengthen an ordinary test.** (Historical, retired opencode lane: `run --dir <worktree>` rejected paths outside the worktree.) Implementation packets must be single-screen sized with captain-distilled design context; never point an executor at the raw 546KB design canvas (`PublyApp front-2.dc.html`) or at SPEC.md wholesale — it has killed an executor's context window. This was first learned on the retired `gpt-5.3-codex-spark` and `gpt-5.6-luna` lanes and applies to every implementer. The captain greps the canvas and hands down the extracted values. TanStack route filenames contain `$` (`$userId.tsx`): executors must single-quote such paths in every shell command or write via patch tools — unquoted `$userId` shell-expands to an empty string and silently writes broken filenames like `.tsx`. `just` may be unavailable on this host; run recipe bodies directly. Use `fnm use 24` per shell. Reviews run `dsh-go` from the PR's worktree (see `executor`), with the diff written to a file and the brief fed on stdin, never as a shell string; run long passes backgrounded and watch for their done marker. (The old codex rule « review from the main repo cwd » is retired.) Verify LLM API-shape blockers against installed package types plus runtime smoke before fixing. HeroUI v3.2.1 `Button variant="primary"` is correct. TanStack Start `server.ts` uses single-arg `createStartHandler(defaultStreamHandler)`. PG18 Docker data mounts must target `/var/lib/postgresql`, not `/var/lib/postgresql/data`. |
| `additive_merge_files` | `.oxlintrc.json`, `.editorconfig`, `AGENTS.md`, `packages/lint-ts/src/index.js`, `docs/guides/lint-rules.md`. Conflicts outside this list are STOP-and-report. |
| `dump_dir` | `.dump/` for run artifacts, briefs, review output, squash bodies, and handoffs. |
| `issue_hierarchy` | Front-2 Phase 1 epic: `#700`. M1 tracking issue: `#707`; M1 PR must include plain-text `Closes #707`. Every PR needs a linked issue and `closingIssuesReferences` verification. Never merge without explicit per-PR confirmation from Radan. |

## PR closure fields (playbook §2.6 — mandatory)

| Field | Value |
|---|---|
| `closure_config` | `/home/radan/Projects/PublyApp/publyapp/.ai/project-closure-v1.json` |
| `closure_gate` | `/home/radan/ai-orchestration-playbook/tools/pr-closure` (shared dependency; PublyApp does not reimplement the state machine) |
| `review_schema` | `1`; schema file: `/home/radan/ai-orchestration-playbook/tools/schemas/review-record-v1.json` |
| `ci_status_cmd` | `gh pr view <pr-number> --repo PublyApp/publyapp --json headRefOid,statusCheckRollup,baseRefName,headRefName,potentialMergeCommit,body,state,isDraft,mergeable,mergeStateStatus,url` |
| `ci_rerun_cmd` | `gh run rerun <run-id> --failed --repo PublyApp/publyapp` (only for a proven infrastructure failure; bounded by `closure_config.infra_retry_budget`) |
| `local_review_ready_commands` | `closure_config.local_review_ready_commands` (all commands must pass at the exact pushed tip) |
| `closure_acceptance_commands` | `closure_config.closure_acceptance_commands` (run one heavy command at a time) |
| `closure_state_dir` | `closure_config.closure_state_dir` (`/home/radan/.hermes/orchestration/closure`, durable and outside temporary session paths) |
| `ci_required_checks` | `closure_config.ci_required_checks` (the exact required contexts; unknown, missing, or red is not approval) |
| `review_publication_cmd` | `gh pr comment <pr-number> --repo PublyApp/publyapp --body-file <compact-review-summary.md>` |
| `follow_up_issue_cmd` | `gh issue create --repo PublyApp/publyapp --title <title> --body-file <body-containing-Follow-up-to-#pr-number.md>` then verify with `gh issue view <issue-number> --repo PublyApp/publyapp --json number,state,url,body` |
| `tracking_projection` | `closure_config.tracking_projection` = `trello:publyapp` (the PublyApp board is selected by this explicit mapping, never by the active Trello board) |
| `projection_adapter` | `/home/radan/Projects/PublyApp/publyapp/.ai/trello-publyapp-projection` (regular executable, never a symlink; accepts `PUBLYAPP_TRELLO_CARD_MAP` and environment-supplied `TRELLO_API_KEY`/`TRELLO_TOKEN`) |
| `infra_retry_budget` | `closure_config.infra_retry_budget` = `1` |
| `stagnation_budget_minutes` | `closure_config.stagnation_budget_minutes` = `240` |
| `lane_liveness_cmd` | `test -n "$LANE_PID" && ps -o pid=,etime=,time=,stat=,cmd= -p "$LANE_PID"` (qualifying progress requires advancing CPU time or independently observed output growth) |
| `lane_output_floor` | `200` bytes minimum and a valid review_schema `1`; empty, marker-only, or malformed output is failure |
| `heavy_job_limit` | `closure_config.heavy_job_limit` = `1` (serialize full builds, API suites, and e2e) |
| `central_claim_rules` | Never defer a branch-caused CI failure, unmet issue acceptance requirement, API-contract/client drift, auth/tenant isolation/security/privacy/data-integrity uncertainty, a guard that cannot detect its intended defect, a dirty/unpushed/re-tipped worktree, a reviewed-tip mismatch, or a repeated root cause. |

The shared gate is the only authority for closure state and transition checks. A PR is not
approved from a Trello card, a chat summary, or an unbound review. Every state-changing action
must first pass `check-transition` against the same pushed commit; projection failure never
changes authoritative evidence. The projection adapter verifies the delivery-card sections
`Objective`, `Current state`, `Scope`, `Links`, and `How to test` before it can plan or apply a
list move, and it has no operation that can create approval evidence.

## Candidate-tip/live-PR closure contract

The shared `pr-closure` schema and reader validate candidate-tip/live-PR provenance. The local
closure config requires exactly `ci-final-gate` in both `ci_required_checks` and
`ci_live_pr_checks`; `pull_request` reads the config and required checks from the candidate tip,
while `merge_group` and `push` use the event tip. Live PR evidence is bound to
`.github/workflows/ci.yml` with action `pull_request`.

PR-B is complete: the eight predecessor workflows are retired, central CI owns the retained
coverage, and the existing ruleset remains unchanged with its single `ci-final-gate` check. The
historical all-branch push trigger for docs-archive was intentionally retired; work branches are
validated on pull requests and `develop` is validated on push. Do not broaden `ci.yml` triggers or
reintroduce a predecessor workflow.

## M1 Run Binding

- Integration branch: `feat/front-2-phase-1-m1`.
- Task sequence: M1.1 solo, then M1.2 and M1.4 in parallel, then M1.3 solo.
- Per-task status file: `.dump/exec/<TASK_ID>/STATUS` with `APPROVED`, `MAXR`, or `FAILED-EMPTY`.
- After each task reaches `APPROVED`, merge its task branch into `feat/front-2-phase-1-m1` before starting dependent work.
- Final gate: global review after all four tasks, loop until `VERDICT: APPROVED`, then PR to `develop`. (Historical: this run was bound to a GPT-5.5 `xhigh` reviewer. GPT-5.5 is retired from the ladder — see `model_ladder` — so a re-run would take its reviewer from the current ladder.)

## Hard Stops

- Missing or dirty source checkpoint before dispatch.
- Unknown required preflight ledger field.
- Any implementation or review route outside `model_ladder` without an owner instruction.
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

**Every UI PR carries annotated screenshots** (red frames, arrows and numbered circles on what changed,
French UI, every scenario, light and dark when relevant), posted as a PR comment from the
`pr-screenshots` branch. Launch the capture packet the moment the PR opens, and say « captures en
cours » in the PR body. Never ask for a merge on a UI PR without them. Rule detail:
[`docs/guides/front/ui-pr-evidence.md`](../docs/guides/front/ui-pr-evidence.md).

**A redesign screen is measured against its prototype before the code review** (owner rule,
2026-11-08: « fidélisée à … 97 % … j'exige de la rigourosité »). Side-by-side captures (app left,
prototype right) plus a measured fidelity score per screen ≥ 97 %, with zero gap on the key blocks.
No code review is dispatched, and no merge is requested, on a redesign screen without that score.
Method: [`docs/guides/front/ui-pr-evidence.md`](../docs/guides/front/ui-pr-evidence.md). Four code
reviews once approved a dashboard (#2339) that the owner found « complètement à côté de la plaque »:
code reviews do not look at the screen.

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
- When an executable guard has passed the hard admission policy in
  [`../docs/guides/test-conventions.md`](../docs/guides/test-conventions.md#bespoke-guard-admission-hard-rule),
  **prove it fails**: plant the defect it targets and watch it fire. A guard without a demonstrated
  failure is decoration. Require the failing transcript in the packet report, not a passing fixture
  suite.
- A recurring defect becomes an executable control only if it satisfies every admission criterion.
  Otherwise fix the root cause or strengthen an ordinary behavioural test; repetition alone does not
  justify another guard.
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
