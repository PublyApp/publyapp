# React Doctor -- HARD Rule

> **Status: HARD / AUTHORITATIVE.** Binding on all contributors (human and AI). A pull request may not
> leave any React Doctor finding in a file it changes. Deviations require an explicit,
> reviewer-approved justification in the PR (see [Suppressing a finding](#suppressing-a-finding-legitimately)).
> Enforced automatically by the `React Doctor` CI check.

[React Doctor](https://www.react.doctor) is a static analyzer for React health -- security,
correctness, performance, accessibility, and architecture. A one-off "score bump" every few months does
not keep a codebase healthy: the debt simply grows back between sweeps. This rule shifts the work
**left**, onto each change, so health is maintained continuously instead of being periodically rescued.

---

## The rule, in one line

**Before you open a PR, run React Doctor on your changes and fix every finding in the files you touched --
all findings in a touched file, not just the ones on lines you edited. A PR that leaves any finding in a
file it changes does not pass -- the CI gate fails and review blocks it.**

You are responsible for every file **you** touch, including pre-existing debt already in it: touching a
file means leaving it clean. Files you did not change are out of scope -- the gate is scoped to your
changed files, not the whole repo.

---

## What the gate checks

The `React Doctor` GitHub Actions check runs on every PR to `develop`:

```bash
pnpm dlx react-doctor@0.9.12 --scope files --base origin/<base-branch> --blocking warning
```

Run from `apps/front`.

- **`--scope files`** -- every file your PR changes is evaluated **in full** -- all findings in it, not just
  those on the lines you edited (but not files you didn't touch, and not the whole repo).
- **`--blocking warning`** -- **both** error- and warning-severity findings fail the check. React Doctor's
  default (`--blocking error`) would let warnings through; we do not -- most findings here are warnings.
- Every changed file clean exits `0`; any finding in a changed file exits non-zero and **fails the check**.

The version is **pinned** (`0.9.12`) so the gate is deterministic -- a new React Doctor release cannot
silently start failing open PRs. Bumping it is a deliberate PR (see [Updating React Doctor](#updating-react-doctor)).

---

## How to check your changes locally (do this before pushing)

```bash
# Every file you changed vs the base branch, evaluated in full -- this is exactly what CI runs.
cd apps/front && pnpm dlx react-doctor@0.9.12 --scope files --blocking warning --verbose

# Narrower views: only findings on the exact lines you edited, or only findings your change newly introduced.
cd apps/front && pnpm dlx react-doctor@0.9.12 --scope lines --verbose
cd apps/front && pnpm dlx react-doctor@0.9.12 --scope changed --verbose

# Whole-repo health + the 0-100 score (a whole-repo aggregate that drifts with the code and the pinned tool version).
cd apps/front && pnpm dlx react-doctor@0.9.12 --verbose
cd apps/front && pnpm dlx react-doctor@0.9.12 --score
```

`--verbose` prints the file, line, rule, and a help link per finding.
To understand a specific finding: `cd apps/front && pnpm dlx react-doctor@0.9.12 why <file>:<line>`.

---

## Fixing a finding

1. Read the rule's canonical recipe -- the `help` URL in the report, or
   `https://www.react.doctor/prompts/rules/<plugin>/<rule>.md`.
2. Apply the smallest behavior-preserving fix that follows this repo's conventions (AGENTS.md): French
   user-facing values / English identifiers, arrow-function style, **reuse before build**, and **never**
   weaken audit logging.
3. Re-run the local command above and confirm the finding is gone.
4. Keep correctness first. If the canonical fix would change behavior, breaks a test, or fights another
   HARD rule, do **not** force it -- prefer a different safe fix, or suppress with justification (below).

---

## Suppressing a finding legitimately

Some findings are false positives or a poor fit for this codebase. Suppression is allowed but is
**reviewable** -- a silent suppression to dodge the gate is itself a HARD violation. Narrowest tool first:

- **One occurrence is a genuine FP** -> inline-disable on that line, with a comment saying *why*, and call
  it out in the PR description.
- **A rule consistently mis-fires here** -> recreate `apps/front/doctor.config.json`
  with that one rule disabled (`npx react-doctor@0.9.12 rules disable <rule>`) in a
  dedicated, justified PR -- not bundled into a feature change. The file was deleted
  in #1291 rung 3 when its last global override (`no-multi-component-file`) came
  back on; there is no config file on the default path today.

Never disable a rule, raise `--blocking`, or pin a different version solely to make your own PR pass.

---

## Updating React Doctor

Bumping the pinned version is a deliberate, isolated PR: change the pinned version in
`.github/workflows/react-doctor.yml` **and** in this guide, run a full
`cd apps/front && pnpm dlx react-doctor@<new> --verbose`, and fix (or, with justification, suppress)
anything the new version surfaces in that same PR. This keeps the version bump and its fallout
reviewable together, and keeps the gate deterministic between bumps.

---

## Related

- Frontend coding standards: [`AGENTS.md`](../../AGENTS.md)
- CI gate guide: [`local-ci-gate.md`](./local-ci-gate.md)
- Lint rules: [`lint-rules.md`](./lint-rules.md)
