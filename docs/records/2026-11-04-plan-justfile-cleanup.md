# `just dev` and justfile cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** one `just dev [PR | issue | branch]` command that finds or creates the right worktree and runs the whole local stack, plus the justfile cleanup in the spec.

**Architecture:** the AppHost (.NET Aspire) learns to install nothing itself (pnpm handled outside) and to run migrations before the API and worker start. A small TypeScript script `packages/scripts-ts/src/dev.ts` resolves the ref to a worktree, creates it when missing, prepares it, stops the previous stack and runs the AppHost. The review launchers are deleted.

**Tech Stack:** just, .NET 10 + Aspire.Hosting 13.5.3 (`Aspire.Hosting.JavaScript`, `Aspire.Hosting.PostgreSQL`), Node 24 TypeScript scripts run directly by `node` (type stripping), Vitest 4, `gh` CLI, git worktrees.

Spec: `docs/records/2026-11-04-spec-justfile-cleanup.md` (issue #2305).

## Global Constraints

- One app at a time: ports 5454 (Postgres), 5000 (API), 5050 (front). No per-worktree ports.
- AppHost database: `Host=localhost;Port=5454;Database=publyapp_db;Username=postgres;Password=password` — the local-dev literal already documented in `apps/apphost/Program.cs` and `.env.example`. Never print any other connection string or `.env` value.
- Worktrees live under `<main clone>/.worktrees/`. Never delete a worktree, never `docker … prune`, never kill a process that is not ours.
- Branches older than this change are refused with « Cette branche est trop ancienne : mets-la à jour avec develop » — no compatibility layer.
- User-facing messages of `just dev` are French (the owner reads them); code, comments, commits are English.
- Repo rules (AGENTS.md): no `Array.reduce`, no IIFE, `this.`/`_PascalCase` in C#, no new bespoke guard; `just ci-drift` stays green.
- Incompatible shared database (spec decision « lance `just db-reset` »): the `migrate` resource of Task 1 fails visibly in the Aspire output and the API/worker never start. Planner's call: no extra detection code in `dev.ts`; Task 1 adds the hint to the migrate resource comment and Task 5 documents « si la migration échoue au démarrage : `just db-reset` ».
- Linux is the target. The `dev` recipe gets a `[windows]` twin that only prints « just dev n'est pas pris en charge sous Windows ».

---

### Task 1: AppHost — pnpm without auto-install, migrations before API and worker

**Files:**
- Modify: `apps/apphost/Program.cs` (the block from `var publyDb = …` to the `AddViteApp` call, ~lines 250–303)
- Modify if it asserts the resource list: `apps/api/Lib/Architecture/AppHostOrchestrationGuard.Spec.cs`

**Interfaces:**
- Produces: the marker string `WithPnpm(install: false)` in `apps/apphost/Program.cs`. Task 3 uses its presence to tell a current branch from an old one.
- Produces: an Aspire resource named `migrate` that the `api` and `worker` resources `WaitForCompletion` on.

- [ ] **Step 1: Read the guard spec** — open `AppHostOrchestrationGuard.Spec.cs` and note every claim it makes about resources (`--dump-model` output). Adding a `migrate` resource must keep those claims true. If a claim lists resources exhaustively, plan to add `migrate` to it in Step 4.

- [ ] **Step 2: Make the two env helpers generic** so the executable resource can reuse them. Replace both helper functions with:

```csharp
		static IResourceBuilder<T> WithPostgresConnectionString<T>(
			IResourceBuilder<T> resource,
			IResourceBuilder<PostgresDatabaseResource> database
		)
			where T : IResourceWithEnvironment {
			return resource.WithEnvironment(context => {
				context.EnvironmentVariables["POSTGRES_CONNECTION_STRING"] =
					database.Resource.ConnectionStringExpression;
			});
		}

		static IResourceBuilder<T> WithDevelopmentEnvironment<T>(IResourceBuilder<T> resource)
			where T : IResourceWithEnvironment {
			return resource
				.WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development")
				.WithEnvironment("DOTNET_ENVIRONMENT", "Development");
		}
```

Keep the existing #1585 comment above them.

- [ ] **Step 3: Add the migrate resource and wire the waits.** Replace the `var api = …` statement, the worker statement and the `AddViteApp` statement with:

```csharp
		// Migrations run BEFORE the api and the worker: on an empty database both crash at
		// boot (the master-key canary reads data_protection_keys) and Aspire never restarts
		// them (#2305). The AppHost build already compiled the API project, hence --no-build;
		// `just dev` runs `dotnet tool restore` first so dotnet-ef is available.
		var migrate = WithPostgresConnectionString(
				WithDevelopmentEnvironment(
					builder.AddExecutable(
						"migrate",
						"dotnet",
						"../api",
						"tool",
						"run",
						"dotnet-ef",
						"database",
						"update",
						"--no-build"
					).WithEnvironment("APP_ROLE", "api")
				),
				publyDb
			)
			.WaitFor(publyDb);

		var api = WithPostgresConnectionString(
				WithDevelopmentEnvironment(builder.AddProject<Projects.PublyApp_Api>("api").WithEnvironment("APP_ROLE", "api")),
				publyDb
			)
			.WaitFor(publyDb)
			.WaitForCompletion(migrate);

		// Same binary, APP_ROLE=worker: job engine only, no HTTP server (design §3.2).
		// launchProfileName: null — the worker has no HTTP endpoints, so it must not bind
		// the API's port 5000 (DCP proxy fails with "address already in use" otherwise).
		WithPostgresConnectionString(
				WithDevelopmentEnvironment(builder.AddProject<Projects.PublyApp_Api>("worker", launchProfileName: null).WithEnvironment("APP_ROLE", "worker")),
				publyDb
			)
			.WaitFor(publyDb)
			.WaitForCompletion(migrate);

		// The shipped frontend in dev mode (TanStack Start = Vite). pnpm, never npm: npm
		// cannot resolve the monorepo's `workspace:*` dependencies (#2305). install: false —
		// `just dev` installs the workspace with `pnpm install --frozen-lockfile` itself.
		// Injecting both base URLs means a fresh clone without .env.development still points
		// at the orchestrated API (vite.config.ts uses ??= so explicit env wins).
		builder.AddViteApp("front", "../front", "dev")
			.WithPnpm(install: false)
			.WithEnvironment("PUBLIC_API_BASE_URL", api.GetEndpoint("http"))
			.WithEnvironment("SERVER_API_BASE_URL", api.GetEndpoint("http"));
```

- [ ] **Step 4: Update the guard spec** only if Step 1 found an exhaustive resource claim: add `migrate` to it, nothing else.

- [ ] **Step 5: Build and run the guard spec**

Run: `just build-api && cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~AppHostOrchestrationGuard"`
Expected: build 0 errors; guard spec PASS.
Then: `dotnet build apps/apphost --property:OpenApiGenerateDocuments=false` → 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/apphost/Program.cs apps/api/Lib/Architecture/AppHostOrchestrationGuard.Spec.cs
git commit -m "fix(apphost): run migrations before api/worker and start the front with pnpm"
```

---

### Task 2: `db-*` recipes target the AppHost database and restore tools

**Files:**
- Modify: `justfile` (top variables block near `api_dir := "apps/api"`, and the `db-migrate`, `db-reset`, `db-add`, `db-remove` recipes)

**Interfaces:**
- Produces: justfile variable `apphost_db` and private recipe `_require-db`.

- [ ] **Step 1: Add the variable** after `api_dir := "apps/api"`:

```just
# The AppHost database (single source of truth, #2305). Local-dev literal password, the
# same constant as apps/apphost/Program.cs and .env.example — not a secret.
apphost_db := "Host=localhost;Port=5454;Database=publyapp_db;Username=postgres;Password=password"
```

- [ ] **Step 2: Add the guard recipe** just above `db-migrate`:

```just
# Fails fast when the AppHost Postgres is not running.
[private]
_require-db:
  @node -e "require('node:net').connect(5454,'127.0.0.1').on('connect',function(){this.end();process.exit(0)}).on('error',()=>{console.error(\"La base locale ne tourne pas : lance d'abord just dev.\");process.exit(1)})"
```

- [ ] **Step 3: Rewrite the four db recipes** so each exports the AppHost connection string (a recipe parameter with `$` is exported and overrides a stale `.env.development`, verified on 2026-11-04) and restores tools. `db-migrate` becomes:

```just
# Run EF Core migrations against the AppHost database
db-migrate $APP_ROLE="api" $POSTGRES_CONNECTION_STRING=apphost_db: _require-db
  dotnet tool restore
  cd {{api_dir}} && dotnet build -property:OpenApiGenerateDocuments=false
  cd {{api_dir}} && dotnet tool run dotnet-ef database update --no-build
```

Apply the same three changes (extra `$POSTGRES_CONNECTION_STRING=apphost_db` parameter, `_require-db` dependency, `dotnet tool restore` first line) to `db-reset`. For `db-add` and `db-remove` add only `dotnet tool restore` as first line and the `$POSTGRES_CONNECTION_STRING=apphost_db` parameter (they do not need a running database: no `_require-db`). Keep each recipe's existing body lines unchanged otherwise.

- [ ] **Step 4: Verify**

Run (Aspire stopped): `just db-migrate` → exit 1 with « La base locale ne tourne pas : lance d'abord just dev. »
Run: `just --dry-run db-migrate` → shows `dotnet tool restore` first.

- [ ] **Step 5: Commit**

```bash
git add justfile
git commit -m "fix(just): db recipes target the AppHost database and restore dotnet tools"
```

---

### Task 3: `packages/scripts-ts/src/dev.ts` — resolve, create, prepare, stop, start

**Files:**
- Create: `packages/scripts-ts/src/dev.ts`
- Create: `packages/scripts-ts/src/dev.test.ts`
- Modify: `package.json` (root) — replace the three `test:review-*` scripts with `"test:dev": "pnpm --filter scripts-ts exec vitest run src/dev.test.ts"`

**Interfaces:**
- Consumes: marker `WithPnpm(install: false)` from Task 1.
- Produces (exported, pure, tested): `parseRef(ref: string): { kind: 'none' } | { kind: 'number'; number: number } | { kind: 'branch'; branch: string }`, `worktreeDirName(branch: string): string`, `issueBranchName(number: number, title: string, labels: string[]): string`, `isCurrentAppHost(programSource: string): boolean`.

- [ ] **Step 1: Write the failing tests** `packages/scripts-ts/src/dev.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { isCurrentAppHost, issueBranchName, parseRef, worktreeDirName } from './dev.ts';

describe('parseRef', () => {
	it('returns none without a ref', () => {
		expect(parseRef('')).toEqual({ kind: 'none' });
	});
	it('reads a number, with or without #', () => {
		expect(parseRef('2297')).toEqual({ kind: 'number', number: 2297 });
		expect(parseRef('#2297')).toEqual({ kind: 'number', number: 2297 });
	});
	it('treats anything else as a branch', () => {
		expect(parseRef('feat/2172-renditions-api')).toEqual({
			kind: 'branch',
			branch: 'feat/2172-renditions-api',
		});
	});
});

describe('worktreeDirName', () => {
	it('keeps the part after the type prefix', () => {
		expect(worktreeDirName('feat/2172-renditions-api')).toBe('2172-renditions-api');
	});
	it('flattens deeper slashes and keeps plain names', () => {
		expect(worktreeDirName('chore/deps/fixes')).toBe('deps-fixes');
		expect(worktreeDirName('develop')).toBe('develop');
	});
});

describe('issueBranchName', () => {
	it('builds feat/<n>-<slug> from the title', () => {
		expect(issueBranchName(2305, 'Une seule commande just dev et ménage du justfile', [])).toBe(
			'feat/2305-une-seule-commande-just-dev-et-menage-du-justfile',
		);
	});
	it('uses fix/ when the issue carries the bug label', () => {
		expect(issueBranchName(12, 'Login crash!', ['bug'])).toBe('fix/12-login-crash');
	});
	it('caps the slug at 50 characters without a trailing dash', () => {
		const name = issueBranchName(1, 'a '.repeat(60), []);
		expect(name.length).toBeLessThanOrEqual('feat/1-'.length + 50);
		expect(name.endsWith('-')).toBe(false);
	});
});

describe('isCurrentAppHost', () => {
	it('accepts an AppHost that starts the front with pnpm without auto-install', () => {
		expect(isCurrentAppHost('builder.AddViteApp("front", "../front", "dev")\n.WithPnpm(install: false)')).toBe(true);
	});
	it('refuses an older AppHost', () => {
		expect(isCurrentAppHost('builder.AddViteApp("front", "../front", "dev")')).toBe(false);
	});
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:dev`
Expected: FAIL — `Cannot find module './dev.ts'` (or missing exports).

- [ ] **Step 3: Write `packages/scripts-ts/src/dev.ts`**

```ts
#!/usr/bin/env node
// `just dev [PR | issue | branch]` (#2305): find or create the matching worktree, prepare
// it, stop the stack already running, then run the Aspire AppHost from that worktree.
// One app at a time (ports 5454/5000/5050). Messages are French: the owner reads them.

import { execFileSync, spawn } from 'node:child_process';
import { constants, copyFileSync, existsSync, readFileSync, readlinkSync, readdirSync } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const PORTS = [5454, 5000, 5050];
const ENV_FILE = '.env.development';
// ponytail: marker check, not a version check — any branch created from #2305 has it.
const CURRENT_APPHOST_MARKER = 'WithPnpm(install: false)';

export const parseRef = (ref) => {
	const value = (ref ?? '').trim();
	if (value === '') {
		return { kind: 'none' };
	}
	const number = /^#?(\d+)$/.exec(value);
	return number ? { kind: 'number', number: Number(number[1]) } : { kind: 'branch', branch: value };
};

export const worktreeDirName = (branch) => {
	const parts = branch.split('/');
	return (parts.length > 1 ? parts.slice(1) : parts).join('-');
};

export const issueBranchName = (number, title, labels) => {
	const slug = title
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+/, '')
		.slice(0, 50)
		.replace(/-+$/, '');
	return `${labels.includes('bug') ? 'fix' : 'feat'}/${String(number)}-${slug}`;
};

export const isCurrentAppHost = (programSource) => programSource.includes(CURRENT_APPHOST_MARKER);

const say = (message) => {
	process.stdout.write(`▶ ${message}\n`);
};

const fail = (message) => {
	process.stderr.write(`✖ ${message}\n`);
	process.exit(1);
};

const run = (command, args, cwd) =>
	execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const tryRun = (command, args, cwd) => {
	try {
		return run(command, args, cwd);
	} catch {
		return null;
	}
};

const mainClone = () =>
	path.dirname(path.resolve(run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'])));

const worktreeByBranch = (clone) => {
	const byBranch = new Map();
	let current = null;
	for (const line of run('git', ['worktree', 'list', '--porcelain'], clone).split('\n')) {
		if (line.startsWith('worktree ')) {
			current = line.slice('worktree '.length);
		} else if (line.startsWith('branch refs/heads/') && current) {
			byBranch.set(line.slice('branch refs/heads/'.length), current);
		}
	}
	return byBranch;
};

const ghJson = (args, clone) => {
	const out = tryRun('gh', args, clone);
	return out === null ? null : JSON.parse(out);
};

// Issue → existing branch, in the spec's order: open PR closing it, branch linked on
// GitHub, local branch named */<n>-*. Several hits → refuse with the list.
const existingIssueBranch = (number, clone) => {
	const prs = ghJson(['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'headRefName,closingIssuesReferences'], clone) ?? [];
	const fromPrs = prs
		.filter((pr) => pr.closingIssuesReferences.some((issue) => issue.number === number))
		.map((pr) => pr.headRefName);
	const linked = (tryRun('gh', ['issue', 'develop', '--list', String(number)], clone) ?? '')
		.split('\n')
		.map((line) => line.split('\t')[0].trim())
		.filter(Boolean);
	const local = (tryRun('git', ['branch', '--format=%(refname:short)', '--list', `*/${String(number)}-*`], clone) ?? '')
		.split('\n')
		.filter(Boolean);
	const hits = [...new Set([...fromPrs, ...linked, ...local])];
	if (hits.length > 1) {
		fail(`Plusieurs branches correspondent à l'issue #${String(number)} : ${hits.join(', ')}. Relance avec le nom de la branche.`);
	}
	return hits[0] ?? null;
};

// Returns { branch, base } — base is set only when the branch must be created.
const resolveBranch = (ref, clone) => {
	if (ref.kind === 'branch') {
		return { branch: ref.branch, base: null };
	}
	const pr = ghJson(['pr', 'view', String(ref.number), '--json', 'headRefName'], clone);
	if (pr) {
		return { branch: pr.headRefName, base: null };
	}
	const issue = ghJson(['issue', 'view', String(ref.number), '--json', 'title,labels'], clone);
	if (!issue) {
		fail(`#${String(ref.number)} n'est ni une PR ni une issue de ce dépôt.`);
	}
	const existing = existingIssueBranch(ref.number, clone);
	if (existing) {
		return { branch: existing, base: null };
	}
	const labels = issue.labels.map((label) => label.name);
	return { branch: issueBranchName(ref.number, issue.title, labels), base: 'origin/develop' };
};

const ensureWorktree = (ref, clone) => {
	if (ref.kind === 'none') {
		return run('git', ['rev-parse', '--show-toplevel']);
	}
	const { branch, base } = resolveBranch(ref, clone);
	const existing = worktreeByBranch(clone).get(branch);
	if (existing) {
		return existing;
	}
	const target = path.join(clone, '.worktrees', worktreeDirName(branch));
	if (existsSync(target)) {
		fail(`Le dossier ${target} existe déjà pour une autre branche.`);
	}
	say(`Création du worktree ${target} (branche ${branch})…`);
	tryRun('git', ['fetch', 'origin', base ? 'develop' : branch], clone);
	const hasLocal = tryRun('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], clone) !== null;
	const hasRemote = tryRun('git', ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`], clone) !== null;
	if (base) {
		run('git', ['worktree', 'add', '-b', branch, target, base], clone);
	} else if (hasLocal || hasRemote) {
		run('git', ['worktree', 'add', target, branch], clone);
	} else {
		fail(`La branche ${branch} n'existe ni en local ni sur origin.`);
	}
	return target;
};

const prepare = (worktree, clone) => {
	const env = path.join(worktree, ENV_FILE);
	const source = path.join(clone, ENV_FILE);
	if (!existsSync(env) && existsSync(source)) {
		say(`Copie de ${ENV_FILE}…`);
		copyFileSync(source, env, constants.COPYFILE_EXCL);
	}
	say('Restauration des outils .NET…');
	execFileSync('dotnet', ['tool', 'restore'], { cwd: worktree, stdio: 'inherit' });
	if (!existsSync(path.join(worktree, 'node_modules'))) {
		say('Installation des dépendances (quelques minutes la première fois)…');
		execFileSync('pnpm', ['install', '--frozen-lockfile'], { cwd: worktree, stdio: 'inherit' });
	}
};

const portBusy = (port) =>
	new Promise((resolve) => {
		const socket = connect(port, '127.0.0.1');
		socket.on('connect', () => {
			socket.end();
			resolve(true);
		});
		socket.on('error', () => resolve(false));
	});

const busyPorts = async () => {
	const states = await Promise.all(PORTS.map((port) => portBusy(port)));
	return PORTS.filter((_, index) => states[index]);
};

// Our stack = an AppHost process whose cwd is the main clone or one of its worktrees.
const ourAppHostPids = (clone) =>
	readdirSync('/proc')
		.filter((entry) => /^\d+$/.test(entry) && Number(entry) !== process.pid)
		.filter((pid) => {
			try {
				const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
				const cwd = readlinkSync(`/proc/${pid}/cwd`);
				return cmdline.includes('PublyApp.AppHost') && cwd.startsWith(clone);
			} catch {
				return false;
			}
		})
		.map(Number);

const stopPrevious = async (clone) => {
	const pids = ourAppHostPids(clone);
	if (pids.length > 0) {
		say("Arrêt de l'appli déjà lancée…");
		for (const pid of pids) {
			process.kill(pid, 'SIGINT');
		}
	}
	for (let attempt = 0; attempt < 30; attempt += 1) {
		if ((await busyPorts()).length === 0) {
			return;
		}
		await sleep(2000);
	}
	const still = await busyPorts();
	const holders = tryRun('ss', ['-ltnp']) ?? '';
	const lines = holders.split('\n').filter((line) => still.some((port) => line.includes(`:${String(port)} `)));
	fail(`Ports encore occupés (${still.join(', ')}) par autre chose que notre appli. Libère-les puis relance :\n${lines.join('\n')}`);
};

const main = async () => {
	const ref = parseRef(process.argv.slice(2).join(' '));
	const clone = mainClone();
	const worktree = ensureWorktree(ref, clone);
	const program = path.join(worktree, 'apps', 'apphost', 'Program.cs');
	if (!existsSync(program) || !isCurrentAppHost(readFileSync(program, 'utf8'))) {
		fail('Cette branche est trop ancienne : mets-la à jour avec develop.');
	}
	prepare(worktree, clone);
	await stopPrevious(clone);
	say(`Lancement depuis ${worktree} — API http://localhost:5000, interface http://localhost:5050`);
	const child = spawn('dotnet', ['run', '--project', 'apps/apphost', '--property:OpenApiGenerateDocuments=false'], {
		cwd: worktree,
		stdio: 'inherit',
	});
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => child.kill(signal));
	}
	child.on('exit', (code) => process.exit(code ?? 0));
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await main();
}
```

Note for the implementer: if `pnpm --filter front typecheck` or the scripts-ts tsconfig rejects untyped parameters in this file, add JSDoc or TS parameter types; do NOT add `@ts-expect-error` lines (the review launchers' `rung-0` pattern goes away with them).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:dev`
Expected: PASS (4 describe blocks, 10 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scripts-ts/src/dev.ts packages/scripts-ts/src/dev.test.ts package.json
git commit -m "feat(scripts): just dev resolves, creates and launches the right worktree"
```

---

### Task 4: justfile — add `dev`, simplify lint/format, delete dead recipes and the review launchers

**Files:**
- Modify: `justfile`
- Delete: `packages/scripts-ts/src/review-api.ts`, `review-api.test.ts`, `review-api.migration-guard.integration.test.ts`, `review-front.ts`, `review-launcher.ts`, `review-launcher.test.ts`, `_review-launcher.fixture.ts`, `review-worktree.resolve.ts`, `review-worktree.resolve.test.ts` (all in `packages/scripts-ts/src/`)
- Modify: `knip.ts` (the entry commented `review-front.ts launches the dev server through`, ~line 224)

**Interfaces:**
- Consumes: `packages/scripts-ts/src/dev.ts` (Task 3), `test:dev` script (Task 3).

- [ ] **Step 1: Add the `dev` recipe** where `dev-api` starts (top of the dev section):

```just
# Run the whole local stack (Aspire) for a PR, an issue, a branch, or the current folder:
#   just dev            just dev 2297            just dev feat/2172-renditions-api
[unix]
[positional-arguments]
dev *args:
  node packages/scripts-ts/src/dev.ts "$@"

[windows]
dev *args:
  Write-Error "just dev n'est pas pris en charge sous Windows."; exit 1
```

- [ ] **Step 2: Replace lint/format/check** — delete the six recipes `lint`, `lint-write`, `format`, `format-write`, `check`, `check-write` and add:

```just
# Lint and fix what can be fixed (oxlint)
lint:
  pnpm lint:fix

# Format files (oxfmt)
format:
  pnpm format:write
```

- [ ] **Step 3: Delete the dead recipes** (both `[unix]` and `[windows]` variants where they exist): `dev-db`, `dev-services`, `dev-setup`, `quick-start`, `review-api`, `review-front`, `dev-api-alt`, `run-api`, `dev-api-migrated`, `update-client`, `client-info`, `env-check`, `publish-api`, `clean-api`, `test-api-debug`, `update-deps`, `ci-review-worktree-resolution`. Remove `ci-review-worktree-resolution` from the dependency list of the `ci:` recipe. Delete the comment blocks that only describe a deleted recipe.

- [ ] **Step 4: Delete the review launcher files** listed above, then remove the `knip.ts` entry that names `review-front.ts`. If `apps/api/run-dev.mjs` is referenced only by the deleted `dev-api-alt`, delete it too (`git grep -n run-dev.mjs` must return nothing else).

- [ ] **Step 5: Verify nothing still points at deleted names**

Run: `git grep -nE "review-(api|front|launcher|worktree)|dev-db|dev-services|dev-setup|quick-start|check-write|lint-write|format-write|dev-api-migrated|ci-review-worktree-resolution|test:review" -- ':!docs/records'`
Expected: only hits in files Task 5 rewrites (AGENTS.md, docs/guides/*, .env.example). Zero hits in `justfile`, `package.json`, `knip.ts`, `.github/`, `packages/`.

Run: `just --list` → contains `dev`, `lint`, `format`; none of the deleted names.
Run: `just ci-drift && just knip && pnpm test:dev` → all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A justfile knip.ts packages/scripts-ts/src apps/api
git commit -m "chore(just): one dev command, lint/format fix by default, drop dead recipes and review launchers"
```

---

### Task 5: Docs follow the new commands

**Files:**
- Modify: `AGENTS.md` (sections « Starting Development Servers », « Code Quality », the `just review-front` mention line ~33)
- Modify: every `docs/guides/**` file returned by the Task 4 Step 5 grep
- Modify: `.env.example` comments that mention removed recipes, if any

- [ ] **Step 1: Rewrite AGENTS.md « Starting Development Servers »** to:

````markdown
### Starting Development Servers

```bash
# The whole local stack (Aspire AppHost: Postgres 5454, migrations, API 5000, worker,
# front 5050) for the current folder, or for a PR / issue / branch from anywhere in the repo.
# A missing worktree is created under .worktrees/ (issue without a branch → feat|fix/<n>-<slug>).
just dev
just dev 2297
just dev feat/2172-renditions-api

# Single pieces, when you only need one:
#   just dev-api             # API with hot reload (5000) — needs the AppHost database running
#   just dev-front           # frontend only (5050)
```

One app at a time: `just dev` stops the stack already running before starting the new one.
Branches created before #2305 are refused — update them with develop first.
````

Replace the line naming `just review-front <pr-or-issue-number>` with `just dev <pr-or-issue-number>`. In « Code Quality » replace `just check-write` with `just lint && just format` and describe both as fixing by default. Remove the `just dev-api-migrated` / `just db-migrate first` paragraph about #885 and replace it with: « `just dev` applies pending migrations before the API and the worker start; `just db-migrate` targets the AppHost database and needs `just dev` running. »

- [ ] **Step 2: Same replacements in each guide** found by the grep (same wording; delete sections that only explain the review launchers).

- [ ] **Step 3: Verify**

Run: the Task 4 Step 5 grep again → zero hits outside `docs/records`.
Run: `just ci-doc-links` → PASS.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/guides .env.example
git commit -m "docs: just dev replaces the launch recipes and review launchers"
```

---

### Task 6: Acceptance run (orchestrator, not the implementer)

Run each spec acceptance criterion and record the proof (command + output tail) in the PR description:

- [ ] 1. From the main clone: create a throwaway branch from this branch, open nothing, run `just dev <that-branch>` with no worktree → worktree created, deps installed, `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/health` = 200, front `http://127.0.0.1:5050/` = 200, `POST /auth/login` as `staff-admin@example.com` = 200. Remove that throwaway worktree afterwards with Radan's OK.
- [ ] 2. Run it again → no reinstall line printed, stack up.
- [ ] 3. While it runs, `just dev chore/2305-just-dev` → previous stack stopped, new one up.
- [ ] 4. Empty volume: stop the stack, `docker volume ls | grep publyapp` → note the AppHost data volume; with Radan's OK only, remove that one volume, `just dev` → healthy with no manual step.
- [ ] 5. With Aspire running and a worktree whose `.env.development` says `Database=publyapp`: `just db-migrate` → « No migrations were applied » against `publyapp_db` (check with `docker exec <postgres container> psql -U postgres -d publyapp_db -c '\dt' | head`).
- [ ] 6. `just lint`, `just format` fix files; `just --list` has none of the deleted recipes.
- [ ] 7. `just ci-drift`, `just knip`, `pnpm test:dev`, `pnpm --filter front typecheck` green.
- [ ] 8. `just dev 2297` (a PR older than this change) → « Cette branche est trop ancienne : mets-la à jour avec develop. »
