# Agent Prompt: Execute the Round 9 Review Remediation Plan

Read and execute
`@docs/implementation-plans/2026-03-09-round9-review-remediation-execution-plan.md`.

This is an implementation task, not a review or summary task.

Assume the task is incomplete unless you can prove every single checklist item
in the plan is resolved and verified.

## Mandatory Tooling / Git Constraints

- Use the appropriate and necessary agent skills/tools for the task.
- Do not `git add`, `git stage`, `git commit`, or rewrite git history.

## Requirements

- Follow the plan exactly, in order.
- Treat the plan as a binding checklist.
- Address **every** item in the plan.
- Do not skip “minor” or “cleanup” items.
- Do not stop at code changes; also update tests, docs, and generated artifacts
  if the plan requires them.
- Apply the body-getter caching rule from the plan:
  - if a body getter is used 2+ times, cache it in a local
  - if a getter returns normalized/parsing-sensitive values (`PatchField<T>`,
    trimmed strings, parsed timestamps, parsed enums), cache it before guards,
    parser calls, args creation, and audit payloads
- Do not assume anything if a real decision is needed; ask me directly.
- Follow all repo guides and `AGENTS.md` scrupulously.

## Execution Protocol

1. Read the entire plan file.
2. Extract the plan into an explicit execution checklist grouped by workstream.
3. Implement the workstreams in the exact order defined by the plan.
4. Run all required verification commands from the plan.
5. Re-check the original round-9 review findings against your completed
   changes.
6. Only then report completion.

## Required Response Format

- `Execution checklist`
- `Implementation progress`
- `Resolved findings`
- `Files changed`
- `Verification commands run`
- `Remaining blockers or questions`

## Important

- You are **not done** unless every plan item is addressed and verified.
- If a plan item appears already fixed, verify it and explicitly say why.
- If API-visible contracts change, regenerate the required artifacts and re-run
  verification.
- Before declaring completion, compare your work against the plan’s
  `Done Criteria` section and confirm each item is satisfied.
