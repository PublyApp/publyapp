import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import {
	assertLivePrRecordUnchanged,
	assertRunUnchanged,
	createPrSnapshot,
	liveMergeCommitContent,
	parseCommitObject,
	readEventMergeCommit,
	validatePrSnapshotBinding,
} from './ci-pr-snapshot.ts';

test('creates a body-bound live PR snapshot with event SHA provenance', () => {
	const snapshot = createPrSnapshot({
		pr_number: 42,
		head_sha: 'head',
		base_ref_name: 'develop',
		potential_merge_commit_oid: 'merge',
		body: 'Closes #42',
		is_draft: false,
		event_name: 'pull_request',
		event_sha: 'merge',
		workflow_path: '.github/workflows/ci.yml',
		workflow_id: 9,
		workflow_action: 'pull_request',
		run_id: 100,
		run_attempt: 2,
	});

	assert.equal(snapshot.schema_version, 1);
	assert.equal(snapshot.event_sha, 'merge');
	assert.equal(snapshot.body_sha256.length, 64);
	assert.equal(snapshot.workflow_path, '.github/workflows/ci.yml');
});

test('rejects a PR snapshot when event or workflow provenance is stale', () => {
	assert.throws(
		() =>
			validatePrSnapshotBinding({
				pr: {
					headRefOid: 'head',
					baseRefName: 'develop',
					potentialMergeCommit: { oid: 'merge' },
					body: '',
					isDraft: false,
				},
				run: {
					head_sha: 'head',
					path: '.github/workflows/ci.yml',
					workflow_id: 9,
					event: 'pull_request',
					id: 100,
					run_attempt: 2,
				},
				eventSha: 'old-merge',
				runId: 100,
				runAttempt: 2,
			}),
		/stale event SHA/i,
	);
	assert.throws(
		() =>
			validatePrSnapshotBinding({
				pr: {
					headRefOid: 'head',
					baseRefName: 'develop',
					potentialMergeCommit: { oid: 'merge' },
					body: '',
					isDraft: false,
				},
				run: {
					head_sha: 'head',
					path: '.github/workflows/ci.yml',
					workflow_id: 9,
					event: 'pull_request',
					id: 100,
					run_attempt: 2,
				},
				eventSha: 'merge',
				eventName: 'push',
				runId: 100,
				runAttempt: 2,
			}),
		/workflow event/i,
	);
});

const mergeBinding = (
	live: { oid: string; tree: string; parents: string[] },
	event: { tree: string; parents: string[] } | null | undefined,
	eventSha: string,
	headRefOid = 'head',
) => ({
	pr: {
		headRefOid,
		baseRefName: 'develop',
		potentialMergeCommit: {
			oid: live.oid,
			tree: { oid: live.tree },
			parents: { nodes: live.parents.map((oid) => ({ oid })) },
		},
		body: '',
		isDraft: false,
	},
	run: {
		head_sha: 'head',
		path: '.github/workflows/ci.yml',
		workflow_id: 9,
		event: 'pull_request',
		id: 100,
		run_attempt: 2,
	},
	eventSha,
	eventMergeCommit: event,
	runId: 100,
	runAttempt: 2,
});

const liveMerge = { oid: 'merge-2', tree: 'tree-a', parents: ['base', 'head'] };

test('accepts the identical event and live merge commit oid without reading content', () => {
	assert.doesNotThrow(() =>
		validatePrSnapshotBinding(
			mergeBinding({ ...liveMerge, oid: 'merge-1' }, undefined, 'merge-1'),
		),
	);
});

test('accepts a recreated merge commit with the same tree and parents (#2216)', () => {
	assert.doesNotThrow(() =>
		validatePrSnapshotBinding(
			mergeBinding(
				liveMerge,
				{ tree: 'tree-a', parents: ['base', 'head'] },
				'merge-1',
			),
		),
	);
});

test.each([
	[
		'base moved',
		{ tree: 'tree-a', parents: ['old-base', 'head'] },
		/base branch moved/,
	],
	[
		'head moved',
		{ tree: 'tree-a', parents: ['base', 'old-head'] },
		/PR head moved/,
	],
	[
		'tree differs',
		{ tree: 'tree-b', parents: ['base', 'head'] },
		/merge tree differs/,
	],
	['event content unavailable', null, /unavailable/],
	[
		'non-merge event commit',
		{ tree: 'tree-a', parents: ['head'] },
		/two-parent/,
	],
])('rejects a re-minted merge commit when %s', (_name, event, message) => {
	assert.throws(
		() => validatePrSnapshotBinding(mergeBinding(liveMerge, event, 'merge-1')),
		(error: Error) =>
			/stale event SHA does not match merge commit/.test(error.message) &&
			message.test(error.message),
	);
});

test('rejects a live merge commit whose parents do not end at the live PR head', () => {
	assert.throws(
		() =>
			validatePrSnapshotBinding(
				mergeBinding(
					{ ...liveMerge, parents: ['base', 'other-head'] },
					{ tree: 'tree-a', parents: ['base', 'other-head'] },
					'merge-1',
				),
			),
		/PR head moved/,
	);
});

test('derives live merge content only when tree and parents are complete', () => {
	assert.deepEqual(
		liveMergeCommitContent({
			oid: 'm',
			tree: { oid: 't' },
			parents: { nodes: [{ oid: 'a' }, { oid: 'b' }] },
		}),
		{ tree: 't', parents: ['a', 'b'] },
	);
	assert.equal(liveMergeCommitContent({ oid: 'm' }), undefined);
	assert.equal(
		liveMergeCommitContent({
			oid: 'm',
			tree: { oid: 't' },
			parents: { nodes: [{ oid: 'a' }, null] },
		}),
		undefined,
	);
});

test('tolerates a merge commit re-minted between policy read and snapshot only when content is equal', () => {
	const before = {
		...livePrRecord,
		mergeTree: 'tree-a',
		mergeParents: ['base', 'head'],
	};
	assert.doesNotThrow(() =>
		assertLivePrRecordUnchanged(before, { ...before, mergeOid: 'merge-2' }),
	);
	assert.throws(
		() =>
			assertLivePrRecordUnchanged(before, {
				...before,
				mergeOid: 'merge-2',
				mergeTree: 'tree-b',
			}),
		/merge/,
	);
	assert.throws(
		() =>
			assertLivePrRecordUnchanged(before, {
				...before,
				mergeOid: 'merge-2',
				mergeParents: ['base-2', 'head'],
			}),
		/merge/,
	);
});

test('rejects a re-minted merge commit when the live tree and parents are incomplete', () => {
	const binding = mergeBinding(
		liveMerge,
		{ tree: 'tree-a', parents: ['base', 'head'] },
		'merge-1',
	);
	assert.throws(
		() =>
			validatePrSnapshotBinding({
				...binding,
				pr: { ...binding.pr, potentialMergeCommit: { oid: 'merge-2' } },
			}),
		/unavailable/,
	);
});

test('a legacy live record without merge content rejects a changed merge oid strictly', () => {
	const legacy = { ...livePrRecord };
	assert.throws(
		() =>
			assertLivePrRecordUnchanged(legacy, { ...legacy, mergeOid: 'merge-2' }),
		/merge/,
	);
	assert.throws(
		() =>
			assertLivePrRecordUnchanged(legacy, {
				...legacy,
				mergeOid: 'merge-2',
				mergeTree: 'tree-a',
				mergeParents: ['base', 'head'],
			}),
		/merge/,
	);
});

test('the snapshot carries additive merge content fields and keeps schema version 1', () => {
	const base = {
		pr_number: 42,
		head_sha: 'head',
		base_ref_name: 'develop',
		potential_merge_commit_oid: 'merge-2',
		body: '',
		is_draft: false,
		event_name: 'pull_request',
		event_sha: 'merge-1',
		workflow_path: '.github/workflows/ci.yml',
		workflow_id: 9,
		workflow_action: 'pull_request',
		run_id: 100,
		run_attempt: 2,
	};
	const withContent = createPrSnapshot({
		...base,
		event_merge_tree: 'tree-a',
		event_merge_parents: ['base', 'head'],
		potential_merge_tree: 'tree-a',
		potential_merge_parents: ['base', 'head'],
	});
	assert.equal(withContent.schema_version, 1);
	assert.equal(withContent.event_merge_tree, 'tree-a');
	assert.deepEqual(withContent.event_merge_parents, ['base', 'head']);
	assert.equal(withContent.potential_merge_tree, 'tree-a');
	assert.deepEqual(withContent.potential_merge_parents, ['base', 'head']);
	const without = createPrSnapshot(base);
	assert.equal('event_merge_tree' in without, false);
	assert.equal(JSON.stringify(without).includes('merge_parents'), false);
});

const unreachable = () => {
	throw new Error('reader must not be called');
};

test('parseCommitObject reads tree and parents and skips signature continuation lines and the message', () => {
	const raw = [
		'tree t1',
		'parent p1',
		'parent p2',
		'author A <a@b> 1 +0000',
		'gpgsig -----BEGIN',
		' tree not-a-header',
		' parent not-a-header',
		'',
		'tree in-message',
		'parent in-message',
	].join('\n');
	assert.deepEqual(parseCommitObject(raw), {
		tree: 't1',
		parents: ['p1', 'p2'],
	});
	assert.equal(parseCommitObject('parent p1\n\nmsg'), null);
});

test('readEventMergeCommit reads the raw object locally without replace refs and skips REST', () => {
	const calls: string[][] = [];
	const result = readEventMergeCommit('o/r', 'sha', {
		git: (args) => {
			calls.push(args);
			return 'tree t1\nparent base\nparent head\n\nMerge';
		},
		ghJson: unreachable,
	});
	assert.deepEqual(result, { tree: 't1', parents: ['base', 'head'] });
	assert.deepEqual(calls, [
		['--no-replace-objects', 'cat-file', 'commit', 'sha'],
	]);
});

test.each([
	[
		'the object is missing (shallow clone)',
		() => {
			throw new Error('fatal: git cat-file: could not get object info');
		},
	],
	[
		'the local commit has fewer than two parents',
		() => 'tree t1\nparent base\n\nmsg',
	],
	[
		'the local commit has more than two parents',
		() => 'tree t1\nparent a\nparent b\nparent c\n\nmsg',
	],
])(
	'readEventMergeCommit falls back to the REST commits API when %s',
	(_name, gitReader) => {
		const endpoints: string[][] = [];
		const result = readEventMergeCommit('o/r', 'sha', {
			git: gitReader,
			ghJson: (args) => {
				endpoints.push(args);
				return JSON.parse(
					JSON.stringify({
						commit: { tree: { sha: 'rest-tree' } },
						parents: [{ sha: 'rest-base' }, { sha: 'rest-head' }],
					}),
				);
			},
		});
		assert.deepEqual(result, {
			tree: 'rest-tree',
			parents: ['rest-base', 'rest-head'],
		});
		assert.deepEqual(endpoints, [['api', 'repos/o/r/commits/sha']]);
	},
);

test('readEventMergeCommit returns null when neither git nor REST can read the commit', () => {
	const fail = () => {
		throw new Error('unavailable');
	};
	assert.equal(
		readEventMergeCommit('o/r', 'sha', { git: fail, ghJson: fail }),
		null,
	);
});

test('readEventMergeCommit ignores replace refs on a real merge commit', () => {
	const directory = mkdtempSync(path.join(tmpdir(), 'event-merge-'));
	const run = (args: string[]) =>
		execFileSync('git', args, {
			cwd: directory,
			encoding: 'utf8',
			env: {
				...process.env,
				GIT_AUTHOR_NAME: 't',
				GIT_AUTHOR_EMAIL: 't@t',
				GIT_COMMITTER_NAME: 't',
				GIT_COMMITTER_EMAIL: 't@t',
			},
		}).trim();
	try {
		run(['init', '-q', '-b', 'main']);
		run(['commit', '-q', '--allow-empty', '-m', 'base']);
		run(['checkout', '-q', '-b', 'pr']);
		run(['commit', '-q', '--allow-empty', '-m', 'pr']);
		run(['checkout', '-q', 'main']);
		run(['commit', '-q', '--allow-empty', '-m', 'main']);
		run(['merge', '-q', '--no-ff', '-m', 'merge', 'pr']);
		const merge = run(['rev-parse', 'HEAD']);
		const [base, head] = run(['rev-list', '--parents', '-n', '1', merge])
			.split(' ')
			.slice(1);
		const tree = run(['rev-parse', `${merge}^{tree}`]);
		const readers = {
			git: (args: string[]) => run(args),
			ghJson: unreachable,
		};
		assert.deepEqual(readEventMergeCommit('o/r', merge, readers), {
			tree,
			parents: [base, head],
		});
		// Replace the merge with a one-parent commit: the raw object must still win.
		const fake = run(['commit-tree', tree, '-p', head, '-m', 'fake']);
		run(['replace', merge, fake]);
		assert.deepEqual(readEventMergeCommit('o/r', merge, readers), {
			tree,
			parents: [base, head],
		});
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

const livePrRecord = {
	headRefOid: 'head',
	baseRefName: 'develop',
	mergeOid: 'merge',
	body: 'Closes #41',
	isDraft: false,
};

test.each([
	['body edit', { body: 'edited body' }, /body/],
	['head retip', { headRefOid: 'new-head' }, /head/],
	['base advance', { baseRefName: 'release' }, /base/],
	['merge ref change', { mergeOid: 'new-merge' }, /merge/],
	['draft transition', { isDraft: true }, /draft/i],
])(
	'rejects a live PR edit between policy read and snapshot upload: %s',
	(_name, change, message) => {
		assert.throws(
			() =>
				assertLivePrRecordUnchanged(livePrRecord, {
					...livePrRecord,
					...change,
				}),
			message,
		);
	},
);

test('accepts an unchanged live PR record for the policy-to-upload critical section', () => {
	assert.doesNotThrow(() =>
		assertLivePrRecordUnchanged(livePrRecord, { ...livePrRecord }),
	);
});

test('rejects a workflow rerun identity change before snapshot upload', () => {
	const run = {
		head_sha: 'head',
		path: '.github/workflows/ci.yml',
		workflow_id: 9,
		event: 'pull_request',
		id: 100,
		run_attempt: 2,
	};

	for (const [field, value] of [
		['head_sha', 'new-head'],
		['path', '.github/workflows/other.yml'],
		['workflow_id', 10],
		['event', 'push'],
		['id', 101],
		['run_attempt', 3],
	] as const) {
		assert.throws(
			() => assertRunUnchanged(run, { ...run, [field]: value }),
			new RegExp(field),
		);
	}
});
