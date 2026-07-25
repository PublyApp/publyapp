# Docs

This is the filing index for `docs/`. It answers two questions: **which documents are normative**
(you must follow them), and **where does a new document go**.

> A restructure of this tree is planned as a later wave of the documentation remediation. This index
> describes the tree **as it exists today** — it does not describe target directories, and you should
> not create new top-level directories to match a future plan.

## What is normative

Normative means: an agent or contributor is expected to follow it, and it is kept true. Everything
else in `docs/` is a **record** — accurate as of its date, not a standing instruction.

| Normative | What it governs |
| --- | --- |
| [`AGENTS.md`](../AGENTS.md) (repo root) | The behavioural contract. Architecture and conventions for the whole repo. Wins over anything in `docs/`. |
| [`docs/guides/`](guides) | The guides `AGENTS.md` links to. These are the long-form version of its rules. |
| [`docs/guides/front-2/`](guides/front-2) | The frontend. `apps/front-2` is the only frontend under development and the only one deployed. |
| [`docs/deployment/`](deployment) | Live production operations — deployment design, migration gating, and the first-deploy runbook. Production has run on these since 2026-07-20. |

Two cautions about `docs/guides/`:

- Some guides predate the front-2 migration. Where a guide mixes still-valid backend/API/UX policy
  with code examples from the retired `apps/front` (MUI) app, it now carries a header saying which
  half is which. Follow the policy; ignore the MUI mechanics.
- `AGENTS.md` links only `docs/guides/` and `docs/deployment/` files. A guide nothing links to is a
  record, not a rule.

## Where a new document goes

One rule per directory. Pick the **first** row that matches; if two seem to fit, the earlier row
wins.

| Directory | Put a document here when… |
| --- | --- |
| `guides/` | It is a standing rule or how-to that should still be true in six months, and `AGENTS.md` will link to it. Guides are maintained; if you add one, you own keeping it true. |
| `guides/front-2/` | Same, but specific to `apps/front-2` styling/architecture. |
| `deployment/` | It is operational: how the production stack is shaped, how a release is gated, how an operator deploys or recovers. |
| `implementation-plans/` | It is a step-by-step plan for one specific change, written before the work, and it will be obsolete once merged. |
| `plans/` | It is higher-level than an implementation plan — issue planning, sequencing, a design sketch for work not yet broken down. Date-prefix the filename (`YYYY-MM-DD-topic.md`). |
| `roadmaps/` | It spans many issues/phases over time (one subdirectory per roadmap). |
| `refactoring-guides/` | It is a repeatable refactor playbook or checklist, not a one-off plan. |
| `analysis/` | It weighs options and reaches a recommendation, before anyone commits to an approach. |
| `audits/` | It systematically checks the codebase against a rule and reports the gaps. |
| `reviews/` | It is the output of reviewing work that exists — a code review, a review response, or review follow-ups. Date-prefix. |
| `changes/` | It records what a landed change did, after the fact. |
| `implementation-summaries/` | Same as `changes/`, for larger multi-phase work. Prefer `changes/` for anything small. |
| `spikes/` | It records a time-boxed investigation whose only deliverable is the finding. Date-prefix. |
| `issues/<number>/` | It is scratch working material scoped to one GitHub issue. |
| `front-2-migration/` | It concerns the front→front-2 migration specifically (parity contracts, characterization, staging). |
| `misc/` | Nothing above fits. Treat a `misc/` file as scratch — never link one from `AGENTS.md`. |
| `assets/` | It is an image or other binary a doc embeds. |
| `superpowers/` | **Do not file here by hand.** This is the superpowers workflow's own output tree (`plans/`, `specs/`, `reviews/`) and it is written by that tooling. |
| `front/` | **Closed.** `apps/front` is retired; do not add frontend planning notes here. |

## Rules

- Architecture and convention rules live in `AGENTS.md`, not here. If you find a rule only stated in
  `docs/`, that is a bug — promote it or delete it.
- **Never** add a file at the `docs/` root. Every document belongs in one of the directories above.
- Directory names are kebab-case.
- A record (plan, review, analysis, change note) is written once and then left alone. Do not
  retro-edit it to match later reality — supersede it, and say what superseded it.
- A guide is the opposite: if reality changes, the guide changes with it.
- When you move or retire a document, fix the links pointing at it.
