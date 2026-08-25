import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
// reached by exactly the mutation each test describes.
// `refs/remotes/origin/develop` pins the pre-prune tree so the merge-base
// resolves against the base commit, mirroring the real repository.
const makeRepo = (mutate: (root: string) => void): string => {
	const root = mkdtempSync(path.join(tmpdir(), 'audit-docs-prune-'));
	roots.push(root);
	const candidate = 'docs/superpowers/specs/2026-08-25-widget-design.md';
	mkdirSync(path.join(root, path.dirname(candidate)), { recursive: true });
	writeFileSync(path.join(root, 'AGENTS.md'), 'points at nothing yet\n');
	writeFileSync(path.join(root, candidate), '# Widget design\n');
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
	assert.notEqual(rewritten, self, 'fixture relies on rewriting the MOVES table');
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
	execFileSync('node', ['packages/scripts-ts/src/audit-docs-prune.ts', ...args], {
		cwd: root,
		encoding: 'utf8',
	});

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
		execFileSync('git', ['mv', WIDGET_SOURCE, 'docs/records/2026-08-25-spec-widget.md'], {
			cwd: repo,
			stdio: ['ignore', 'ignore', 'pipe'],
		});
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
	assert.match(result.stderr, /docs\/superpowers\/specs\/2026-08-25-widget-design\.md/);
	assert.match(
		result.stderr,
		/git records a rename to docs\/records\/2026-08-25-spec-widget\.md/,
	);
	assert.match(result.stderr, /classifies it as "delete"/);
});

test('--check passes when the inventory matches both regeneration and git renames', () => {
	const root = makeRepo((repo) => {
		// Same git mutation recorded correctly AND mapped in the generator's
		// decision table via the same explicit-topic override the real fix
		// carries.
		plantGenerator(repo, scriptWithTable(widgetMoveEntry('widget')));
		mkdirSync(path.join(repo, 'docs/records'), { recursive: true });
		execFileSync('git', ['mv', WIDGET_SOURCE, 'docs/records/2026-08-25-spec-widget.md'], {
			cwd: repo,
			stdio: ['ignore', 'ignore', 'pipe'],
		});
	});
	runAudit(root); // regenerate from the rewritten table
	// --check reads the committed evidence from HEAD, so the fresh record
	// must be committed first (mirroring the real workflow).
	git(root, 'add', '-A');
	git(root, 'commit', '-qm', 'record');
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
