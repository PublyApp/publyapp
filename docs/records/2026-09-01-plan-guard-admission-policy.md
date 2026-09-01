# Guard Admission Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop bespoke guard proliferation by forbidding new repository-specific executable guards
unless a reviewer can prove that every narrow admission criterion is met.

**Architecture:** `docs/guides/test-conventions.md` is the detailed source of truth because it
already owns the instructions for adding executable guards. `AGENTS.md` carries only the hard
always-applicable summary and links to that guide. Enforcement stays human and review-based; this
change adds no script, analyzer, manifest, reference snapshot, allowlist, or meta-guard.

**Tech Stack:** Markdown documentation, repository review policy, existing document-link gate.

---

## Design decisions

- A "bespoke guard" is a repository-specific executable policy check: a source scanner, reference
  snapshot, ratchet, manifest verifier, architecture scan, meta-guard, or custom compiler/linter
  extension. Ordinary product tests and built-in compiler or linter rules are not bespoke guards.
- Admission is denied by default. An exception requires all six conditions: demonstrated failure,
  critical invariant, no simpler standard mechanism, small implementation without secondary
  machinery, red/green proof, and an explicit retirement condition.
- Style preferences, hypothetical risks, and isolated low-impact mistakes are review concerns, not
  reasons to add executable policy.
- A guard gap introduced by a PR is fixed or removed in that PR. It does not create a follow-up
  issue. A separate issue is justified only by a pre-existing, independently reproducible defect
  with material product, security, data, contract, build, or release impact.
- Reviewers enforce this policy directly. Automating admission would create the kind of
  guard-of-a-guard this policy is intended to prevent.

## File structure

**Modify**

- `AGENTS.md` — add the short blocking rule and link to the detailed criteria.
- `docs/guides/test-conventions.md` — replace unconditional guard-creation instructions with an
  admission decision followed by mechanics for an approved exception.

No production code, CI workflow, package script, reference data, or generated artifact changes.

### Task 1: Add the hard repository rule

- [x] **Step 1:** Add a concise "Bespoke guard admission" rule under Test Conventions in
  `AGENTS.md`: forbidden by default, all criteria are mandatory, and no meta-enforcement.
- [x] **Step 2:** Link the rule to the detailed section in
  `docs/guides/test-conventions.md` without duplicating the full procedure.
- [x] **Step 3:** Run `git diff --check`; expect no output and exit code 0.

### Task 2: Make the existing guard instructions conditional

- [x] **Step 1:** Rewrite `### Adding a new guard` in `docs/guides/test-conventions.md` as
  `### Bespoke guard admission (hard rule)` and define the scope exclusions.
- [x] **Step 2:** List all six mandatory admission criteria and the same-PR issue rule.
- [x] **Step 3:** Preserve the useful implementation requirements under an "If and only if
  admitted" subsection, but replace the old baseline/allowlist advice with a same-PR cleanup
  requirement.
- [x] **Step 4:** State that reviewers reject non-admitted guards and that no automated
  meta-guard enforces this policy.
- [x] **Step 5:** Run `just ci-doc-links`; expect 14 link tests, 9 audit tests, and final `[OK]`.
- [x] **Step 6:** Run `git diff --check`; expect no output and exit code 0.

## Self-review

1. **Spec coverage:** The six approved conditions, default prohibition, human review enforcement,
   no meta-guard, and issue-growth rule each map to a named edit above.
2. **Placeholder scan:** The plan contains no TBD, TODO, deferred implementation, or unspecified
   test command.
3. **Consistency:** Both files use "bespoke guard" for the same scope; the detailed guide remains
   the single procedural source of truth.
