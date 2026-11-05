# Spec — justfile cleanup: one `just dev` command (2026-11-04)

Issue: #2305.

## Intent and why

Radan (owner) runs the app locally to try a branch, one at a time. Today that means
`cd` into the right worktree, knowing which of ~10 launch recipes to use, and in which
order — and several of them are broken (tested 2026-11-04, see "Findings"). He wants:

> « Une commande … je lui donne un numéro d'issue, de PR ou bien de branche et elle lance
> automatiquement le projet depuis le dossier qui correspond. » — no `cd`, ever.

Since the AppHost (.NET Aspire, #255/#1564) already orchestrates Postgres + API + worker +
front, the separate `review-api` / `review-front` launchers (#1020, ~6,100 lines incl. tests)
and `dev-db` / `dev-services` / `dev-setup` / `quick-start` are redundant.

## Goals

1. **`just dev [ref]`** — the only launch command.
   - No `ref`: launch the worktree/clone the command is run from.
   - `ref` = PR number, issue number, or branch name → find the matching worktree under
     `.worktrees/` and launch from there, wherever the command is typed (any clone/worktree
     of the repo).
   - Worktree missing → **create it automatically** (owner chose the recommendation):
     - PR → `git worktree add .worktrees/<slug> <headRefName>` (fetch first).
     - Branch → same with that branch (fetch; error if it exists nowhere).
     - Issue → use the branch already linked to the issue if any; otherwise create
       `<type>/<issue>-<slug-of-title>` from `origin/develop` (type = `feat` by default,
       `fix` when the issue carries a bug label). *(My call — repo naming observed:
       `feat/2172-renditions-api`, `fix/1498-session-revocation`.)*
     - Unknown number/branch → stop with a clear message; never guess.
     - Print each step in plain words (« Création du worktree pour la PR #2297… »,
       « Installation des dépendances… ») so a long first run never looks stuck.
   - One app at a time (owner: « je lance seulement un service à la fois »): if an
     AppHost / API / front of ANY worktree already holds 5000/5050/5454, stop it first,
     then start. Never kill something that is not ours (match by process cwd under the
     repo's clone/worktrees).
   - Prepares the worktree idempotently before starting: `.env.development` copied from
     the main clone if missing (copy only, never printed), `dotnet tool restore`,
     `pnpm install --frozen-lockfile` when `node_modules` is missing.
   - Starts the Aspire AppHost, applies migrations to the AppHost database, and ends with
     API healthy on :5000 and front answering on :5050. Prints the URLs.

2. **Fix the bugs found while testing** (all reproduced 2026-11-04):
   - F1 front never starts under Aspire: `AddViteApp` runs `npm install` →
     `EUNSUPPORTEDPROTOCOL workspace:*`. Use pnpm (`.WithPnpm()` or equivalent in
     Aspire.Hosting.JavaScript 13.5) and skip the install step when deps are present.
   - F2 fresh database: API and worker crash at boot (master-key canary reads
     `data_protection_keys` before migrations) and Aspire never restarts them. Migrations
     must run before the API/worker start (e.g. a migrate resource the API/worker
     `WaitForCompletion` on, or `just dev` migrating between Postgres-ready and API start).
     Builder decides the mechanism; outcome: `just dev` on an empty volume ends healthy
     with no manual step.
   - F3 two databases: personal `.env.development` files may say `Database=publyapp` while
     AppHost/`.env.example` use `publyapp_db`, so `db-migrate` migrated the wrong DB.
     `db-*` recipes must target the same database the AppHost uses (single source of
     truth), whatever a stale `.env.development` says.
   - F4 `db-migrate` in a fresh worktree fails until `dotnet tool restore` — the db-*
     recipes run it themselves (cheap, idempotent).

3. **Lint/format** (owner decision): keep only `just lint` and `just format`, both
   **fixing by default** (today's `lint-write` / `format-write` behaviour). Delete
   `check`, `check-write`, `lint-write`, `format-write`. Verify-only runs stay in CI
   (`ci-lint`, `ci-format`); the pre-commit hook formats anyway.

4. **Delete dead / duplicate recipes** (zero references outside the justfile, checked
   with `git grep`): `dev-db`, `dev-services`, `dev-setup`, `quick-start`, `review-api`,
   `review-front`, `dev-api-alt`, `run-api`, `dev-api-migrated`, `update-client`,
   `client-info`, `env-check`, `publish-api`, `clean-api`, `test-api-debug`,
   `update-deps`. Delete the review launcher sources/tests and
   `ci-review-worktree-resolution` with them, keeping only what `just dev` reuses (the
   PR/issue → branch/worktree resolution in `review-worktree.resolve.ts` may be reused or
   rewritten smaller — builder's call; less code wins).

5. **Docs** follow: AGENTS.md (Development Commands, Code Quality), `docs/guides/*`
   mentioning removed recipes, `.env.example` comments. `just help` (= `just --list`)
   stays.

## Non-goals

- Running two branches side by side (owner: not needed now). No per-worktree ports/hosts.
- Touching the 25 `ci-*` recipes or `packages/scripts-ts/src/ci-gate-manifest.json`
  beyond what deleting `ci-review-worktree-resolution` strictly requires (and only if a
  manifest entry names it — today none of the `ci.yml` steps call the deleted recipes).
- Changing `dev-api`, `dev-front`, `build-*`, `test-*`, `generate-*`, `db-add/remove/reset`
  semantics (except F3/F4).
- Windows support beyond not breaking the existing `[windows]` variants that remain.

## Anti-goals (failure even if it "works")

- A `just dev` that needs the user to know an order of steps, or to `cd`.
- Silent fallbacks: wrong database, random port, a guessed branch.
- Killing a process that does not belong to this repo; deleting a worktree; `docker prune`.
- Printing any secret (connection strings, `.env` values).
- Adding a dependency, or a bigger launcher than the one it replaces.

## Constraints

- Repo rules in AGENTS.md: front guards via `run-guarded.mts` for any new `check:/test:`
  script, no `reduce`/IIFE, logger rules, guard-admission hard rule (no new bespoke guard).
- `just ci-drift` must stay green.
- Linux is the owner's platform; keep a working `[windows]` recipe or a clear
  "not supported on Windows" error.

## Acceptance (the builder proves each one)

1. From the main clone: `just dev <open PR number>` with its worktree absent → worktree
   created, deps installed, API `/health` 200, front 200, `staff-admin@example.com` logs in.
2. Same with the worktree present → starts without reinstalling.
3. `just dev` again with another ref while one runs → previous stack stopped, new one up.
4. `just dev` on an empty Postgres volume → healthy with no manual step (F2).
5. `just db-migrate` from a fresh worktree with a stale `Database=publyapp` env → migrates
   the AppHost database (F3, F4).
6. `just lint`, `just format` fix files; removed recipes are gone from `just --list`.
7. `just ci-drift`, `just ci-front` (or its relevant parts) and the scripts-ts tests green.

## Decisions after the builder check (orchestrator's calls unless marked)

- **Postgres lifetime / `db-*`** *(my call)*: Postgres exists only while the AppHost runs.
  `just dev` migrates by itself. `db-*` recipes detect "no AppHost database reachable"
  and stop with « Lance d'abord `just dev` ». No Postgres-only recipe.
- **Issue → existing branch** *(my call)*: look on GitHub, in order: (1) open PRs whose
  body/closing references name the issue (`Closes #N`, GitHub `closingIssuesReferences`),
  (2) branches linked to the issue (`gh issue develop --list N`), (3) local branches whose
  name contains `/<N>-`. Exactly one hit → use it. Several → interactive choice (or a clear
  error listing them when not a TTY). None → create `<type>/<N>-<slug>`.
- **Bug label** *(my call)*: the repo label is `bug` → `fix/`; anything else → `feat/`.
- **One database per worktree** *(OWNER, 05/11: « une base de données par dossier »)*:
  Aspire names the Postgres data volume after the AppHost path, so each worktree already has
  its own volume (finding of 04/11: seven volumes). Kept on purpose: a branch's migrations never
  touch another branch's data. `just dev` migrates its own database on first start. Only one
  stack runs at a time (port 5454). When the database of THIS worktree refuses the branch's
  migrations (the branch was switched or rebased), `just dev` explains it, then suggests
  `just db-reset`, rather than resetting silently.
- **Leftover stack after a crash** *(my call)*: `just dev` detects 5454/5000/5050 held by
  something it cannot identify as ours and stops with the exact command to free it
  (container name / PID shown). No automatic kill of unidentified processes.
- **Branches older than this change** *(OWNER, 04/11: « aucune raison de faire de la
  plomberie pour pouvoir les lancer »)*: no compatibility layer. `just dev` detects a target
  branch that lacks this change (e.g. its AppHost has no pnpm/migrate fix) and stops with
  « Cette branche est trop ancienne : mets-la à jour avec develop ». Acceptance #1 is
  therefore proven on a branch created from this change (or rebased on it).

## Left to the builder

Where the `just dev` logic lives (a small TS script in `packages/scripts-ts` vs. recipes),
how migrations are ordered in Aspire, how to detect "our" running stack, slug rules.
