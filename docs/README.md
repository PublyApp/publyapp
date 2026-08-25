# Docs

This is the filing index for `docs/`. It answers two questions: **which documents are normative**
(you must follow them), and **where does a new document go**.

## Layout

`docs/` has exactly four directories:

| Directory | Contents |
| --- | --- |
| [`guides/`](guides) | Standing rules and how-tos, including [`guides/front/`](guides/front) for the frontend. Maintained: when reality changes, the guide changes with it. |
| [`deployment/`](deployment) | Live production operations — deployment design, migration gating, runbooks. Production has run on these since 2026-07-20. |
| [`records/`](records) | Dated, write-once records named `YYYY-MM-DD-<type>-<topic>.md`, where `<type>` is one of `spec`, `plan`, `review`, `audit`, `spike`, `analysis`. Written once, never retro-edited; superseded rather than updated. |
| `assets/` | Images and other binaries a doc embeds. |

## What is normative

Normative means: an agent or contributor is expected to follow it, and it is kept true. Everything
in `records/` is evidence of a past decision — accurate as of its date, not a standing instruction.

| Normative | What it governs |
| --- | --- |
| [`AGENTS.md`](../AGENTS.md) (repo root) | The behavioural contract. Architecture and conventions for the whole repo. Wins over anything in `docs/`. |
| [`DESIGN.md`](../DESIGN.md) (repo root) | The product design language: tokens, the `components/ui/*` layer, interaction conventions, dark mode, i18n/copy rules, and the guards that enforce them. |
| [`docs/guides/`](guides) | The long-form version of `AGENTS.md`'s rules; the guides it links to are normative. |

Two cautions about `docs/guides/`:

- Some guides predate the front migration. Where a guide mixes still-valid backend/API/UX policy
  with code examples from the retired `apps/old-front` (MUI) app, it carries a header saying which
  half is which. Follow the policy; ignore the MUI mechanics.
- `AGENTS.md` also links repository config/source files when a rule needs an implementation anchor.
  A `docs/guides/` file that `AGENTS.md` does not link is a record, not a rule.

A few `docs/records/` files are load-bearing despite being records: `AGENTS.md`, `DESIGN.md`, or a
guide points at them for the reasoning behind a standing rule (for example the publishing/scheduling
design behind AGENTS.md's transparent-failure rule). They stay accurate as history; the rule itself
lives in the guide or root file that cites them.

## Where a new document goes

- **Standing rule or how-to** → `docs/guides/` (frontend-specific: `docs/guides/front/`). Guides are
  maintained; if you add one, you own keeping it true, and `AGENTS.md` should link it.
- **Production operations** → `docs/deployment/`.
- **Everything else** — a spec written before work, an implementation plan, a review, an audit, a
  spike, an analysis, a change note → `docs/records/` as `YYYY-MM-DD-<type>-<topic>.md`.
  The superpowers skills write their specs/plans/reviews here too.
- **Images and binaries** → `assets/`.

Never create a new top-level `docs/` directory; the four above are closed set maintained by guard
and review. Never place a document at the `docs/` root except `README.md` itself.

## Rules

- Architecture and convention rules live in `AGENTS.md`, not here. If you find a rule only stated in
  `docs/`, that is a bug — promote it or delete it.
- Directory names are kebab-case.
- A record is written once and then left alone. Do not retro-edit it to match later reality —
  supersede it with a new record, and say what superseded it in the new record.
- A guide is the opposite: if reality changes, the guide changes with it.
- When you move or retire a document, fix the links pointing at it; records generally are exempt,
  and dead links across `*.md` are caught by the repo-wide link guard.
