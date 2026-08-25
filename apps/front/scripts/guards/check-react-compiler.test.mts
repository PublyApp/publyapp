import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
	COMPILED_FLOOR,
	MEMO_CACHE_COMPARE_PATTERN,
	MEMO_CACHE_SENTINEL,
	MEASURED_BASELINE,
	RUNTIME_CHUNK_PATTERN,
	analyzeClientBundle,
	assertCompiledArtifacts,
	collectClientJsFiles,
} from './check-react-compiler.mts';

const makeFixtureDir = () =>
	mkdtempSync(path.join(tmpdir(), 'react-compiler-guard-'));

const writeAsset = (dir: string, name: string, contents = ''): void => {
	writeFileSync(path.join(dir, name), contents);
};

const writeCompiledAsset = (
	dir: string,
	name: string,
	importsRuntime = true,
): void => {
	const runtimeImport = importsRuntime
		? `import{c as useMemoCache}from"./compiler-runtime-ABC123.js";`
		: '';
	writeAsset(
		dir,
		name,
		`${runtimeImport}x===Symbol.for("${MEMO_CACHE_SENTINEL}");`,
	);
};

const fixtureRoots: string[] = [];

after(() => {
	for (const dir of fixtureRoots) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const ownedFixture = () => {
	const dir = makeFixtureDir();
	fixtureRoots.push(dir);
	mkdirSync(path.join(dir, 'assets'), { recursive: true });
	return path.join(dir, 'assets');
};

test('runtime chunk pattern matches hashed compiler-runtime chunks only', () => {
	assert.equal(
		RUNTIME_CHUNK_PATTERN.test('compiler-runtime-CNG2r3iR.js'),
		true,
	);
	assert.equal(RUNTIME_CHUNK_PATTERN.test('compiler-runtime.js'), false);
	assert.equal(
		RUNTIME_CHUNK_PATTERN.test('rolldown-runtime-CNC7AqOf.js'),
		false,
	);
});

test('a healthy build passes: runtime chunk plus enough compiled modules', () => {
	const assets = ownedFixture();
	writeAsset(
		assets,
		'compiler-runtime-ABC123.js',
		'export const c = () => {};',
	);
	writeCompiledAsset(assets, 'page-one.js');
	writeCompiledAsset(assets, 'page-two.js');
	writeAsset(assets, 'unrelated-vendor.js', 'console.log("hi");');

	const analysis = analyzeClientBundle(assets);
	assert.equal(analysis.found, true);
	assert.equal(analysis.runtimeChunk, 'compiler-runtime-ABC123.js');
	// found === true always carries compiledFiles (see analyzeClientBundle);
	// the fallback only satisfies the optional-field type.
	const compiledFiles = analysis.compiledFiles ?? [];
	assert.deepEqual(compiledFiles.sort(), [
		'page-one.js',
		'page-two.js',
	]);
	assert.equal(assertCompiledArtifacts(analysis, 1), null);
});

test('annotation mode with zero annotations is caught via MISSING_RUNTIME', () => {
	// What the built output looks like when the compiler runs in annotation
	// mode and no module declares `"use memo"`: nothing is compiled, so no
	// module imports the runtime and rolldown drops the runtime chunk too.
	// React's own chunk still DEFINES the sentinel symbol — the compare-form
	// pattern must not mistake that definition for compiled code (observed
	// live on the #1234 adversarial build).
	const assets = ownedFixture();
	writeAsset(
		assets,
		'react-vendor.js',
		'ie=Symbol.for(`react.memo_cache_sentinel`);',
	);
	writeAsset(assets, 'page-one.js', 'console.log("not compiled");');

	const analysis = analyzeClientBundle(assets);
	assert.equal(analysis.found, true);
	assert.equal(analysis.runtimeChunk, null);
	assert.equal(analysis.compiledCount, 0);
	assert.equal(assertCompiledArtifacts(analysis, 1000), 'MISSING_RUNTIME');
});

test('the compare pattern matches real compiled cache slots only', () => {
	assert.equal(
		MEMO_CACHE_COMPARE_PATTERN.test(
			'e[0]===Symbol.for(`react.memo_cache_sentinel`)?',
		),
		true,
	);
	assert.equal(
		MEMO_CACHE_COMPARE_PATTERN.test('x==="react.memo_cache_sentinel"'),
		false,
	);
	assert.equal(
		MEMO_CACHE_COMPARE_PATTERN.test(
			'ie=Symbol.for(`react.memo_cache_sentinel`)',
		),
		false,
	);
});

test('a vanished dist is caught via MISSING_DIST', () => {
	const missing = path.join(makeFixtureDir(), 'does-not-exist');
	fixtureRoots.push(missing);
	const analysis = analyzeClientBundle(path.join(missing, 'assets'));
	assert.equal(analysis.found, false);
	assert.equal(assertCompiledArtifacts(analysis, 1), 'MISSING_DIST');
});

test('a runtime chunk with zero compiled modules is caught', () => {
	const assets = ownedFixture();
	writeAsset(
		assets,
		'compiler-runtime-ABC123.js',
		'export const c = () => {};',
	);
	writeAsset(assets, 'vendor.js', 'console.log("plain");');

	const analysis = analyzeClientBundle(assets);
	assert.equal(assertCompiledArtifacts(analysis, 5), 'NO_COMPILED_MODULES');
});

test('a compile-count collapse below the floor is caught', () => {
	const assets = ownedFixture();
	writeAsset(
		assets,
		'compiler-runtime-ABC123.js',
		'export const c = () => {};',
	);
	writeCompiledAsset(assets, 'only-survivor.js');

	const analysis = analyzeClientBundle(assets);
	assert.equal(assertCompiledArtifacts(analysis, 2), 'BELOW_FLOOR');
	assert.equal(assertCompiledArtifacts(analysis, 1), null);
});

test('the pinned floor is exactly 80 percent of the measured baseline', () => {
	assert.ok(Number.isInteger(MEASURED_BASELINE));
	assert.ok(MEASURED_BASELINE > 0, 'baseline must be a real measurement');
	assert.equal(COMPILED_FLOOR, Math.floor(MEASURED_BASELINE * 0.8));
	assert.ok(COMPILED_FLOOR > 0);
});

test('collectClientJsFiles reports missing directories as null', () => {
	const missing = path.join(makeFixtureDir(), 'nope');
	fixtureRoots.push(missing);
	assert.equal(collectClientJsFiles(missing), null);
});
