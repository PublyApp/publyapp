import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	GENERATED_PROMPT_BATCHES_RELATIVE_DIR,
	normalizeHomepageBatchLabel,
	resolvePromptBatchArchiveFolder,
	writePromptBatchArchive,
} from './prompt-batch-archive.mjs';

const createTempRepoRoot = async () => {
	return mkdtemp(path.join(os.tmpdir(), 'homepage-batch-archive-'));
};

const readJson = async (filePath) => {
	return JSON.parse(await readFile(filePath, 'utf8'));
};

test('normalizeHomepageBatchLabel slugifies user input', () => {
	assert.equal(
		normalizeHomepageBatchLabel('  April 17 Batch  '),
		'april-17-batch',
	);
	assert.equal(
		normalizeHomepageBatchLabel('agency_review__wave'),
		'agency-review-wave',
	);
	assert.throws(
		() => normalizeHomepageBatchLabel('!!!'),
		/Batch label must contain at least one alphanumeric character/i,
	);
});

test('resolvePromptBatchArchiveFolder appends numeric suffixes for collisions', async () => {
	const repoRoot = await createTempRepoRoot();
	const batchesDir = path.join(
		repoRoot,
		GENERATED_PROMPT_BATCHES_RELATIVE_DIR,
	);

	try {
		const first = await resolvePromptBatchArchiveFolder({
			batchesDir,
			batchLabel: 'april-17-batch',
		});

		assert.equal(first, 'april-17-batch');

		await writePromptBatchArchive({
			repoRoot,
			batchLabel: 'april-17-batch',
			archiveFolder: first,
			seed: 'april-17-batch',
			createdAt: '2026-04-17T08:30:00.000Z',
			prompts: [
				{
					fileName: '001-homepage-prompt.md',
					content: '# Prompt 1\n',
				},
			],
			entries: [
				{
					variant: 1,
					generatedHomepageId: 1,
					routePath: '/homepage-gen/1',
					pageFile:
						'apps/front/src/generated/homepage-gen/pages/generated-homepage-0001.tsx',
					promptFile:
						'docs/misc/homepage-factory/generated-prompts/batches/april-17-batch/001-homepage-prompt.md',
					audienceOverlay: 'agencies',
					homepageArchetype: 'comparison-led',
					promiseAngle: 'publish-without-chaos',
					proofStrategy: 'comparison-checklist',
					creativeDirectionBundle: 'product-led-clean',
					selectedReferences: ['https://stripe.com'],
					selectedLibraries: ['https://land-book.com/'],
				},
			],
		});

		const second = await resolvePromptBatchArchiveFolder({
			batchesDir,
			batchLabel: 'april-17-batch',
		});

		assert.equal(second, 'april-17-batch-2');

		const index = await readJson(path.join(batchesDir, 'index.json'));
		assert.equal(index.length, 1);
		assert.equal(index[0].archiveFolder, 'april-17-batch');

		const batchManifest = await readJson(
			path.join(batchesDir, 'april-17-batch', 'manifest.json'),
		);

		assert.equal(batchManifest.batchLabel, 'april-17-batch');
		assert.equal(batchManifest.entries[0].generatedHomepageId, 1);
		assert.equal(
			batchManifest.entries[0].promptFile,
			'docs/misc/homepage-factory/generated-prompts/batches/april-17-batch/001-homepage-prompt.md',
		);
	} finally {
		await rm(repoRoot, { recursive: true, force: true });
	}
});
