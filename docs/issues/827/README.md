# #827 — flake reproduction & sustained-load proof records

Point-in-time records (written once) for lane `wt-827`. Scratch originals live
in the gitignored `.dump/wt827/`; these copies are the reviewable evidence.
See the PR body for the narrative; this index maps the files.

## Harness (reproduction of the W6-FLAKE mechanism)

| File | Role |
| --- | --- |
| `heavy.sh` | Bounded CPU-contention generator: one busy-loop worker per core (12), self-terminating, always wrapped in `timeout 300` by callers. |
| `setup-repro.ts` | Registers the repro-only testing-library setup (`asyncUtilTimeout` back to the library default of 1000ms so starvation is measurable instead of hidden behind the shipped 25000ms budget). |
| `vitest.repro-setup.ts` | That setup: keeps the shipped matchMedia polyfill, restores the default findBy* budget. |
| `repro.vitest.config.ts` | Repro-only config: pre-W6 oversubscription (`maxWorkers = 2× cores`), serial file execution, guards pinned after the render fixtures via `sequence.groupOrder`. NOT part of the shipped suite. |
| `repro-827.sh` | Orchestrates burn + the three 101-row render files + both tree-walking guards, bounded by `timeout 300`. |

## Logs

| File | What it shows |
| --- | --- |
| `repro-pre.log` | **RED** (pre-fix @ e0c20c219 = develop base): deterministic failure of the issue's exact signature — profiles 101-row fixture, `Unable to find role="button" and name "Delete selected"` after 3542ms/4019ms; status=1, wall=94.2s. |
| `repro-post.log` | Post-fix harness run: still red at the 1000ms budget, including runs with ZERO guard contention (guards ordered after renders) — ambient full-core starvation alone exceeds the default budget on this host. Recorded honestly; see PR body "Unverified". Includes one earlier infra-failure attempt (harness files outside every `node_modules` ancestor could not bare-resolve imports; fixed by a dump-local symlink into the pnpm store, same package instance). |
| `sustained-targeted.log` | Shipped chain, targeted files, 5 consecutive iterations under the same bounded burn: 5× PASS (walls 34.4/27.8/26.8/26.0/29.6s — stable, no descending drift). Per-iteration orchestrator: `sustained-targeted.sh`. |
| `full-chain-heavy.log` | Full shipped chain under burn, run 1: ALL suites pass (main lane 222 files / 2380 tests; design-guards 55); sole failure was `check:react-compiler MISSING_DIST` because this fresh worktree had no production build yet — an artifact-proof step, not a test. |
| `full-chain-heavy-run2.log` | Full shipped chain under burn, run 2 (after `pnpm --filter front build`): **CHAIN_STATUS=0**, wall 442.1s — 2380 + 55 tests, design-system scan 616 files / 0 violations, React Compiler 96 compiled modules ≥ floor 72. |

## Journal

`timings.md` — chronological measurement journal: idle baselines, the dead
lane's earlier attempts (rejected `projects` split with evidence), the harness
incident, both loaded full-chain runs, and the verdict.
