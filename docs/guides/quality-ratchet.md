# Quality gate, palier 1 (#2438)

The rule (zones, function cap, no zone may rise, PR size, review severity) is the AGENTS.md section
[Code quality — palier 1](../../AGENTS.md#code-quality--palier-1-hard-owner-decision-2026-11-18); this guide only describes
how the gate works. The gate is an **owner-mandated exception** to the
[Bespoke guard admission](test-conventions.md#bespoke-guard-admission-hard-rule) hard rule (owner decision 2026-11-18);
a breach of it is a **blocking QUALITY finding** in review, never downgraded.

## How it works

A required CI step (`CI guard battery` > `Check quality ratchet`, lane `quality-ratchet` of `ci-final-gate`) runs
[`check-quality-ratchet.ts`](../../packages/scripts-ts/src/check-quality-ratchet.ts) with all thresholds read from
[`quality-baseline.json`](../../packages/scripts-ts/src/quality-baseline.json) (`functionCap`, `prSizeMaxLines`,
`sizeExceptionLabel`, `tolerancePer1k`, per-zone baseline, `exceptions`).

- **Function cap:** a function is judged when a touched line sits in its own body; a nested function (an `it` in a huge
  `describe`) is judged alone. A justified waiver goes in `exceptions` (`path`, `name`, `reason`).
- **Ratchet:** each zone's complexity and duplicated lines per 1000 SLOC must be <= baseline + `tolerancePer1k` (0.5: absorbs
  0.1 rounding and clone-detection noise).
- **PR size:** added + deleted lines excluding tests, generated files, migrations, lockfiles and snapshots; `pull_request`
  events only. After the owner sets `size-exception`, edit the PR description (or push) so the check re-reads the label.

## Measurement

`@coderot-ai/cli` 1.5.0 (devDependency of `scripts-ts`), `coderot analyze --since-commit HEAD`: local report, nothing sent
(never `coderot ci`, which uploads). It is the tool behind the weekly figures, so gate and curves agree. Licence Elastic-2.0
allows internal CI use. C# needs the .NET runtime (present in the `guards` job). Zones are classified by the script, since
coderot does not flag `*.Spec.cs` as tests.

## Locally

```bash
git commit ...                 # it measures commits, not the working tree
pnpm check:quality             # or: just ci-quality-ratchet (also runs the unit tests)
pnpm check:quality --write     # lowers baseline values this branch improved (never raises)
```

Base = `git merge-base HEAD origin/develop` (override: `QUALITY_BASE=<sha>`).

## Tightening a palier

A PR that improves a zone commits the lowered baseline (`--write`). The next palier edits `functionCap`, `prSizeMaxLines`,
`tolerancePer1k` or zone values in a dedicated PR. Values are never raised without a documented owner exception.
Retirement: replace the gate if an off-the-shelf tool enforces the same three rules with the same numbers.
