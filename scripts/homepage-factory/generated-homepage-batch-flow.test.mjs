import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from 'node:fs/promises';
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

const pathExists = async (targetPath) => {
	try {
		await access(targetPath);

		return true;
	} catch {
		return false;
	}
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

		const firstPromptPath = path.join(
			artifactRepoRoot,
			'docs/misc/homepage-factory/generated-prompts/batches/april-17-batch/001-homepage-prompt.md',
		);
		const secondPromptPath = path.join(
			artifactRepoRoot,
			'docs/misc/homepage-factory/generated-prompts/batches/april-17-batch-2/001-homepage-prompt.md',
		);
		const firstPromptContent = await readFile(firstPromptPath, 'utf8');
		const secondPromptContent = await readFile(secondPromptPath, 'utf8');

		assert.notEqual(firstPromptContent, secondPromptContent);
		assert.match(firstPromptContent, /Seed:\s+\*\*april-17-batch\*\*/i);
		assert.match(secondPromptContent, /Seed:\s+\*\*april-17-batch-2\*\*/i);

		const secondBatchManifest = await readJson(
			path.join(
				artifactRepoRoot,
				'docs/misc/homepage-factory/generated-prompts/batches/april-17-batch-2/manifest.json',
			),
		);
		assert.equal(secondBatchManifest.seed, 'april-17-batch-2');
		assert.equal(secondBatchManifest.entries[0].seed, 'april-17-batch-2');
	} finally {
		await rm(artifactRepoRoot, { recursive: true, force: true });
	}
});

test('generateHomepageBatch rolls back generated homepage artifacts when archive writing fails', async () => {
	const artifactRepoRoot = await createTempRepoRoot();

	try {
		await generateHomepageBatch({
			sourceRepoRoot: path.resolve('.'),
			artifactRepoRoot,
			variants: 1,
			batchLabel: 'Stable Batch',
			now: () => '2026-04-17T09:15:00.000Z',
		});

		const runtimeManifestPath = path.join(
			artifactRepoRoot,
			'apps/front/src/generated/homepage-gen/manifest.json',
		);
		const baselineManifest = await readFile(runtimeManifestPath, 'utf8');

		await assert.rejects(() => {
			return generateHomepageBatch({
				sourceRepoRoot: path.resolve('.'),
				artifactRepoRoot,
				variants: 1,
				batchLabel: 'Rollback Batch',
				now: () => '2026-04-17T10:00:00.000Z',
				writePromptBatchArchiveImpl: async () => {
					throw new Error('archive write failed');
				},
			});
		}, /archive write failed/i);

		assert.equal(await readFile(runtimeManifestPath, 'utf8'), baselineManifest);
		assert.equal(
			await pathExists(
				path.join(
					artifactRepoRoot,
					'apps/front/src/generated/homepage-gen/pages/generated-homepage-0002.tsx',
				),
			),
			false,
		);
		assert.equal(
			await pathExists(
				path.join(
					artifactRepoRoot,
					'docs/misc/homepage-factory/generated-prompts/batches/rollback-batch',
				),
			),
			false,
		);

		const batchIndex = await readJson(
			path.join(
				artifactRepoRoot,
				'docs/misc/homepage-factory/generated-prompts/batches/index.json',
			),
		);
		assert.equal(batchIndex.length, 1);
		assert.equal(batchIndex[0].archiveFolder, 'stable-batch');
	} finally {
		await rm(artifactRepoRoot, { recursive: true, force: true });
	}
});

test('generateHomepageBatch rolls back generated homepage artifacts when page preparation partially writes before failing', async () => {
	const artifactRepoRoot = await createTempRepoRoot();

	try {
		await generateHomepageBatch({
			sourceRepoRoot: path.resolve('.'),
			artifactRepoRoot,
			variants: 1,
			batchLabel: 'Stable Batch',
			now: () => '2026-04-17T09:15:00.000Z',
		});

		const runtimeManifestPath = path.join(
			artifactRepoRoot,
			'apps/front/src/generated/homepage-gen/manifest.json',
		);
		const pagesDir = path.join(
			artifactRepoRoot,
			'apps/front/src/generated/homepage-gen/pages',
		);
		const baselineManifest = await readFile(runtimeManifestPath, 'utf8');

		await assert.rejects(() => {
			return generateHomepageBatch({
				sourceRepoRoot: path.resolve('.'),
				artifactRepoRoot,
				variants: 1,
				batchLabel: 'Prepare Rollback Batch',
				now: () => '2026-04-17T10:00:00.000Z',
				prepareGeneratedHomepageBatchImpl: async () => {
					await mkdir(pagesDir, { recursive: true });
					await writeFile(
						path.join(pagesDir, 'generated-homepage-0002.tsx'),
						'// leaked page\n',
						'utf8',
					);
					await writeFile(
						runtimeManifestPath,
						JSON.stringify(
							[
								...JSON.parse(baselineManifest),
								{
									id: 2,
									title: 'Generated Homepage 2',
									fileName: 'generated-homepage-0002.tsx',
									routePath: '/homepage-gen/2',
									batchLabel: 'prepare-rollback-batch',
									createdAt: '2026-04-17T10:00:00.000Z',
								},
							],
							null,
							2,
						),
						'utf8',
					);

					throw new Error('prepare write failed');
				},
			});
		}, /prepare write failed/i);

		assert.equal(await readFile(runtimeManifestPath, 'utf8'), baselineManifest);
		assert.equal(
			await pathExists(path.join(pagesDir, 'generated-homepage-0002.tsx')),
			false,
		);
		assert.equal(
			await pathExists(
				path.join(
					artifactRepoRoot,
					'docs/misc/homepage-factory/generated-prompts/batches/prepare-rollback-batch',
				),
			),
			false,
		);
	} finally {
		await rm(artifactRepoRoot, { recursive: true, force: true });
	}
});

test('generateHomepageBatch removes partial archive artifacts and restores the batch index when archive writing fails mid-write', async () => {
	const artifactRepoRoot = await createTempRepoRoot();

	try {
		await generateHomepageBatch({
			sourceRepoRoot: path.resolve('.'),
			artifactRepoRoot,
			variants: 1,
			batchLabel: 'Stable Batch',
			now: () => '2026-04-17T09:15:00.000Z',
		});

		const runtimeManifestPath = path.join(
			artifactRepoRoot,
			'apps/front/src/generated/homepage-gen/manifest.json',
		);
		const baselineManifest = await readFile(runtimeManifestPath, 'utf8');
		const batchIndexPath = path.join(
			artifactRepoRoot,
			'docs/misc/homepage-factory/generated-prompts/batches/index.json',
		);
		const baselineIndex = await readFile(batchIndexPath, 'utf8');

		await assert.rejects(() => {
			return generateHomepageBatch({
				sourceRepoRoot: path.resolve('.'),
				artifactRepoRoot,
				variants: 1,
				batchLabel: 'Archive Rollback Batch',
				now: () => '2026-04-17T10:00:00.000Z',
				writePromptBatchArchiveImpl: async ({
					repoRoot,
					archiveFolder,
					entries,
					prompts,
				}) => {
					const batchDir = path.join(
						repoRoot,
						'docs/misc/homepage-factory/generated-prompts/batches',
						archiveFolder,
					);

					await mkdir(batchDir, { recursive: true });
					await writeFile(
						path.join(batchDir, prompts[0].fileName),
						prompts[0].content,
						'utf8',
					);
					await writeFile(
						path.join(batchDir, 'manifest.json'),
						JSON.stringify({ entries }, null, 2),
						'utf8',
					);
					await writeFile(
						batchIndexPath,
						JSON.stringify(
							[
								...JSON.parse(baselineIndex),
								{ archiveFolder, entryIds: entries.map((entry) => entry.id) },
							],
							null,
							2,
						),
						'utf8',
					);

					throw new Error('archive mid-write failed');
				},
			});
		}, /archive mid-write failed/i);

		assert.equal(await readFile(runtimeManifestPath, 'utf8'), baselineManifest);
		assert.equal(await readFile(batchIndexPath, 'utf8'), baselineIndex);
		assert.equal(
			await pathExists(
				path.join(
					artifactRepoRoot,
					'docs/misc/homepage-factory/generated-prompts/batches/archive-rollback-batch',
				),
			),
			false,
		);
		assert.equal(
			await pathExists(
				path.join(
					artifactRepoRoot,
					'apps/front/src/generated/homepage-gen/pages/generated-homepage-0002.tsx',
				),
			),
			false,
		);
	} finally {
		await rm(artifactRepoRoot, { recursive: true, force: true });
	}
});

test('generateHomepageBatch leaves no empty flow directories behind after a failed first run', async () => {
	const artifactRepoRoot = await createTempRepoRoot();

	try {
		const batchIndexPath = path.join(
			artifactRepoRoot,
			'docs/misc/homepage-factory/generated-prompts/batches/index.json',
		);

		await assert.rejects(() => {
			return generateHomepageBatch({
				sourceRepoRoot: path.resolve('.'),
				artifactRepoRoot,
				variants: 1,
				batchLabel: 'Clean Rollback Batch',
				now: () => '2026-04-17T10:00:00.000Z',
				writePromptBatchArchiveImpl: async ({
					repoRoot,
					archiveFolder,
					entries,
					prompts,
				}) => {
					const batchDir = path.join(
						repoRoot,
						'docs/misc/homepage-factory/generated-prompts/batches',
						archiveFolder,
					);

					await mkdir(batchDir, { recursive: true });
					await writeFile(
						path.join(batchDir, prompts[0].fileName),
						prompts[0].content,
						'utf8',
					);
					await writeFile(
						batchIndexPath,
						JSON.stringify(
							[{ archiveFolder, entryIds: entries.map((entry) => entry.id) }],
							null,
							2,
						),
						'utf8',
					);

					throw new Error('clean first-run archive failure');
				},
			});
		}, /clean first-run archive failure/i);

		assert.equal(
			await pathExists(
				path.join(artifactRepoRoot, 'apps/front/src/generated/homepage-gen'),
			),
			false,
		);
		assert.equal(
			await pathExists(
				path.join(
					artifactRepoRoot,
					'docs/misc/homepage-factory/generated-prompts/batches',
				),
			),
			false,
		);
	} finally {
		await rm(artifactRepoRoot, { recursive: true, force: true });
	}
});

test('generateHomepageBatch does not create flow directories when validation fails before archive resolution on a clean repo', async () => {
	const artifactRepoRoot = await createTempRepoRoot();

	try {
		await assert.rejects(() => {
			return generateHomepageBatch({
				sourceRepoRoot: path.resolve('.'),
				artifactRepoRoot,
				variants: 0,
				batchLabel: 'Invalid Batch',
				now: () => '2026-04-17T10:00:00.000Z',
			});
		}, /variants must be an integer between 1 and 200/i);

		assert.equal(
			await pathExists(
				path.join(
					artifactRepoRoot,
					'docs/misc/homepage-factory/generated-prompts/batches',
				),
			),
			false,
		);
		assert.equal(
			await pathExists(
				path.join(artifactRepoRoot, 'apps/front/src/generated/homepage-gen'),
			),
			false,
		);
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

test('generate-homepage-batch CLI rejects malformed variant counts', async () => {
	const artifactRepoRoot = await createTempRepoRoot();

	try {
		await assert.rejects(
			execFileAsync(
				process.execPath,
				['scripts/generate-homepage-batch.mjs', '2oops', 'April 17 Batch'],
				{
					cwd: path.resolve('.'),
					env: {
						...process.env,
						GENERATED_HOMEPAGE_REPO_ROOT: artifactRepoRoot,
					},
				},
			),
			(error) => {
				assert.match(
					error.stderr,
					/Variants must be an integer between 1 and 200\./i,
				);

				return true;
			},
		);
	} finally {
		await rm(artifactRepoRoot, { recursive: true, force: true });
	}
});
