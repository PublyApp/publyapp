import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
	assertLivePrRecordUnchanged,
	assertRunUnchanged,
	createPrSnapshot,
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
