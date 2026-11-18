# Quality gate, palier 1 (#2438)

The rule (zones, function cap, no zone may rise, PR size, review severity) is the AGENTS.md section
[Code quality — palier 1](../../AGENTS.md#code-quality--palier-1-hard-owner-decision-2026-11-18); this guide describes the gate.
It is an **owner-mandated exception** to the [Bespoke guard admission](test-conventions.md#bespoke-guard-admission-hard-rule)
rule (owner decision 2026-11-18); a breach is a **blocking QUALITY finding**.

## How it works

`CI guard battery` > `Check quality ratchet` (quality lane of `ci-final-gate`, 15 min timeout) runs
[`check-quality-ratchet.ts`](../../packages/scripts-ts/src/check-quality-ratchet.ts), reading every threshold from
[`quality-baseline.json`](../../packages/scripts-ts/src/quality-baseline.json). Both files are CODEOWNED.

- **Function cap:** a function is judged when a touched line sits in its own body (a nested function is judged alone). Pure
  renames touch nothing. A justified waiver goes in `exceptions` (`path`, `name`, `reason`).
- **Ratchet:** zone complexity and duplicated lines per 1000 SLOC <= baseline + `tolerancePer1k`.
- **Baseline never rises:** the PR's baseline file is compared with the one on the base branch; any raised value, new
  exception or changed label fails, unless the owner sets the `quality-baseline-exception` label.
- **PR size:** added + deleted lines (renames followed) excluding tests, generated files, migrations, lockfiles, snapshots;
  `pull_request` only. The owner sets `size-exception`, then edit the PR description (or push) so the label is re-read.
- **Fail closed:** an empty scan, no clone data, an unparsed or unmeasured file, or a zone without files fails the gate.
- **Precedence:** tooling, then test zones, then api/front. Files outside the zones (`apps/mobile`, `apps/front/deploy`) are not judged.

## Measurement

`@coderot-ai/cli` 1.5.0, `analyze --since-commit HEAD` (~5 s, local, nothing sent; never `coderot ci`, which uploads). It is the
tool behind the weekly figures. Licence Elastic-2.0 allows internal CI use; C# needs the .NET runtime (in the `guards` job).

## Locally and tightening

```bash
git commit ...             # it measures commits, not the working tree
pnpm check:quality         # or: just ci-quality-ratchet (also runs the unit tests)
```

Base = `git merge-base HEAD origin/develop` (override: `QUALITY_BASE=<sha>`). To tighten a palier, a dedicated PR lowers zone
values (edit `quality-baseline.json` by hand from the figures `pnpm check:quality` prints on the base branch) or `functionCap` / `prSizeMaxLines` / `tolerancePer1k`.
Retire the gate if an off-the-shelf tool enforces the same three rules with the same numbers.
