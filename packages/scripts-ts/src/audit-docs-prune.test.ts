import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, test } from 'vitest';

// Executes the REAL audit-docs-prune.ts against throwaway git repositories,
// the same way check-doc-links.test.ts executes the link guard: the gate's
// behavior is asserted end-to-end (exit code + named offender), never via a
// restatement of its logic. Each fixture plants the real script with ONLY its
// decision table rewritten to name the fixture's own candidate, then runs
// THAT copy from inside the throwaway repo.
//
// These fixtures pin the round-2 (#1357) property the byte-equality --check
// structurally could not see: a file git actually RENAMES must not be
// classifiable as a deletion just because the generator's decision table
// shares the omission (the paid-modules defect). The rendered inventory is
// cross-checked against `git diff -M`, an independent source of truth.
//
// They also pin the #1425 property: the audited revision is derived from
// COMMITTED HISTORY alone, so the verdict is identical on a pull_request
// event (base lagging behind develop) and on a push event (a single squash
// prune commit already ON the default branch, remote-tracking ref at the
// pushed tip, detached HEAD) — the exact shape that turned develop red.

const scriptPath = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'audit-docs-prune.ts',
);

const roots: string[] = [];

const git = (root: string, ...args: string[]) =>
	execFileSync('git', args, {
		cwd: root,
		stdio: ['ignore', 'ignore', 'pipe'],
	});

// Builds a repo shaped like what the audit consumes: a develop-like base
// carrying one docs candidate plus one survival surface, and a lane HEAD
// reached by exactly the mutation each test describes. `plantBase` shapes
// the BASE commit itself (the tree the audit reads its inputs from).
// `refs/remotes/origin/develop` pins the pre-prune tree, mirroring the real
// repository's lagging PR base; #1425's fix no longer READS that ref, so the
// fixtures stay green with or without it.
const makeRepo = (
	mutate: (root: string) => void,
	plantBase?: (root: string) => void,
): string => {
	const root = mkdtempSync(path.join(tmpdir(), 'audit-docs-prune-'));
	roots.push(root);
	const candidate = 'docs/superpowers/specs/2026-08-25-widget-design.md';
	mkdirSync(path.join(root, path.dirname(candidate)), { recursive: true });
	writeFileSync(path.join(root, 'AGENTS.md'), 'points at nothing yet\n');
	writeFileSync(path.join(root, candidate), '# Widget design\n');
	plantBase?.(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'guard@example.com');
	git(root, 'config', 'user.name', 'guard');
	git(root, 'add', '-A');
	git(root, 'commit', '-qm', 'base');
	git(root, 'update-ref', 'refs/remotes/origin/develop', 'develop');
	git(root, 'checkout', '-qb', 'lane');
	mutate(root);
	git(root, 'add', '-A');
	git(root, 'commit', '-qm', 'mutation');
	return root;
};

// Retargets the real generator's decision table at the fixture's own
// candidate instead of the repository's ten real pruned paths (any real
// entry left behind would trip the non-candidate guard before fidelity
// runs). An empty table makes every candidate default to `delete` — exactly
// the shared-omission shape of the paid-modules defect.
const scriptWithTable = (entries: string): string => {
	const self = readFileSync(scriptPath, 'utf8');
	const rewritten = self.replace(
		/const MOVES: Record<string, Decision> = \{[\s\S]*?\n\};/,
		`const MOVES: Record<string, Decision> = {\n${entries}};`,
	);
	assert.notEqual(
		rewritten,
		self,
		'fixture relies on rewriting the MOVES table',
	);
	return rewritten;
};

// Replays the HISTORICAL revision resolution (#1425's defect, verbatim):
// merge-base(origin/develop, HEAD). Planting this copy proves the new test
// shapes genuinely fail on the old algorithm rather than exercising nothing.
const scriptWithLegacyRev = (): string => {
	const self = readFileSync(scriptPath, 'utf8');
	const rewritten = self.replace(
		/const resolveRev = \(\): string => \{[\s\S]*?\n\};/,
		`const resolveRev = (): string => {\n\tif (explicitRev) {\n\t\treturn explicitRev;\n\t}\n\treturn runGit(['merge-base', 'origin/develop', 'HEAD']).trim();\n};`,
	);
	assert.notEqual(rewritten, self, 'fixture relies on rewriting resolveRev');
	return rewritten;
};

const widgetMoveEntry = (topic: string | null): string =>
	topic === null
		? ''
		: `\t'${WIDGET_SOURCE}': { action: 'move', type: 'spec', topic: '${topic}' },\n`;

const plantGenerator = (root: string, content: string) => {
	mkdirSync(path.join(root, 'packages/scripts-ts/src'), { recursive: true });
	writeFileSync(
		path.join(root, 'packages/scripts-ts/src/audit-docs-prune.ts'),
		content,
	);
};

const plantedRecord = (row: string, counts: string): string =>
	[
		'# Audit — docs/ prune inventory',
		'',
		`Counts: ${counts}`,
		'',
		'## Inventory',
		'',
		'| File | Referenced by (survival surfaces) | Decision |',
		'| --- | --- | --- |',
		row,
		'',
		'(1 rows — end of inventory)',
		'',
	].join('\n');

const DELETE_ROW =
	'| `docs/superpowers/specs/2026-08-25-widget-design.md` | _(nothing)_ | delete |';
const MOVE_TO_WIDGET_ROW =
	'| `docs/superpowers/specs/2026-08-25-widget-design.md` | _(nothing)_ | move → `docs/records/2026-08-25-spec-widget.md` |';

const WIDGET_SOURCE = 'docs/superpowers/specs/2026-08-25-widget-design.md';

// Runs the generator PLANTED inside the fixture repo (never the worktree's
// own copy, whose decision table names real repository paths).
const runAudit = (root: string, ...args: string[]) =>
	execFileSync(
		'node',
		['packages/scripts-ts/src/audit-docs-prune.ts', ...args],
		{
			cwd: root,
			encoding: 'utf8',
		},
	);

const runAuditExpectingFailure = (root: string, ...args: string[]) => {
	try {
		runAudit(root, ...args);
	} catch (error) {
		assert.ok(error instanceof Error);
		const output = 'stdout' in error ? String(error.stdout) : '';
		const stderr = 'stderr' in error ? String(error.stderr) : '';
		return { status: (error as { status?: number }).status, output, stderr };
	}
	assert.fail(`audit-docs-prune ${args.join(' ')} should have failed`);
};

afterAll(() => {
	for (const root of roots) {
		rmSync(root, { recursive: true, force: true });
	}
});

test('a real rename classified as delete fails --check naming the row (paid-modules RED, replayed)', () => {
	const root = makeRepo((repo) => {
		// The prune's mutation done wrong on purpose: move the file in git
		// (byte-identical rename) while the committed record still calls it a
		// deletion — exactly how #1355's paid-modules spec was misrecorded.
		// The planted generator carries an EMPTY table, sharing the omission:
		// the real rename renders as a deletion and regenerates identically.
		plantGenerator(repo, scriptWithTable(widgetMoveEntry(null)));
		mkdirSync(path.join(repo, 'docs/records'), { recursive: true });
		execFileSync(
			'git',
			['mv', WIDGET_SOURCE, 'docs/records/2026-08-25-spec-widget.md'],
			{
				cwd: repo,
				stdio: ['ignore', 'ignore', 'pipe'],
			},
		);
		writeFileSync(
			path.join(repo, 'docs/records/2026-08-25-audit-docs-prune.md'),
			plantedRecord(
				DELETE_ROW,
				'1 candidate file(s) — 0 moved to `docs/records/`, 0 kept in place, 1 deleted.',
			),
		);
	});
	const result = runAuditExpectingFailure(root, '--check');
	assert.equal(result.status, 1);
	assert.match(result.stderr, /disagrees with git diff -M/);
	assert.match(
		result.stderr,
		/docs\/superpowers\/specs\/2026-08-25-widget-design\.md/,
	);
	assert.match(
		result.stderr,
		/git records a rename to docs\/records\/2026-08-25-spec-widget\.md/,
	);
	assert.match(result.stderr, /classifies it as "delete"/);
});

test('--check passes when a single squash prune commit lands on the default branch', () => {
	const root = makeRepo((repo) => {
		// The REAL #1395 shape: the whole lane squashes into ONE default-branch
		// commit that carries the move AND the committed record together.
		plantGenerator(repo, scriptWithTable(widgetMoveEntry('widget')));
		mkdirSync(path.join(repo, 'docs/records'), { recursive: true });
		execFileSync(
			'git',
			['mv', WIDGET_SOURCE, 'docs/records/2026-08-25-spec-widget.md'],
			{
				cwd: repo,
				stdio: ['ignore', 'ignore', 'pipe'],
			},
		);
	});
	// Generate from committed history alone (the just-committed script anchors
	// the pre-prune tree), then fold the record INTO the same squash commit.
	runAudit(root);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '--amend', '-m', 'docs: prune widget spec (#1357)');
	assert.equal(
		execFileSync('git', ['rev-list', '--count', 'develop..HEAD'], {
			cwd: root,
		})
			.toString()
			.trim(),
		'1',
		'fixture must stay a single squash commit on top of develop',
	);
	const checked = runAudit(root, '--check'); // must pass
	assert.match(checked, /matches a fresh regeneration/);
});

test('an inventory claiming a move git does not show fails --check', () => {
	const root = makeRepo((repo) => {
		// Inverse lie: the table maps a "move" but the prune actually deleted
		// the file; the committed record claims the move anyway.
		plantGenerator(repo, scriptWithTable(widgetMoveEntry('widget')));
		mkdirSync(path.join(repo, 'docs/records'), { recursive: true });
		git(repo, 'rm', '-q', WIDGET_SOURCE);
		writeFileSync(
			path.join(repo, 'docs/records/2026-08-25-audit-docs-prune.md'),
			plantedRecord(
				MOVE_TO_WIDGET_ROW,
				'1 candidate file(s) — 1 moved to `docs/records/`, 0 kept in place, 0 deleted.',
			),
		);
	});
	const result = runAuditExpectingFailure(root, '--check');
	assert.equal(result.status, 1);
	assert.match(
		result.stderr,
		/claims a move to docs\/records\/2026-08-25-spec-widget\.md, but git diff -M shows no such rename/,
	);
});

test("a destination mismatch between the mapping and git's rename target fails --check", () => {
	const root = makeRepo((repo) => {
		// Third lie: right classification, wrong destination. git renamed to
		// `-spec-open-core-widget.md`; the mapping names `-spec-widget.md`.
		plantGenerator(repo, scriptWithTable(widgetMoveEntry('widget')));
		mkdirSync(path.join(repo, 'docs/records'), { recursive: true });
		execFileSync(
			'git',
			['mv', WIDGET_SOURCE, 'docs/records/2026-08-25-spec-open-core-widget.md'],
			{ cwd: repo, stdio: ['ignore', 'ignore', 'pipe'] },
		);
		writeFileSync(
			path.join(repo, 'docs/records/2026-08-25-audit-docs-prune.md'),
			plantedRecord(
				MOVE_TO_WIDGET_ROW,
				'1 candidate file(s) — 1 moved to `docs/records/`, 0 kept in place, 0 deleted.',
			),
		);
	});
	const result = runAuditExpectingFailure(root, '--check');
	assert.equal(result.status, 1);
	assert.match(
		result.stderr,
		/names docs\/records\/2026-08-25-spec-widget\.md as the destination, but git renamed it to docs\/records\/2026-08-25-spec-open-core-widget\.md/,
	);
});

// Builds the post-#1395 world: the prune has ALREADY landed on develop
// (candidate renamed into docs/records/, inventory committed from the
// pre-prune merge-base), origin/develop points at that pruned tip, and the
// lane branches FROM the pruned tip — so the default rev the audit resolves
// (merge-base of origin/develop and HEAD) IS the post-prune tree whose docs/
// no longer carries any candidate. `mutateLane` shapes the pull request
// under test and is committed as its sole mutation.
const makePostPruneRepo = (mutateLane: (root: string) => void): string => {
	const root = mkdtempSync(path.join(tmpdir(), 'audit-docs-prune-post-'));
	roots.push(root);
	mkdirSync(path.join(root, path.dirname(WIDGET_SOURCE)), { recursive: true });
	writeFileSync(path.join(root, 'AGENTS.md'), 'points at nothing yet\n');
	writeFileSync(path.join(root, WIDGET_SOURCE), '# Widget design\n');
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'guard@example.com');
	git(root, 'config', 'user.name', 'guard');
	git(root, 'add', '-A');
	git(root, 'commit', '-qm', 'base');
	// Provisional remote pin at the pre-prune base, mirroring makeRepo, so
	// any audit invoked inside `mutateLane` resolves a merge-base.
	git(root, 'update-ref', 'refs/remotes/origin/develop', 'develop');
	// The #1395-shaped prune lands directly on develop, inventory included.
	plantGenerator(root, scriptWithTable(widgetMoveEntry('widget')));
	mkdirSync(path.join(root, 'docs/records'), { recursive: true });
	execFileSync(
		'git',
		['mv', WIDGET_SOURCE, 'docs/records/2026-08-25-spec-widget.md'],
		{ cwd: root, stdio: ['ignore', 'ignore', 'pipe'] },
	);
	mutateLane(root);

	return root;
};

test('a lane cut from the post-prune tip still passes --check (rev walked back to the pre-prune tree)', () => {
	const root = makePostPruneRepo((repoRoot) => {
		// Commit the prune mutations first: the generator's fidelity check
		// reads `git diff -M rev..HEAD`, which only sees committed renames.
		git(repoRoot, 'add', '-A');
		git(repoRoot, 'commit', '-qm', 'prune');
		// Inventory generated from the pre-prune merge-base.
		runAudit(repoRoot);
		git(repoRoot, 'add', '-A');
		git(repoRoot, 'commit', '-qm', 'inventory');
		// origin/develop now points at the ALREADY-pruned tip.
		git(repoRoot, 'update-ref', 'refs/remotes/origin/develop', 'develop');
		// Lane branches from the ALREADY-pruned tip: its merge-base with
		// origin/develop is the pruned tree itself.
		git(repoRoot, 'checkout', '-qb', 'lane');
		// An ordinary unrelated pull-request mutation.
		writeFileSync(path.join(repoRoot, 'AGENTS.md'), 'now points elsewhere\n');
		git(repoRoot, 'add', '-A');
		git(repoRoot, 'commit', '-qm', 'mutation');
	});
	const checked = runAudit(root, '--check'); // must NOT die on non-candidates
	assert.match(checked, /matches a fresh regeneration/);
});

test('walking the rev back does not weaken freshness: a tampered record still fails --check', () => {
	const root = makePostPruneRepo((repoRoot) => {
		git(repoRoot, 'add', '-A');
		git(repoRoot, 'commit', '-qm', 'prune');
		runAudit(repoRoot);
		// Tamper the freshly generated record before committing it: HEAD's
		// copy must disagree with a faithful regeneration while the decision
		// table and git's renames stay consistent.
		const recordPath = path.join(
			repoRoot,
			'docs/records/2026-08-25-audit-docs-prune.md',
		);
		writeFileSync(
			recordPath,
			readFileSync(recordPath, 'utf8').replace(/move → `[^`]+`/, 'delete'),
		);
		git(repoRoot, 'add', '-A');
		git(repoRoot, 'commit', '-qm', 'inventory');
		git(repoRoot, 'update-ref', 'refs/remotes/origin/develop', 'develop');
		git(repoRoot, 'checkout', '-qb', 'lane');
		// A real lane mutation: the tampered record alone lives on develop;
		// the pull request under test changes an unrelated surface file.
		writeFileSync(path.join(repoRoot, 'AGENTS.md'), 'lane edits a surface\n');
		git(repoRoot, 'add', '-A');
		git(repoRoot, 'commit', '-qm', 'mutation');
	});
	const result = runAuditExpectingFailure(root, '--check');
	assert.equal(result.status, 1);
	assert.match(result.stderr, /differs from a fresh regeneration/);
});

// #1425 RED replay: develop's PUSH event ran on a single squash prune commit
// already sitting ON origin/develop, with HEAD detached at the pushed tip and
// no extra refs. The historical merge-base(origin/develop, HEAD) resolution
// collapsed onto the ALREADY-PRUNED tree there, so the decision-table sources
// vanished from the candidate set and --check died on "non-candidate file" —
// while every PR stayed green because its lagging base kept the pre-prune
// tree. The fix derives the audited revision from COMMITTED HISTORY alone,
// so this exact shape must pass WITHOUT any extra refs.
test(
	'push event: one squash prune commit on the default branch checks green with remote ref AT HEAD and detached HEAD',
	{ timeout: 120_000 },
	() => {
		const plantSquashPruneCommit = (plant: (repo: string) => void): string => {
			const root = makeRepo((repo) => {
				mkdirSync(path.join(repo, 'docs/records'), { recursive: true });
				execFileSync(
					'git',
					['mv', WIDGET_SOURCE, 'docs/records/2026-08-25-spec-widget.md'],
					{ cwd: repo, stdio: ['ignore', 'ignore', 'pipe'] },
				);
				plant(repo);
			});
			// The push-event environment verbatim: the pushed tip IS origin/develop,
			// the runner checked out a detached HEAD at that tip, and nothing else
			// was fetched. The old algorithm needed a base BEHIND the tip; here
			// every resolvable pair is the pruned tree itself.
			git(root, 'update-ref', 'refs/remotes/origin/develop', 'HEAD');
			git(root, 'checkout', '-q', '--detach', 'HEAD');
			return root;
		};

		// OLD CODE leg: plant the verbatim legacy resolveRev and prove the exact
		// #1425 failure fires in this shape (RED before the fix).
		const red = plantSquashPruneCommit((repo) => {
			plantGenerator(repo, scriptWithLegacyRev());
		});
		const failed = runAuditExpectingFailure(red, '--check');
		assert.equal(failed.status, 1);
		assert.match(failed.stderr, /Decision table names a non-candidate file/);
		assert.match(
			failed.stderr,
			/docs\/archive\/2026\/designs\//,
			'the legacy resolution must have collapsed onto the PRUNED tree, losing every decision-table source',
		);

		// FIXED code leg: identical repository shape, real generator — the record
		// is generated from history alone, folded into the same squash commit, and
		// --check goes GREEN on the push event with zero extra refs.
		const green = plantSquashPruneCommit((repo) => {
			plantGenerator(repo, scriptWithTable(widgetMoveEntry('widget')));
		});
		runAudit(green);
		git(green, 'add', '-A');
		git(
			green,
			'commit',
			'-q',
			'--amend',
			'-m',
			'docs: prune widget spec (#1357)',
		);
		const checked = runAudit(green, '--check');
		assert.match(checked, /matches a fresh regeneration/);
	},
);

// #1389-shaped defect: a file MERGED into the protected docs/records/
// destination by an earlier PR must never surface as a `delete` row in
// regenerated evidence. While the candidate scope enumerated every tracked
// docs/ path outside guides/, deployment/ and assets/, a record already
// living under docs/records/ entered the candidate set and, unreferenced by
// any survival surface, rendered as a deletion — exactly the misleading row
// once carried for docs/records/2026-08-25-analysis-email-log-actor.md,
// which #1389 had MOVED there (a protected destination, never prune fuel).
test('a file moved into protected docs/records never renders as a delete row', () => {
	const root = makeRepo(
		(repo) => {
			plantGenerator(repo, scriptWithTable(widgetMoveEntry('widget')));
			execFileSync(
				'git',
				['mv', WIDGET_SOURCE, 'docs/records/2026-08-25-spec-widget.md'],
				{ cwd: repo, stdio: ['ignore', 'ignore', 'pipe'] },
			);
		},
		// A record that landed under docs/records/ BEFORE the prune lane ran
		// (the #1389 shape): it belongs to the audited pre-prune tree.
		(repo) => {
			mkdirSync(path.join(repo, 'docs/records'), { recursive: true });
			writeFileSync(
				path.join(repo, 'docs/records/2026-08-25-analysis-email-log.md'),
				'# Email log actor analysis\n',
			);
		},
	);
	runAudit(root);
	const record = readFileSync(
		path.join(root, 'docs/records/2026-08-25-audit-docs-prune.md'),
		'utf8',
	);
	const rows = record.split('\n').filter((line) => line.startsWith('| `docs/'));
	assert.ok(rows.length >= 1, 'fixture expects at least one inventory row');
	for (const row of rows) {
		assert.doesNotMatch(
			row,
			/\| delete \|/,
			`a docs/records/ destination leaked into the candidate scope: ${row}`,
		);
	}
	assert.doesNotMatch(
		record,
		/analysis-email-log/,
		'the protected docs/records/ file must stay out of the inventory entirely',
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-qm', 'record');
	const checked = runAudit(root, '--check');
	assert.match(checked, /matches a fresh regeneration/);
});
