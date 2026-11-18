# Quality gate, palier 1 (#2438)

A required CI step (`CI guard battery` > `Check quality ratchet`) and a local command enforce three rules.
The rule itself, for agents, is in [AGENTS.md](../../AGENTS.md) section "Quality palier 1"; the follow-up issues are
[#2439](https://github.com/PublyApp/publyapp/issues/2439) (front), [#2440](https://github.com/PublyApp/publyapp/issues/2440)
(tooling) and [#2441](https://github.com/PublyApp/publyapp/issues/2441) (tests).

1. **Function cap.** A function new or modified by the PR (a touched line sits in its own body, not in a nested function)
   must have cognitive complexity <= `functionCap` (15). C# and TypeScript, product, tooling and tests. Untouched functions are not judged.
   An exception is a justified entry in `exceptions` of the baseline (`path`, `name`, `reason`).
2. **Ratchet per zone.** For each zone, complexity and duplicated lines per 1000 SLOC on the PR head must be
   <= the committed baseline + `tolerancePer1k` (0.5: absorbs 0.1 rounding and clone-detection noise).
   Zones: `api`, `front` (`apps/front/src`, `packages/shared-ts`), `tests-api` (`*.Spec.cs`), `tests-front` (`*.test.*`, `*.spec.*`, e2e),
   `tooling` (scripts-ts, lint-ts, lint-cs, scripts-cs, `apps/front/scripts|tools`).
3. **PR size.** More than `prSizeMaxLines` (600) added+deleted lines, excluding tests, generated files, migrations, lockfiles and
   snapshots, fails. Only the owner may allow it, with the `size-exception` label (never add it yourself). Checked on `pull_request` only.

Generated files, migrations and vendored code are out of scope everywhere.

## Measurement

`@coderot-ai/cli` 1.5.0 (devDependency of `scripts-ts`) run as `coderot analyze --since-commit HEAD`: it reads git history,
writes a local report and sends nothing (never use `coderot ci`: it uploads). It is the tool behind the weekly figures, so the gate and
the curves agree. Licence Elastic-2.0 allows internal use in our own CI; it forbids offering the tool as a hosted service and
removing its notices, neither of which we do. C# analysis needs the .NET runtime (already in the `guards` job). Zones are classified
by `check-quality-ratchet.ts`, since coderot does not flag `*.Spec.cs` as tests.

## Locally

```bash
git commit ...                 # the tool measures commits, not the working tree
pnpm check:quality             # or: just ci-quality-ratchet (also runs the unit tests)
pnpm check:quality --write     # lowers baseline values this branch improved (never raises)
```

The base is `git merge-base HEAD origin/develop` (override with `QUALITY_BASE=<sha>`).

## Tightening a palier

All numbers live in [`packages/scripts-ts/src/quality-baseline.json`](../../packages/scripts-ts/src/quality-baseline.json):
- A PR that improves a zone runs `pnpm check:quality --write` and commits the lowered baseline.
- Moving to the next palier: edit `functionCap`, `prSizeMaxLines` or `tolerancePer1k`, or lower the zone values by hand, in a dedicated PR.
  Values are never raised without a documented owner exception in that PR.
