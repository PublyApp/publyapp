import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import { findArtifactVersionIncompatibilities } from './artifact-version-compat.ts';

// #1728 supply-chain guard: pairs upload-artifact steps to download-artifact
// steps by artifact name and enforces version compatibility when archive: false
// is present on v7+ uploads. Every failure mode is exercised against a throwaway
// repo fixture, so the guard cannot rot into a check that always returns green.

const UPLOAD_V7_SHA = '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
const UPLOAD_V4_SHA = 'dd121479f9cac55d52e6f3e8e0a1a1a1a1a1a1a1'; // placeholder v4 SHA (40 hex)
const DOWNLOAD_V8_SHA = '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c';
const DOWNLOAD_V4_SHA = 'b5b1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1';

/** Builds workflow YAML content from raw job YAML (no template interpolation issues). */
const makeWorkflow = (jobs: string): string =>
	'name: fixture\non:\n  pull_request:\njobs:\n' + jobs;

/** Builds a throwaway repo with the given workflow files. */
const buildFixture = async (
	workflows: Record<string, string>,
): Promise<string> => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-artifact-guard-'),
	);

	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });

	for (const [name, content] of Object.entries(workflows)) {
		await writeFile(path.join(rootDir, '.github/workflows', name), content);
	}

	return rootDir;
};

// --- end-to-end through findArtifactVersionIncompatibilities ---

test('passes when archive: false upload (v7) pairs with download-artifact v8', async () => {
	const rootDir = await buildFixture({
		'fixture.yml': makeWorkflow(
			'  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Upload\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V7_SHA} # v7.0.1\n` +
				'        with:\n          name: my-artifact\n          path: dist/\n          archive: false\n' +
				'      - name: Download\n' +
				`        uses: actions/download-artifact@${DOWNLOAD_V8_SHA} # v8.0.1\n` +
				'        with:\n          name: my-artifact\n',
		),
	});

	assert.deepEqual(await findArtifactVersionIncompatibilities({ rootDir }), []);
});

test('fails when archive: false upload (v7) pairs with download-artifact v4 (RED)', async () => {
	const rootDir = await buildFixture({
		'fixture.yml': makeWorkflow(
			'  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Upload\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V7_SHA} # v7.0.1\n` +
				'        with:\n          name: my-artifact\n          path: dist/\n          archive: false\n' +
				'      - name: Download\n' +
				`        uses: actions/download-artifact@${DOWNLOAD_V4_SHA} # v4\n` +
				'        with:\n          name: my-artifact\n',
		),
	});

	const findings = await findArtifactVersionIncompatibilities({ rootDir });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /fixture\.yml.*build.*Upload/);
	assert.match(findings[0], /fixture\.yml.*build.*Download/);
	assert.match(findings[0], /v8/);
});

test('passes when archive: true upload (v7) pairs with download-artifact v4 — no constraint', async () => {
	const rootDir = await buildFixture({
		'fixture.yml': makeWorkflow(
			'  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Upload\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V7_SHA} # v7.0.1\n` +
				'        with:\n          name: my-artifact\n          path: dist/\n          archive: true\n' +
				'      - name: Download\n' +
				`        uses: actions/download-artifact@${DOWNLOAD_V4_SHA} # v4\n` +
				'        with:\n          name: my-artifact\n',
		),
	});

	assert.deepEqual(await findArtifactVersionIncompatibilities({ rootDir }), []);
});

test('passes when upload v7 without archive (default) pairs with download v4', async () => {
	const rootDir = await buildFixture({
		'fixture.yml': makeWorkflow(
			'  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Upload\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V7_SHA} # v7.0.1\n` +
				'        with:\n          name: my-artifact\n          path: dist/\n' +
				'      - name: Download\n' +
				`        uses: actions/download-artifact@${DOWNLOAD_V4_SHA} # v4\n` +
				'        with:\n          name: my-artifact\n',
		),
	});

	assert.deepEqual(await findArtifactVersionIncompatibilities({ rootDir }), []);
});

test('passes when no download consumes the archived upload', async () => {
	const rootDir = await buildFixture({
		'fixture.yml': makeWorkflow(
			'  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Upload\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V7_SHA} # v7.0.1\n` +
				'        with:\n          name: my-artifact\n          path: dist/\n          archive: false\n',
		),
	});

	assert.deepEqual(await findArtifactVersionIncompatibilities({ rootDir }), []);
});

test('pairs by raw expression name when both upload and download use the same expression', async () => {
	const rootDir = await buildFixture({
		'build.yml': makeWorkflow(
			'  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Upload stack images artifact\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V7_SHA} # v7.0.1\n` +
				'        with:\n          name: e2e-stack-images-${{ steps.image-tag.outputs.tag }}\n          path: /tmp/e2e-images/*.tar.gz\n          archive: false\n',
		),
		'test.yml': makeWorkflow(
			'  test:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Download stack images artifact\n' +
				`        uses: actions/download-artifact@${DOWNLOAD_V4_SHA} # v4\n` +
				'        with:\n          name: e2e-stack-images-${{ steps.image-tag.outputs.tag }}\n          path: /tmp/e2e-images\n',
		),
	});

	const findings = await findArtifactVersionIncompatibilities({ rootDir });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /v8/);
});

test('fails when upload-artifact lacks a version comment', async () => {
	const rootDir = await buildFixture({
		'fixture.yml': makeWorkflow(
			'  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Upload\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V7_SHA}\n` +
				'        with:\n          name: my-artifact\n          path: dist/\n          archive: false\n' +
				'      - name: Download\n' +
				`        uses: actions/download-artifact@${DOWNLOAD_V8_SHA} # v8.0.1\n` +
				'        with:\n          name: my-artifact\n',
		),
	});

	const findings = await findArtifactVersionIncompatibilities({ rootDir });

	assert.ok(findings.length >= 1);
	assert.ok(
		findings.some((f) => /missing or malformed/.test(f)),
		`Expected a version-comment failure, got: ${JSON.stringify(findings)}`,
	);
});

test('fails closed when upload-artifact uses short ref (not 40-hex pinned)', async () => {
	const rootDir = await buildFixture({
		'fixture.yml': makeWorkflow(
			'  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Old upload\n        uses: actions/upload-artifact@v3\n        with:\n          name: legacy-artifact\n          path: dist/\n',
		),
	});

	const findings = await findArtifactVersionIncompatibilities({ rootDir });

	assert.ok(
		findings.some((f) => /missing or malformed/.test(f)),
		`Expected a version-comment failure for short ref, got: ${JSON.stringify(findings)}`,
	);
});

test('passes when archive: false on pre-v7 upload — not a v7+ feature', async () => {
	const rootDir = await buildFixture({
		'fixture.yml': makeWorkflow(
			'  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Upload\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V4_SHA} # v4.6.0\n` +
				'        with:\n          name: my-artifact\n          path: dist/\n          archive: false\n' +
				'      - name: Download\n' +
				`        uses: actions/download-artifact@${DOWNLOAD_V4_SHA} # v4\n` +
				'        with:\n          name: my-artifact\n',
		),
	});

	const findings = await findArtifactVersionIncompatibilities({ rootDir });

	assert.deepEqual(findings, []);
});

test('pairs across different jobs in the same workflow', async () => {
	const rootDir = await buildFixture({
		'fixture.yml': makeWorkflow(
			'  upload:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Upload\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V7_SHA} # v7.0.1\n` +
				'        with:\n          name: cross-job-artifact\n          path: dist/\n          archive: false\n' +
				'  download:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Download\n' +
				`        uses: actions/download-artifact@${DOWNLOAD_V4_SHA} # v4\n` +
				'        with:\n          name: cross-job-artifact\n',
		),
	});

	const findings = await findArtifactVersionIncompatibilities({ rootDir });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /upload::Upload/);
	assert.match(findings[0], /download::Download/);
	assert.match(findings[0], /v8/);
});

test('ignores unrelated actions', async () => {
	const rootDir = await buildFixture({
		'fixture.yml': makeWorkflow(
			'  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n' +
				'      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10\n',
		),
	});

	assert.deepEqual(await findArtifactVersionIncompatibilities({ rootDir }), []);
});

test('pairs by static prefix when upload and download use different expressions with the same prefix', async () => {
	const rootDir = await buildFixture({
		'fixture.yml': makeWorkflow(
			'  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Upload\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V7_SHA} # v7.0.1\n` +
				'        with:\n          name: e2e-stack-images-${{ steps.image-tag.outputs.tag }}\n          path: dist/\n          archive: false\n' +
				'  download:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Download\n' +
				`        uses: actions/download-artifact@${DOWNLOAD_V4_SHA} # v4\n` +
				'        with:\n          name: e2e-stack-images-${{ needs.build.outputs.tag }}\n',
		),
	});

	const findings = await findArtifactVersionIncompatibilities({ rootDir });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /v8/);
});

test('detects Archive: false with different casing — GitHub Actions YAML is case-insensitive', async () => {
	const rootDir = await buildFixture({
		'fixture.yml': makeWorkflow(
			'  build:\n    runs-on: ubuntu-latest\n    steps:\n' +
				'      - name: Upload\n' +
				`        uses: actions/upload-artifact@${UPLOAD_V7_SHA} # v7.0.1\n` +
				'        with:\n          name: my-artifact\n          path: dist/\n          Archive: false\n' +
				'      - name: Download\n' +
				`        uses: actions/download-artifact@${DOWNLOAD_V4_SHA} # v4\n` +
				'        with:\n          name: my-artifact\n',
		),
	});

	const findings = await findArtifactVersionIncompatibilities({ rootDir });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /v8/);
});

test('repo workflows pass — real front-e2e.yml and api-tests.yml are compatible', async () => {
	const rootDir = path.resolve(
		path.dirname(new URL(import.meta.url).pathname),
		'../../..',
	);

	const findings = await findArtifactVersionIncompatibilities({ rootDir });

	assert.deepEqual(findings, []);
});
