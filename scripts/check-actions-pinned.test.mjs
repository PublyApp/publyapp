import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findUnpinnedActions } from './check-actions-pinned.mjs';

// Standing proof that the SHA-pinning guard actually fires.
// Every failure mode it claims to catch gets exercised against a throwaway
// repo, so the guard cannot rot into a check that always returns green.

const makeWorkflow = (steps) =>
	`name: fixture\non:\n  pull_request:\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`;

/**
 * Builds a throwaway repo with one workflow file.
 */
const buildFixture = async ({ workflowContent }) => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-actions-pinned-'));

	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });

	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflowContent,
	);

	return rootDir;
};

test('passes when all uses: are pinned to full SHAs', async () => {
	const content = makeWorkflow(
		'      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.deepStrictEqual(findings, []);
});

test('passes for local actions (./path)', async () => {
	const content = makeWorkflow(
		'      - uses: ./.github/actions/my-action\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.deepStrictEqual(findings, []);
});

test('fails when a bare major tag is used', async () => {
	const content = makeWorkflow(
		'      - uses: actions/checkout@v7\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].file, 'fixture.yml');
	assert.strictEqual(findings[0].line, 8);
	assert.strictEqual(findings[0].uses, 'actions/checkout@v7');
});

test('fails when a bare minor tag is used', async () => {
	const content = makeWorkflow(
		'      - uses: docker/build-push-action@v6.1.0\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].uses, 'docker/build-push-action@v6.1.0');
});

test('reports multiple unpinned actions across steps', async () => {
	const content = makeWorkflow(
		'      - uses: actions/checkout@v7\n' +
		'      - uses: actions/setup-node@v7\n' +
		'      - uses: pnpm/action-setup@v6\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 3);
	assert.strictEqual(findings[0].uses, 'actions/checkout@v7');
	assert.strictEqual(findings[1].uses, 'actions/setup-node@v7');
	assert.strictEqual(findings[2].uses, 'pnpm/action-setup@v6');
});

test('mixed pinned and unpinned lines — only unpinned reported', async () => {
	const content = makeWorkflow(
		'      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n' +
		'      - uses: actions/setup-dotnet@v4\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].uses, 'actions/setup-dotnet@v4');
});

test('revert restores green — proof of paired regression', async () => {
	// Phase 1: clean (all pinned)
	const cleanContent = makeWorkflow(
		'      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n',
	);
	const rootDir = await buildFixture({ workflowContent: cleanContent });
	const cleanFindings = await findUnpinnedActions({ rootDir });
	assert.deepStrictEqual(cleanFindings, []);

	// Phase 2: dirty (unpin one line)
	const dirtyContent = makeWorkflow(
		'      - uses: actions/checkout@v7\n',
	);
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		dirtyContent,
	);
	const dirtyFindings = await findUnpinnedActions({ rootDir });
	assert.strictEqual(dirtyFindings.length, 1);

	// Phase 3: revert (re-pin) → green again
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		cleanContent,
	);
	const revertedFindings = await findUnpinnedActions({ rootDir });
	assert.deepStrictEqual(revertedFindings, []);
});

test('ignores commented-out uses: lines (YAML comments)', async () => {
	const content = makeWorkflow(
		'      # - uses: actions/checkout@v7\n' +
		'      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.deepStrictEqual(findings, []);
});

// --- r3 hardening: fail-closed on undecidable / mutable non-action refs ---

test('fails when a uses: value has no @ref at all', async () => {
	// Undecidable input must never pass silently.
	const content = makeWorkflow(
		'      - uses: some-owner/some-action-without-ref\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].file, 'fixture.yml');
	assert.strictEqual(findings[0].line, 8);
	assert.strictEqual(findings[0].uses, 'some-owner/some-action-without-ref');
});

test('fails when a docker:// image has no digest pin', async () => {
	const content = makeWorkflow(
		'      - uses: docker://alpine:3.20\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].file, 'fixture.yml');
	assert.strictEqual(findings[0].line, 8);
	assert.strictEqual(findings[0].uses, 'docker://alpine:3.20');
});

test('passes when a docker:// image is pinned by sha256 digest', async () => {
	const content = makeWorkflow(
		'      - uses: docker://alpine@sha256:6457d53fb065d6f250e1504b9bc42d5b6c12950f3e2bb2611d13bbca9a4b7c58\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.deepStrictEqual(findings, []);
});
