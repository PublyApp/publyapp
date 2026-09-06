import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
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
});
