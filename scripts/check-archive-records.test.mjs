import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCheck } from './check-archive-records.mjs';

// Every case here is a standing proof that the guard actually fires, not just
// that it once did in a manual simulation. Two earlier versions of this guard
// were fundamentally wrong (a pinned moving ref, a baseline already scrubbed)
// and both slipped past because nothing but a human reading output caught
// them. These fixtures build throwaway git repos so the guard's verdict is
// asserted directly, in both directions, for each failure mode it claims.

const git = (rootDir, args) => {
	const result = spawnSync('git', args, { cwd: rootDir, encoding: 'utf8' });
	if (result.status !== 0) {
		throw new Error(
			`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`,
		);
	}
	return result.stdout;
};

const initRepo = async (label) => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), `publyapp-archive-guard-${label}-`),
	);
	git(rootDir, ['init', '-q', '-b', 'main']);
	git(rootDir, ['config', 'user.email', 'fixture@example.com']);
	git(rootDir, ['config', 'user.name', 'Fixture']);
	return rootDir;
};

const commitAll = (rootDir, message) => {
	git(rootDir, ['add', '-A']);
	git(rootDir, ['commit', '-q', '-m', message]);
};

const archiveHeader = ({
	status = 'Archived',
	originalLocation = 'docs/guides/example.md',
	reason = 'Superseded by a rewritten guide.',
	supersededBy = 'none',
} = {}) =>
	`Status: ${status}\nOriginal location: ${originalLocation}\nArchive reason: ${reason}\nSuperseded by: ${supersededBy}\n\n`;

const writeArchiveFile = async (
	rootDir,
	relativeFile,
	body,
	headerOverrides,
) => {
	const fullPath = path.join(rootDir, relativeFile);
	await mkdir(path.dirname(fullPath), { recursive: true });
	await writeFile(fullPath, archiveHeader(headerOverrides) + body);
};

const findFatal = (findings, file) =>
	findings.fatal.find((finding) => finding.file === file);
const findWarning = (findings, file) =>
	findings.warning.find((finding) => finding.file === file);

test('fatal: an established record (present at the merge base) whose body drifts', async () => {
	const rootDir = await initRepo('established-drift');
	await writeArchiveFile(
		rootDir,
		'docs/archive/example.md',
		'Original body.\n',
	);
	commitAll(rootDir, 'archive example');
	git(rootDir, ['branch', 'origin/develop']);

	// Direction 1 (should fire): rewrite the body after the merge base.
	await writeArchiveFile(
		rootDir,
		'docs/archive/example.md',
		'Rewritten body.\n',
	);
	commitAll(rootDir, 'accidentally rewrite archived body');

	const drifted = await runCheck(rootDir);
	const fatal = findFatal(drifted.findings, 'docs/archive/example.md');
	assert.ok(
		fatal,
		'expected a fatal finding for a body that drifted past the merge base',
	);
	assert.equal(fatal.type, 'body-hash');

	// Direction 2 (inverted — should NOT fire): a second, undisturbed repo
	// with the same starting body and no edit after the merge base.
	const cleanRoot = await initRepo('established-clean');
	await writeArchiveFile(
		cleanRoot,
		'docs/archive/example.md',
		'Original body.\n',
	);
	commitAll(cleanRoot, 'archive example');
	git(cleanRoot, ['branch', 'origin/develop']);
	const clean = await runCheck(cleanRoot);
	assert.equal(findFatal(clean.findings, 'docs/archive/example.md'), undefined);
});

test('pass: a newly archived record that is byte-exact with its add commit', async () => {
	const rootDir = await initRepo('new-byte-exact');
	await writeFile(path.join(rootDir, 'README.md'), 'baseline\n');
	commitAll(rootDir, 'baseline');
	git(rootDir, ['branch', 'origin/develop']);

	await writeArchiveFile(
		rootDir,
		'docs/archive/new.md',
		'Body copied verbatim.\n',
	);
	commitAll(rootDir, 'archive new record');

	const { findings } = await runCheck(rootDir);
	assert.equal(findWarning(findings, 'docs/archive/new.md'), undefined);
	assert.equal(findFatal(findings, 'docs/archive/new.md'), undefined);
});

test('warning: a newly archived record falsified since its add commit', async () => {
	const rootDir = await initRepo('new-falsified');
	await writeFile(path.join(rootDir, 'README.md'), 'baseline\n');
	commitAll(rootDir, 'baseline');
	git(rootDir, ['branch', 'origin/develop']);

	await writeArchiveFile(
		rootDir,
		'docs/archive/new.md',
		'Body copied verbatim.\n',
	);
	commitAll(rootDir, 'archive new record');

	// Direction 1 (should fire): edit the body after the add commit.
	await writeArchiveFile(
		rootDir,
		'docs/archive/new.md',
		'Body quietly edited.\n',
	);
	commitAll(rootDir, 'repair a typo in the just-archived record');

	const { findings } = await runCheck(rootDir);
	const warning = findWarning(findings, 'docs/archive/new.md');
	assert.ok(warning, 'expected a warning naming the falsified file');
	assert.equal(warning.type, 'body-hash');
	assert.equal(findFatal(findings, 'docs/archive/new.md'), undefined);

	// Direction 2 (inverted — should NOT fire) is covered by the byte-exact
	// test above using the same add-commit-then-check shape with no edit.
});

test('verdict is unaffected by an unrelated advance of develop', async () => {
	const rootDir = await initRepo('unrelated-advance');
	await writeFile(path.join(rootDir, 'README.md'), 'baseline\n');
	commitAll(rootDir, 'baseline');
	git(rootDir, ['branch', 'origin/develop']);

	await writeArchiveFile(
		rootDir,
		'docs/archive/new.md',
		'Body copied verbatim.\n',
	);
	commitAll(rootDir, 'archive new record');

	const before = await runCheck(rootDir);

	git(rootDir, ['checkout', '-q', '-b', 'develop-advance', 'origin/develop']);
	await writeFile(path.join(rootDir, 'unrelated.md'), 'unrelated change\n');
	commitAll(rootDir, 'unrelated advance of develop');
	git(rootDir, ['update-ref', 'refs/heads/origin/develop', 'develop-advance']);
	git(rootDir, ['checkout', '-q', 'main']);
	git(rootDir, ['branch', '-D', 'develop-advance']);

	const after = await runCheck(rootDir);

	assert.deepStrictEqual(after.findings, before.findings);
	assert.deepStrictEqual(after.counts, before.counts);
});

test('pass: the post-squash state, then fatal: an edit to the archived record after that squash', async () => {
	const rootDir = await initRepo('post-squash');
	await writeArchiveFile(
		rootDir,
		'docs/archive/post-squash.md',
		'Squashed body.\n',
	);
	commitAll(rootDir, 'squash-merge simulation');
	git(rootDir, ['branch', 'origin/develop']);

	// Direction 1 (should pass): HEAD is exactly the squashed commit.
	const squashed = await runCheck(rootDir);
	assert.equal(
		findFatal(squashed.findings, 'docs/archive/post-squash.md'),
		undefined,
	);
	assert.equal(
		findWarning(squashed.findings, 'docs/archive/post-squash.md'),
		undefined,
	);

	// Direction 2 (inverted — should fire): edit the archived record after
	// the squash, with origin/develop staying put at the squash commit.
	await writeArchiveFile(
		rootDir,
		'docs/archive/post-squash.md',
		'Edited after squash.\n',
	);
	commitAll(rootDir, 'edit archived record after squash');

	const { findings } = await runCheck(rootDir);
	const fatal = findFatal(findings, 'docs/archive/post-squash.md');
	assert.ok(fatal, 'expected a fatal finding for a post-squash edit');
	assert.equal(fatal.type, 'body-hash');
});

test('malformed metadata and a missing record are both reported, not silently ignored', async () => {
	const rootDir = await initRepo('malformed-and-missing');
	await mkdir(path.join(rootDir, 'docs', 'archive'), { recursive: true });
	await writeFile(
		path.join(rootDir, 'docs', 'archive', 'malformed.md'),
		'short file with no header\n',
	);
	await writeArchiveFile(
		rootDir,
		'docs/archive/gone.md',
		'Body that will vanish.\n',
	);
	commitAll(rootDir, 'add malformed and soon-to-be-removed records');
	git(rootDir, ['branch', 'origin/develop']);

	git(rootDir, ['rm', '-q', 'docs/archive/gone.md']);
	commitAll(rootDir, 'remove archived record from the working tree');

	// Direction 1 (should fire): malformed header + missing record.
	const { findings, counts } = await runCheck(rootDir);
	const malformed = findFatal(findings, 'docs/archive/malformed.md');
	assert.ok(malformed, 'expected a fatal finding for the malformed header');
	const missing = findFatal(findings, 'docs/archive/gone.md');
	assert.ok(missing, 'expected a fatal finding for the missing record');
	assert.equal(missing.type, 'archive-record-missing');
	assert.equal(counts.missingRecords, 1);

	// Direction 2 (inverted — should NOT fire): both records well-formed and
	// present in a clean repo.
	const cleanRoot = await initRepo('malformed-and-missing-clean');
	await writeArchiveFile(
		cleanRoot,
		'docs/archive/fine.md',
		'A properly archived body.\n',
	);
	await writeArchiveFile(
		cleanRoot,
		'docs/archive/also-fine.md',
		'Another proper body.\n',
	);
	commitAll(cleanRoot, 'add well-formed records');
	git(cleanRoot, ['branch', 'origin/develop']);

	const clean = await runCheck(cleanRoot);
	assert.equal(clean.findings.fatal.length, 0);
	assert.equal(clean.counts.missingRecords, 0);
});
