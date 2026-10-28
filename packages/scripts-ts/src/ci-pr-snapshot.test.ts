import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
	assertLivePrRecordUnchanged,
	assertRunUnchanged,
	createPrSnapshot,
	liveMergeCommitContent,
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
