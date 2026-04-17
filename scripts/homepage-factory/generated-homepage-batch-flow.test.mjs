import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { promisify } from 'node:util';

import { generateHomepageBatch } from './generated-homepage-batch-flow.mjs';

const execFileAsync = promisify(execFile);

const createTempRepoRoot = async () => {
	return mkdtemp(path.join(os.tmpdir(), 'homepage-batch-flow-'));
};

const readJson = async (filePath) => {
	return JSON.parse(await readFile(filePath, 'utf8'));
};

test('generateHomepageBatch creates page slots, prompt archive, and combined batch manifest', async () => {
	const artifactRepoRoot = await createTempRepoRoot();

	try {
		const result = await generateHomepageBatch({
			sourceRepoRoot: path.resolve('.'),
			artifactRepoRoot,
			variants: 2,
			batchLabel: 'April 17 Batch',
			now: () => '2026-04-17T09:15:00.000Z',
		});

		assert.equal(result.batchLabel, 'april-17-batch');
		assert.equal(result.archiveFolder, 'april-17-batch');
		assert.equal(result.entries.length, 2);
		assert.equal(result.entries[0].id, 1);
		assert.equal(result.entries[0].generatedHomepageId, 1);
		assert.equal(result.entries[0].routePath, '/homepage-gen/1');
		assert.equal(
			result.entries[0].pageFile,
			'apps/front/src/generated/homepage-gen/pages/generated-homepage-0001.tsx',
		);
		assert.equal(
			result.entries[0].promptFile,
			'docs/misc/homepage-factory/generated-prompts/batches/april-17-batch/001-homepage-prompt.md',
		);

		const runtimeManifest = await readJson(
			path.join(
				artifactRepoRoot,
				'apps/front/src/generated/homepage-gen/manifest.json',
			),
		);
		assert.deepEqual(
			runtimeManifest.map((entry) => entry.id),
			[1, 2],
		);

		const batchManifest = await readJson(
			path.join(
				artifactRepoRoot,
				'docs/misc/homepage-factory/generated-prompts/batches/april-17-batch/manifest.json',
			),
		);
		assert.equal(batchManifest.entries.length, 2);
		assert.equal(batchManifest.entries[1].id, 2);
		assert.equal(batchManifest.entries[1].generatedHomepageId, 2);

		const batchIndex = await readJson(
			path.join(
				artifactRepoRoot,
				'docs/misc/homepage-factory/generated-prompts/batches/index.json',
			),
		);
		assert.equal(batchIndex.length, 1);
		assert.equal(batchIndex[0].archiveFolder, 'april-17-batch');
		assert.deepEqual(batchIndex[0].entryIds, [1, 2]);
	} finally {
		await rm(artifactRepoRoot, { recursive: true, force: true });
	}
});

test('generateHomepageBatch reuses the normalized label but allocates a unique archive folder on collision', async () => {
	const artifactRepoRoot = await createTempRepoRoot();

	try {
		const first = await generateHomepageBatch({
			sourceRepoRoot: path.resolve('.'),
			artifactRepoRoot,
			variants: 1,
			batchLabel: 'April 17 Batch',
			now: () => '2026-04-17T09:15:00.000Z',
		});
		const second = await generateHomepageBatch({
			sourceRepoRoot: path.resolve('.'),
			artifactRepoRoot,
			variants: 1,
			batchLabel: 'April 17 Batch',
			now: () => '2026-04-17T10:00:00.000Z',
		});

		assert.equal(first.batchLabel, 'april-17-batch');
		assert.equal(first.archiveFolder, 'april-17-batch');
		assert.equal(second.batchLabel, 'april-17-batch');
		assert.equal(second.archiveFolder, 'april-17-batch-2');
		assert.equal(second.entries[0].generatedHomepageId, 2);
	} finally {
		await rm(artifactRepoRoot, { recursive: true, force: true });
	}
});

test('generate-homepage-batch CLI prints route to page to prompt mapping', async () => {
	const artifactRepoRoot = await createTempRepoRoot();

	try {
		const { stdout } = await execFileAsync(
			process.execPath,
			['scripts/generate-homepage-batch.mjs', '2', 'April 17 Batch'],
			{
				cwd: path.resolve('.'),
				env: {
					...process.env,
					GENERATED_HOMEPAGE_REPO_ROOT: artifactRepoRoot,
				},
			},
		);

		assert.match(
			stdout,
			/Generated homepage batch "april-17-batch" with 2 variants/i,
		);
		assert.match(stdout, /\/homepage-gen\/1/i);
		assert.match(stdout, /generated-homepage-0002\.tsx/i);
		assert.match(stdout, /001-homepage-prompt\.md/i);
	} finally {
		await rm(artifactRepoRoot, { recursive: true, force: true });
	}
});
