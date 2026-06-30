# PublyApp Orchestration Adapter

Fielded adapter for `/home/radan/ai-orchestration-playbook/PLAYBOOK.md`.

## Required Fields

| Field | Value |
|---|---|
| `default_branch` | `develop` |
| `setup_cmd` | `eval "$(fnm env)" && fnm use 24`; `corepack pnpm --version`; `pnpm install --frozen-lockfile`; `dotnet restore PublyApp.slnx` |
| `build_cmd` | Canonical: `just build-api`, `just build-front`. On hosts without `just`, run the recipe bodies from `justfile` directly. For front-2-only work, prefer `pnpm --filter front-2 build` when a build gate is needed. |
| `test_cmd` | API: `dotnet test apps/api/Tests/PublyApp.Api.Tests.csproj -c Test`; shared TS: `pnpm --filter @org/shared-ts test`; front-2 e2e: `docker compose -f apps/front-2/docker-compose.test.yml up -d --build`, then `pnpm --filter front-2 exec playwright test`, then `docker compose -f apps/front-2/docker-compose.test.yml down -v`. |
| `lint_cmd` | Canonical: `just check-write`, `just tsc-front`. For M1 front-2 work: `pnpm --filter front-2 typecheck`; run formatting/lint recipe bodies directly if `just` is unavailable. |
| `acceptance_cmd` | M1 local exit gate: `pnpm --filter @org/shared-ts test`; `pnpm --filter front-2 typecheck`; for M1.2-M1.4, run the M0.7 local e2e harness with `docker compose -f apps/front-2/docker-compose.test.yml up -d --build`, `pnpm --filter front-2 exec playwright test`, and `docker compose -f apps/front-2/docker-compose.test.yml down -v`. After API contract changes, also run `just build-api && just generate-client && just tsc-front` or the equivalent recipe bodies. |
| `client_regen_cmd` | `just generate-client` for API contract changes; never edit `packages/client-ts/` manually. |
| `worktree_root` | M1 driver convention: `/home/radan/Projects/PublyApp/ft2-<TASK_ID>` on branch `feat/front-2-phase-1-<TASK_ID>`, created from integration branch `feat/front-2-phase-1-m1`. General convention: isolated worktree per task, outside repo-local `node_modules`. |
| `host_parallelism` | 12-core host. Safe: run Phase B tasks M1.2 and M1.4 in parallel. Avoid multiple heavy Docker, `dotnet`, or full e2e verification jobs at the same time. |
| `executor` | Implementation and fix passes: `codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex-spark -c model_reasoning_effort="medium"`. Review passes: `codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.5 -c model_reasoning_effort="xhigh"`. For M1, use `.dump/exec/driver.sh <TASK_ID>` after writing `.dump/exec/<TASK_ID>/brief.md` and `accept.md`. |
| `model_ladder` | Implementation is GPT/Codex only; do not use Claude models for implementation. Primary implementation/fix model: `gpt-5.3-codex-spark`. Primary reviewer: `gpt-5.5` with `model_reasoning_effort="xhigh"` because epic #700 requires reconciliation by an actual reviewer `VERDICT: APPROVED`. If these are unavailable or quota-limited, stop and ask Radan before changing model family. |
| `push_guard` | Active hook path should be Husky (`core.hooksPath=.husky/_`); `.husky/pre-push` blocks direct pushes to protected branches. Feature-branch policy is brief-driven plus CI. Never push or commit directly to `develop`. |
| `known_quirks` | `just` may be unavailable on this host; run recipe bodies directly. Use `fnm use 24` per shell. Review must be diff-based from the main repo cwd, not `--cd` into a worktree with `node_modules`, because Codex can hang crawling it. Feed prompts via stdin redirect. `codex exec` can exceed foreground wrappers; run long drivers backgrounded and poll `STATUS`. Verify LLM API-shape blockers against installed package types plus runtime smoke before fixing. HeroUI v3.2.1 `Button variant="primary"` is correct. TanStack Start `server.ts` uses single-arg `createStartHandler(defaultStreamHandler)`. PG18 Docker data mounts must target `/var/lib/postgresql`, not `/var/lib/postgresql/data`. |
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
