import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	allowedFrontendIndexFiles,
	findDisallowedFrontendBarrels,
} from './check-frontend-barrels.mjs';

const writeIndex = async (rootDir, relativePath) => {
	const filePath = path.join(rootDir, relativePath);

	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, 'export const value = true;\n');
};

test('flags hand-written frontend index files that are not allowlisted', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-barrel-test-'),
	);

	await writeIndex(
		rootDir,
		'apps/front/src/components/new-widget/index.ts',
	);

	const result = await findDisallowedFrontendBarrels({ rootDir });

	assert.deepEqual(result, [
		'apps/front/src/components/new-widget/index.ts',
	]);
});

test('allows approved frontend indexes and ignores generated client indexes', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-barrel-test-'),
	);

	for (const relativePath of allowedFrontendIndexFiles) {
		await writeIndex(rootDir, relativePath);
	}

	await writeIndex(rootDir, 'packages/client-ts/src/users/index.ts');

	const result = await findDisallowedFrontendBarrels({ rootDir });

	assert.deepEqual(result, []);
});
