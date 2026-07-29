import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyRelevance } from './ci-changed-paths.mjs';

// These tests are the standing proof that the changed-path classifier fails
// closed at GitHub's 3,000-file "List pull request files" ceiling, rather
// than silently certifying an incomplete list as "not relevant". See #1017.

const pattern = '^(apps/front/|packages/shared-ts/)';

test('push runs are relevant by construction, without needing file evidence', () => {
	const result = classifyRelevance({
		eventName: 'push',
		files: [],
		changedFilesTotal: 0,
		pattern,
	});

	assert.equal(result.relevant, true);
});

test('a complete file list containing a relevant path is relevant', () => {
	const files = ['apps/front/src/routes.ts', 'README.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: files.length,
		pattern,
	});

	assert.equal(result.relevant, true);
});

test('a complete file list with no relevant path is not relevant', () => {
	const files = ['README.md', 'docs/guides/foo.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: files.length,
		pattern,
	});

	assert.equal(result.relevant, false);
});

test('an empty pull request (no files changed) is not relevant', () => {
	const result = classifyRelevance({
		eventName: 'pull_request',
		files: [],
		changedFilesTotal: 0,
		pattern,
	});

	assert.equal(result.relevant, false);
});

test('BLOCKER: a truncated list that omits the relevant file fails closed to relevant', () => {
	// The exact false-green path from the review: the PR reports far more
	// changed files than the API actually returned (the 3,000-file ceiling),
	// and none of the returned files happen to match. A naive matcher would
	// report relevant=false here and let the heavy job skip.
	const files = ['README.md', 'docs/guides/foo.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: 3001,
		pattern,
	});

	assert.equal(result.relevant, true);
	assert.match(result.reason, /incomplete/);
});

test('BLOCKER: exactly the 3,000-file ceiling with the total one over it fails closed', () => {
	const files = Array.from({ length: 3000 }, (_, i) => `docs/file-${i}.md`);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: 3001,
		pattern,
	});

	assert.equal(result.relevant, true);
});

test('a missing changed_files total fails closed rather than assuming completeness', () => {
	const files = ['README.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: undefined,
		pattern,
	});

	assert.equal(result.relevant, true);
	assert.match(result.reason, /missing|not a valid/);
});

test('a non-array file list (malformed API response) fails closed', () => {
	const result = classifyRelevance({
		eventName: 'pull_request',
		files: null,
		changedFilesTotal: 5,
		pattern,
	});

	assert.equal(result.relevant, true);
	assert.match(result.reason, /not an array/);
});

test('a file count that exceeds the reported total also fails closed (anomalous, not just short)', () => {
	const files = ['a.txt', 'b.txt', 'c.txt'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: 2,
		pattern,
	});

	assert.equal(result.relevant, true);
});
