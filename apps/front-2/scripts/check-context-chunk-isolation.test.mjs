import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	checkContextChunkIsolation,
	findContextFingerprints,
} from './check-context-chunk-isolation.mjs';

const scriptPath = fileURLToPath(
	new URL('./check-context-chunk-isolation.mjs', import.meta.url),
);
const repoSourceDir = fileURLToPath(new URL('../src', import.meta.url));

const makeFixture = async (files) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'front2-context-guard-'));
	for (const [relativePath, content] of Object.entries(files)) {
		const absolutePath = path.join(root, relativePath);
		await mkdir(path.dirname(absolutePath), { recursive: true });
		await writeFile(absolutePath, content);
	}
	return root;
};

const runCli = (root) =>
	spawnSync(process.execPath, [scriptPath], {
		encoding: 'utf8',
		env: {
			...process.env,
			CONTEXT_CHUNK_ISOLATION_SOURCE_DIR: path.join(root, 'src'),
			CONTEXT_CHUNK_ISOLATION_DIST_DIR: path.join(
				root,
				'dist',
				'client',
				'assets',
			),
		},
	});

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

// The real bug: the repo's only context is declared with a type argument
// (createContext<T>(...)), which the pre-fix `source.includes('createContext(')`
// check never matched. This fixture is the shape that must be caught.
const GENERIC_CONTEXT_SOURCE = `
import { createContext, useContext } from 'react';

export const DemoContext = createContext<string | null>(null);

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

test('findContextFingerprints detects createContext<T>(...) with a generic type argument', async () => {
	const root = await makeFixture({
		'src/demo-context.tsx': GENERIC_CONTEXT_SOURCE,
	});

	const fingerprints = await findContextFingerprints({
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(fingerprints.length, 1);
	assert.equal(
		fingerprints[0].identifyingString,
		'useDemoContext must be used within the demo route',
	);
});

test('findContextFingerprints matches nested generics, unions, and mangled spacing, but not createContext-lookalike identifiers', async () => {
	const root = await makeFixture({
		'src/a.tsx': 'createContext(null);',
		'src/b.tsx': 'createContext<Foo | null>(null);',
		'src/c.tsx': 'createContext<Foo<Bar> | null>(null);',
		'src/d.tsx': 'createContext < Foo > (null);',
		'src/e.tsx': 'React.createContext<Foo>(null);',
		'src/f.tsx':
			'useCreateContext(foo);\nmyCreateContext(bar);\ncreateContextValue(baz);',
	});

	const fingerprints = await findContextFingerprints({
		sourceDir: path.join(root, 'src'),
	});

	const files = fingerprints.map((fingerprint) => fingerprint.file).sort();
	assert.deepEqual(files, ['a.tsx', 'b.tsx', 'c.tsx', 'd.tsx', 'e.tsx']);
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

test('fails when a duplicated generic-typed context fixture puts the fingerprint in two client chunks (the regression this packet fixes)', async () => {
	const root = await makeFixture({
		'src/demo-context.tsx': GENERIC_CONTEXT_SOURCE,
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

test('passes when the generic-typed context fixture has exactly one chunk', async () => {
	const root = await makeFixture({
		'src/demo-context.tsx': GENERIC_CONTEXT_SOURCE,
		'dist/client/assets/route-a.js':
			'throw new Error("useDemoContext must be used within the demo route")',
	});

	const { violations, unfingerprinted } = await checkContextChunkIsolation({
		sourceDir: path.join(root, 'src'),
		distAssetsDir: path.join(root, 'dist', 'client', 'assets'),
	});

	assert.deepEqual(violations, []);
	assert.deepEqual(unfingerprinted, []);
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

test('throws when zero contexts are discovered under sourceDir, instead of silently passing', async () => {
	const root = await makeFixture({
		'src/unrelated.tsx': 'export const noop = () => null;',
		'dist/client/assets/route-a.js': 'console.log("nothing")',
	});

	await assert.rejects(
		() =>
			checkContextChunkIsolation({
				sourceDir: path.join(root, 'src'),
				distAssetsDir: path.join(root, 'dist', 'client', 'assets'),
			}),
		/found zero createContext/,
	);
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

test('CLI exits non-zero when a duplicated generic-typed context is planted in the build output', async () => {
	const root = await makeFixture({
		'src/demo-context.tsx': GENERIC_CONTEXT_SOURCE,
		'dist/client/assets/route-a.js':
			'throw new Error("useDemoContext must be used within the demo route")',
		'dist/client/assets/route-b.js':
			'throw new Error("useDemoContext must be used within the demo route")',
	});

	const result = runCli(root);

	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /found in 2 client chunk/);
});

test('CLI exits zero when the generic-typed context fixture has exactly one chunk', async () => {
	const root = await makeFixture({
		'src/demo-context.tsx': GENERIC_CONTEXT_SOURCE,
		'dist/client/assets/route-a.js':
			'throw new Error("useDemoContext must be used within the demo route")',
	});

	const result = runCli(root);

	assert.equal(result.status, 0);
});

test('CLI exits non-zero when an unfingerprinted createContext() call is discovered', async () => {
	const root = await makeFixture({
		'src/silent-context.tsx':
			"import { createContext } from 'react';\nexport const SilentContext = createContext(null);\n",
		'dist/client/assets/route-a.js': 'console.log("anything")',
	});

	const result = runCli(root);

	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /cannot fingerprint/);
});

test('CLI exits non-zero when zero contexts are discovered under sourceDir', async () => {
	const root = await makeFixture({
		'src/unrelated.tsx': 'export const noop = () => null;',
		'dist/client/assets/route-a.js': 'console.log("nothing")',
	});

	const result = runCli(root);

	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /found zero createContext/);
});

test('findContextFingerprints run over the real repository src/ finds exactly the contexts that exist today', async () => {
	// Hardcoding today's count (1) and its fingerprint is deliberate: this
	// test exists so that adding a second React context to the real
	// codebase forces this assertion to fail, so whoever adds it has to
	// think about chunk isolation instead of silently growing an
	// unguarded blind spot.
	const fingerprints = await findContextFingerprints({
		sourceDir: repoSourceDir,
	});

	assert.equal(fingerprints.length, 1);
	assert.equal(
		fingerprints[0].file,
		'routes/authed/staff/staff-users/$userId/_overview-context.tsx',
	);
	assert.equal(
		fingerprints[0].identifyingString,
		'useStaffUserOverviewContext must be used within the staff user detail route',
	);
});
