import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
	buildGeneratedHomepageComponentFileName,
	buildGeneratedHomepageRoutePath,
	prepareGeneratedHomepageBatch,
} from './generated-homepage-batches.mjs';

const execFileAsync = promisify(execFile);

const createTempRepoRoot = async () => {
	return mkdtemp(path.join(os.tmpdir(), 'generated-homepages-'));
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
	const raw = await readFile(filePath, 'utf8');

	return JSON.parse(raw);
};

test('prepareGeneratedHomepageBatch creates append-only generated homepage slots', async () => {
	const repoRoot = await createTempRepoRoot();

	try {
		const result = await prepareGeneratedHomepageBatch({
			repoRoot,
			variants: 2,
			batchLabel: 'first-batch',
			now: () => '2026-04-16T08:30:00.000Z',
		});

		assert.equal(result.createdEntries.length, 2);
		assert.deepEqual(
			result.createdEntries.map((entry) => entry.id),
			[1, 2],
		);
		assert.deepEqual(
			result.createdEntries.map((entry) => entry.routePath),
			['/homepage-gen/1', '/homepage-gen/2'],
		);

		const manifest = await readJson(
			path.join(
				repoRoot,
				'apps/front/src/generated/homepage-gen/manifest.json',
			),
		);

		assert.equal(manifest.length, 2);
		assert.equal(manifest[0].fileName, 'generated-homepage-0001.tsx');
		assert.equal(manifest[1].fileName, 'generated-homepage-0002.tsx');
		assert.equal(manifest[0].batchLabel, 'first-batch');

		const firstPageContent = await readFile(
			path.join(
				repoRoot,
				'apps/front/src/generated/homepage-gen/pages/generated-homepage-0001.tsx',
			),
			'utf8',
		);

		assert.match(firstPageContent, /GeneratedHomepage0001Page/);
		assert.match(firstPageContent, /route: \/homepage-gen\/1/i);
	} finally {
		await rm(repoRoot, { recursive: true, force: true });
	}
});

test('prepareGeneratedHomepageBatch appends new pages without overwriting older generated files', async () => {
	const repoRoot = await createTempRepoRoot();

	try {
		await prepareGeneratedHomepageBatch({
			repoRoot,
			variants: 1,
			batchLabel: 'first-batch',
			now: () => '2026-04-16T08:30:00.000Z',
		});

		const firstPagePath = path.join(
			repoRoot,
			'apps/front/src/generated/homepage-gen/pages/generated-homepage-0001.tsx',
		);

		await writeFile(
			firstPagePath,
			'// preserved custom implementation\nexport default function PreservedHomepage() { return null; }\n',
			'utf8',
		);

		const result = await prepareGeneratedHomepageBatch({
			repoRoot,
			variants: 2,
			batchLabel: 'second-batch',
			now: () => '2026-04-16T09:00:00.000Z',
		});

		assert.deepEqual(
			result.createdEntries.map((entry) => entry.id),
			[2, 3],
		);

		const firstPageContent = await readFile(firstPagePath, 'utf8');
		assert.match(firstPageContent, /preserved custom implementation/i);

		const manifest = await readJson(
			path.join(
				repoRoot,
				'apps/front/src/generated/homepage-gen/manifest.json',
			),
		);

		assert.equal(manifest.length, 3);
		assert.deepEqual(
			manifest.map((entry) => entry.id),
			[1, 2, 3],
		);
		assert.equal(manifest[0].batchLabel, 'first-batch');
		assert.equal(manifest[2].batchLabel, 'second-batch');
	} finally {
		await rm(repoRoot, { recursive: true, force: true });
	}
});

test('prepareGeneratedHomepageBatch rejects invalid batch sizes', async () => {
	const repoRoot = await createTempRepoRoot();

	try {
		await assert.rejects(() => {
			return prepareGeneratedHomepageBatch({
				repoRoot,
				variants: 0,
			});
		}, /variants must be an integer between 1 and 200/i);

		await assert.rejects(() => {
			return prepareGeneratedHomepageBatch({
				repoRoot,
				variants: 1.5,
			});
		}, /variants must be an integer between 1 and 200/i);
	} finally {
		await rm(repoRoot, { recursive: true, force: true });
	}
});

test('generated homepage helpers produce stable file names and route paths', () => {
	assert.equal(
		buildGeneratedHomepageComponentFileName(7),
		'generated-homepage-0007.tsx',
	);
	assert.equal(buildGeneratedHomepageRoutePath(7), '/homepage-gen/7');
});

test('prepare-generated-homepages CLI scaffolds route-ready homepage slots', async () => {
	const repoRoot = await createTempRepoRoot();

	try {
		const { stdout } = await execFileAsync(
			process.execPath,
			['scripts/prepare-generated-homepages.mjs', '2', 'cli-batch'],
			{
				cwd: path.resolve('.'),
				env: {
					...process.env,
					GENERATED_HOMEPAGE_REPO_ROOT: repoRoot,
				},
			},
		);

		assert.match(
			stdout,
			/Prepared 2 generated homepage slots in apps[\\/]+front[\\/]+src[\\/]+generated[\\/]+homepage-gen[\\/]+pages/,
		);
		assert.match(stdout, /\/homepage-gen\/1/);
		assert.match(stdout, /generated-homepage-0002\.tsx/);
		assert.equal(
			await pathExists(
				path.join(
					repoRoot,
					'apps/front/src/generated/homepage-gen/manifest.json',
				),
			),
			true,
		);
	} finally {
		await rm(repoRoot, { recursive: true, force: true });
	}
});
