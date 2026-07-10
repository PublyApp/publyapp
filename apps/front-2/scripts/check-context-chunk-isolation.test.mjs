import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	checkContextChunkIsolation,
	findContextFingerprints,
} from './check-context-chunk-isolation.mjs';

const makeFixture = async (files) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'front2-context-guard-'));
	for (const [relativePath, content] of Object.entries(files)) {
		const absolutePath = path.join(root, relativePath);
		await mkdir(path.dirname(absolutePath), { recursive: true });
		await writeFile(absolutePath, content);
	}
	return root;
};

const CONTEXT_SOURCE = `
import { createContext, useContext } from 'react';

export const DemoContext = createContext(null);

export const useDemoContext = () => {
	const context = useContext(DemoContext);
	if (!context) {
		throw new Error('useDemoContext must be used within the demo route');
	}
	return context;
};
`;

test('findContextFingerprints extracts the "must be used within" message for each createContext() call', async () => {
	const root = await makeFixture({
		'src/demo-context.tsx': CONTEXT_SOURCE,
		'src/unrelated.tsx': 'export const noop = () => null;',
	});

	const fingerprints = await findContextFingerprints({
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(fingerprints.length, 1);
	assert.equal(fingerprints[0].file, 'demo-context.tsx');
	assert.equal(
		fingerprints[0].identifyingString,
		'useDemoContext must be used within the demo route',
	);
});

test('passes when the context fingerprint appears in exactly one client chunk', async () => {
	const root = await makeFixture({
		'src/demo-context.tsx': CONTEXT_SOURCE,
		'dist/client/assets/route-a.js':
			'throw new Error("useDemoContext must be used within the demo route")',
		'dist/client/assets/route-b.js': 'console.log("unrelated chunk")',
	});

	const { violations, unfingerprinted } = await checkContextChunkIsolation({
		sourceDir: path.join(root, 'src'),
		distAssetsDir: path.join(root, 'dist', 'client', 'assets'),
	});

	assert.deepEqual(violations, []);
	assert.deepEqual(unfingerprinted, []);
});

test('fails when a duplicated-context fixture puts the fingerprint in two client chunks', async () => {
	const root = await makeFixture({
		'src/demo-context.tsx': CONTEXT_SOURCE,
		// Simulates the real bug: a sibling route module imports the context
		// from the parent route specifier instead of this leaf module, so the
		// bundler duplicates the whole module (and its thrown message) into a
		// second chunk with a second, distinct Context object.
		'dist/client/assets/route-a.js':
			'throw new Error("useDemoContext must be used within the demo route")',
		'dist/client/assets/route-b.js':
			'throw new Error("useDemoContext must be used within the demo route")',
	});

	const { violations } = await checkContextChunkIsolation({
		sourceDir: path.join(root, 'src'),
		distAssetsDir: path.join(root, 'dist', 'client', 'assets'),
	});

	assert.equal(violations.length, 1);
	assert.equal(violations[0].file, 'demo-context.tsx');
	assert.equal(violations[0].chunkCount, 2);
});

test('fails when the fingerprint is missing from every client chunk (module tree-shaken or never bundled)', async () => {
	const root = await makeFixture({
		'src/demo-context.tsx': CONTEXT_SOURCE,
		'dist/client/assets/route-a.js': 'console.log("no context here")',
	});

	const { violations } = await checkContextChunkIsolation({
		sourceDir: path.join(root, 'src'),
		distAssetsDir: path.join(root, 'dist', 'client', 'assets'),
	});

	assert.equal(violations.length, 1);
	assert.equal(violations[0].chunkCount, 0);
});

test('reports createContext() call sites without a "must be used within" message as unfingerprinted, not a silent pass', async () => {
	const root = await makeFixture({
		'src/silent-context.tsx':
			"import { createContext } from 'react';\nexport const SilentContext = createContext(null);\n",
		'dist/client/assets/route-a.js': 'console.log("anything")',
	});

	const { violations, unfingerprinted } = await checkContextChunkIsolation({
		sourceDir: path.join(root, 'src'),
		distAssetsDir: path.join(root, 'dist', 'client', 'assets'),
	});

	assert.deepEqual(violations, []);
	assert.deepEqual(unfingerprinted, ['silent-context.tsx']);
});

test('throws loudly instead of silently passing when the build output is missing', async () => {
	const root = await makeFixture({
		'src/demo-context.tsx': CONTEXT_SOURCE,
	});

	await assert.rejects(
		() =>
			checkContextChunkIsolation({
				sourceDir: path.join(root, 'src'),
				distAssetsDir: path.join(root, 'dist', 'client', 'assets'),
			}),
		/no build output/,
	);
});
