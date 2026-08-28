import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import { findArtifactVersionIncompatibilities } from '../../../src/artifact-version-compat.ts';

// #1742 paired proof: the guard used to read the FIRST `uses:` line matching
// a repo@sha, so when two steps pinned the same repo@sha, the second step
// silently inherited the first step's version comment. This proof reproduces
// the exact scenario from the issue: two upload-artifact steps on the same
// fingerprint with divergent comments, where the incompatibility is on the
// second step but the guard reported 0 findings because it read the first
// step's comment for both.

const UPLOAD_V7_SHA = '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
const DOWNLOAD_V4_SHA = 'b5b1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1';
const DOWNLOAD_V8_SHA = '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c';

const makeWorkflow = (jobs: string): string =>
	'name: fixture\non:\n  pull_request:\njobs:\n' + jobs;

const buildFixture = async (
	workflows: Record<string, string>,
): Promise<string> => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-1742-proof-'));

	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });

	for (const [name, content] of Object.entries(workflows)) {
		await writeFile(path.join(rootDir, '.github/workflows', name), content);
	}

	return rootDir;
};

// Exact reproduction from issue #1742:
// 1. First upload step: comment changed to # v4.0.0 (same sha, divergent comment)
// 2. Second upload step: keeps # v7.0.1, adds archive: false
// 3. Download step: # v4.0.0 on the same artifact name
//
// Expected: 1 finding (the second upload's archive:false v7+ is incompatible
// with the v4 download). Before the fix: 0 findings.
test('RED for #1742: guard reads first line, misses incompatibility on second step', async () => {
	const rootDir = await buildFixture({
		'front-e2e.yml': makeWorkflow(
			'  test:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Upload stack images artifact\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V7_SHA} # v4.0.0\n` +
				'        with:\n          name: e2e-stack-images\n          path: /tmp/e2e-images/*.tar.gz\n          archive: false\n' +
				'      - name: Upload playwright report\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V7_SHA} # v7.0.1\n` +
				'        with:\n          name: e2e-report\n          path: /tmp/e2e-report/\n          archive: false\n' +
				'      - name: PROBE download playwright report\n' +
				`        uses: actions/download-artifact@${DOWNLOAD_V4_SHA} # v4.0.0\n` +
				'        with:\n          name: e2e-report\n',
		),
	});

	const findings = await findArtifactVersionIncompatibilities({ rootDir });

	// With the fix: the second upload reads its OWN comment (# v7.0.1), so
	// the guard detects the incompatibility with the v4 download.
	// Without the fix: the second upload inherited the first upload's
	// comment (# v4.0.0), so no incompatibility was reported.
	assert.equal(
		findings.length,
		1,
		`Expected 1 finding, got ${findings.length}: ${JSON.stringify(findings)}`,
	);
	assert.match(findings[0], /Upload playwright report/);
	assert.match(findings[0], /PROBE download playwright report/);
	assert.match(findings[0], /v8\+/);
});

// Control: when both steps have the same correct comment, the guard still works
test('control: both uploads on # v7.0.1 with archive:false, download on v4', async () => {
	const rootDir = await buildFixture({
		'front-e2e.yml': makeWorkflow(
			'  test:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Upload stack images artifact\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V7_SHA} # v7.0.1\n` +
				'        with:\n          name: e2e-stack-images\n          path: /tmp/e2e-images/*.tar.gz\n          archive: false\n' +
				'      - name: Upload playwright report\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V7_SHA} # v7.0.1\n` +
				'        with:\n          name: e2e-report\n          path: /tmp/e2e-report/\n          archive: false\n' +
				'      - name: PROBE download playwright report\n' +
				`        uses: actions/download-artifact@${DOWNLOAD_V4_SHA} # v4.0.0\n` +
				'        with:\n          name: e2e-report\n',
		),
	});

	const findings = await findArtifactVersionIncompatibilities({ rootDir });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /v8\+/);
});
