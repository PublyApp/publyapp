import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'os';

import { test } from 'vitest';

import {
	computeProductionStats,
	findOffendingPairs,
	readReferenceFromBase,
	verifyJscpdRatchet,
} from './check-jscpd.ts';

// ---------------------------------------------------------------------------
// computeProductionStats unit tests
// ---------------------------------------------------------------------------

test('empty array gives zero stats', () => {
	const r = computeProductionStats([]);
	assert.equal(r.pairCount, 0);
	assert.equal(r.pairLines, 0);
	assert.equal(r.autoCount, 0);
	assert.equal(r.autoLines, 0);
});

test('production pair is counted and lines summed', () => {
	const dupes = [
		{
			firstFile: { name: 'apps/api/Modules/Auth/Services/Svc.cs' },
			secondFile: { name: 'apps/api/Modules/Users/Services/Svc.cs' },
			lines: 50,
		},
	];
	const r = computeProductionStats(dupes);
	assert.equal(r.pairCount, 1);
	assert.equal(r.pairLines, 50);
});

test('same pair reported twice is one pair but every fragment counts', () => {
	const dupes = [
		{
			firstFile: { name: 'apps/api/SvcA.cs' },
			secondFile: { name: 'apps/api/SvcB.cs' },
			lines: 30,
		},
		{
			firstFile: { name: 'apps/api/SvcB.cs' },
			secondFile: { name: 'apps/api/SvcA.cs' },
			lines: 40,
		},
	];
	const r = computeProductionStats(dupes);
	assert.equal(r.pairCount, 1);
	// #1821-r2: growth INSIDE an already-paired pair must move the metric. A
	// "first fragment wins" count made a newly added identical block between
	// two already-paired files invisible — the exact accumulation pattern the
	// ratchet exists to stop. Every jscpd fragment now adds its lines.
	assert.equal(r.pairLines, 70);
	assert.equal(r.topPairs[0].fragments, 2);
});

test('production self-duplication is counted', () => {
	const dupes = [
		{
			firstFile: { name: 'apps/api/Modules/Invitations/Services/InvSvc.cs' },
			secondFile: { name: 'apps/api/Modules/Invitations/Services/InvSvc.cs' },
			lines: 60,
		},
	];
	const r = computeProductionStats(dupes);
	assert.equal(r.autoCount, 1);
	assert.equal(r.autoLines, 60);
});

test('self-duplication fragments sum per file (growth stays visible)', () => {
	const dupes = [
		{
			firstFile: { name: 'apps/api/Module/Svc.cs' },
			secondFile: { name: 'apps/api/Module/Svc.cs' },
			lines: 20,
		},
		{
			firstFile: { name: 'apps/api/Module/Svc.cs' },
			secondFile: { name: 'apps/api/Module/Svc.cs' },
			lines: 80,
		},
	];
	const r = computeProductionStats(dupes);
	assert.equal(r.autoCount, 1);
	// #1821-r2: every self-dup fragment counts. A "max fragment wins" count
	// hid a second identical block added to an already-self-duplicated file.
	assert.equal(r.autoLines, 100);
});

test('spec files are excluded from production pairs', () => {
	const dupes = [
		{
			firstFile: { name: 'apps/api/Svc.cs' },
			secondFile: { name: 'apps/api/Svc.test.ts' },
			lines: 50,
		},
	];
	const r = computeProductionStats(dupes);
	assert.equal(r.pairCount, 0);
	assert.equal(r.pairLines, 0);
});

test('C# Spec.cs files are excluded from production pairs', () => {
	// *.Spec.cs is the repo's standard C# test suffix. #1821-r2: a C# spec
	// side must never count as production — it belongs to the reported,
	// non-gating spec surface.
	const dupes = [
		{
			firstFile: { name: 'apps/api/Svc.cs' },
			secondFile: { name: 'apps/api/Svc.Spec.cs' },
			lines: 50,
		},
	];
	const r = computeProductionStats(dupes);
	assert.equal(r.pairCount, 0);
	assert.equal(r.pairLines, 0);
	assert.equal(r.specPairCount, 1);
	assert.equal(r.specPairLines, 50);
});

test('C# Tests.cs and g.cs files are excluded from production pairs', () => {
	const dupes = [
		{
			firstFile: { name: 'apps/api/A.cs' },
			secondFile: { name: 'apps/api/A.Tests.cs' },
			lines: 40,
		},
		{
			firstFile: { name: 'apps/api/B.cs' },
			secondFile: { name: 'apps/api/B.g.cs' },
			lines: 30,
		},
	];
	const r = computeProductionStats(dupes);
	assert.equal(r.pairCount, 0);
	assert.equal(r.specPairCount, 2);
});

test('C# spec self-duplication is reported but never gated', () => {
	const dupes = [
		{
			firstFile: { name: 'apps/api/Svc.Spec.cs' },
			secondFile: { name: 'apps/api/Svc.Spec.cs' },
			lines: 90,
		},
	];
	const r = computeProductionStats(dupes);
	assert.equal(r.autoCount, 0);
	assert.equal(r.autoLines, 0);
	assert.equal(r.specAutoCount, 1);
	assert.equal(r.specAutoLines, 90);
});

test('TS test self-duplication under a production path is reported, not gated', () => {
	const dupes = [
		{
			firstFile: { name: 'apps/front/src/components/ui/x.test.tsx' },
			secondFile: { name: 'apps/front/src/components/ui/x.test.tsx' },
			lines: 70,
		},
	];
	const r = computeProductionStats(dupes);
	assert.equal(r.autoCount, 0);
	assert.equal(r.specAutoCount, 1);
	assert.equal(r.specAutoLines, 70);
});

test('non-production pair is not counted', () => {
	const dupes = [
		{
			firstFile: { name: 'packages/shared-ts/lib/utils.ts' },
			secondFile: { name: 'docs/records/2026-08-29-record.md' },
			lines: 50,
		},
	];
	const r = computeProductionStats(dupes);
	assert.equal(r.pairCount, 0);
});

test('entry without files field is skipped', () => {
	const dupes = [
		{ lines: 50, firstFile: { name: '' }, secondFile: { name: '' } },
		{
			firstFile: { name: 'apps/api/Svc.cs' },
			secondFile: { name: 'apps/api/Svc2.cs' },
			lines: 30,
		},
	];
	const r = computeProductionStats(dupes);
	assert.equal(r.pairCount, 1);
	assert.equal(r.pairLines, 30);
});

// ---------------------------------------------------------------------------
// verifyJscpdRatchet fixture tests
// ---------------------------------------------------------------------------

/** Fixture overrides for buildFixture. */
interface FixtureOverrides {
	ref?: {
		productionPairs?: { count?: number; lines?: number };
		productionAuto?: { count?: number; lines?: number };
		pairLines?: Record<string, number>;
		autoLines?: Record<string, number>;
	};
	dupes?: import('./check-jscpd.ts').JscpdCloneEntry[];
	cloneCount?: number;
}

const buildFixture = async (overrides: FixtureOverrides = {}) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-'));
	const ref = {
		productionPairs: { count: 10, lines: 200 },
		productionAuto: { count: 5, lines: 100 },
		...overrides.ref,
	};

	const report = {
		statistics: { total: { clones: overrides.cloneCount ?? 1 } },
		duplicates: overrides.dupes ?? [],
	};

	await writeFile(path.join(root, 'ref.json'), JSON.stringify(ref, null, '\t'));
	await writeFile(
		path.join(root, 'report.json'),
		JSON.stringify(report, null, '\t'),
	);

	return { root, ref, report };
};

test('passes when all values are at or below baseline', async () => {
	const { root } = await buildFixture({
		ref: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		dupes: [
			{
				firstFile: { name: 'apps/api/SvcA.cs' },
				secondFile: { name: 'apps/api/SvcB.cs' },
				lines: 200,
			},
		],
		cloneCount: 1,
	});
	const { errors } = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.deepEqual(errors, []);
});

test('passes when spec duplication grows (reported, not gating)', async () => {
	const { root } = await buildFixture({
		ref: { productionPairs: { count: 10, lines: 200 } },
		dupes: Array.from({ length: 20 }, (_, i) => ({
			firstFile: { name: `apps/api/SvcA${i}.cs` },
			secondFile: { name: `apps/api/SvcA${i}.Spec.cs` },
			lines: 10,
		})),
		cloneCount: 20,
	});
	const { errors } = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	// Issue #1821 requirement 2: specs/tests are reported, never blocking.
	assert.deepEqual(errors, []);
});

test('fails when production pair count increases, naming the files', async () => {
	const { root } = await buildFixture({
		ref: { productionPairs: { count: 10, lines: 200 } },
		dupes: Array.from({ length: 11 }, (_, i) => ({
			firstFile: { name: `apps/api/SvcA${i}.cs` },
			secondFile: { name: `apps/api/SvcB${i}.cs` },
			lines: 10,
		})),
		cloneCount: 11,
	});
	const { errors } = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.ok(
		errors.some((e) => e.includes('increased from 10 to 11')),
		errors.join('\n'),
	);
	// House rule: a red guard must name the file(s) — never a bare count.
	assert.ok(
		errors.some((e) => e.includes('apps/api/SvcA0.cs')),
		errors.join('\n'),
	);
});

test('fails when production pair lines increase, naming the files', async () => {
	const { root } = await buildFixture({
		ref: { productionPairs: { count: 10, lines: 200 } },
		dupes: [
			{
				firstFile: { name: 'apps/api/SvcA.cs' },
				secondFile: { name: 'apps/api/SvcB.cs' },
				lines: 201,
			},
		],
		cloneCount: 1,
	});
	const { errors } = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.ok(
		errors.some((e) => e.includes('increased from 200 to 201')),
		errors.join('\n'),
	);
	assert.ok(
		errors.some((e) => e.includes('apps/api/SvcA.cs')),
		errors.join('\n'),
	);
});

test('fails when production auto file count increases, naming the files', async () => {
	const { root } = await buildFixture({
		ref: { productionAuto: { count: 5, lines: 100 } },
		dupes: Array.from({ length: 6 }, (_, i) => ({
			firstFile: { name: `apps/api/Svc${i}.cs` },
			secondFile: { name: `apps/api/Svc${i}.cs` },
			lines: 10,
		})),
		cloneCount: 6,
	});
	const { errors } = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.ok(
		errors.some((e) => e.includes('increased from 5 to 6')),
		errors.join('\n'),
	);
	assert.ok(
		errors.some((e) => e.includes('apps/api/Svc0.cs')),
		errors.join('\n'),
	);
});

test('fails when production auto lines increase, naming the files', async () => {
	const { root } = await buildFixture({
		ref: { productionAuto: { count: 5, lines: 100 } },
		dupes: [
			{
				firstFile: { name: 'apps/api/Svc.cs' },
				secondFile: { name: 'apps/api/Svc.cs' },
				lines: 101,
			},
		],
		cloneCount: 1,
	});
	const { errors } = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.ok(
		errors.some((e) => e.includes('increased from 100 to 101')),
		errors.join('\n'),
	);
	assert.ok(
		errors.some((e) => e.includes('apps/api/Svc.cs')),
		errors.join('\n'),
	);
});

test('fails loudly when report is missing', () => {
	const { errors } = verifyJscpdRatchet('/nope/report.json', '/nope/ref.json');
	assert.ok(errors.length > 0);
	assert.ok(errors[0].includes('unavailable'), errors[0]);
});

test('fails loudly when report is malformed JSON', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-'));
	await writeFile(path.join(root, 'report.json'), '{ broken');
	await writeFile(
		path.join(root, 'ref.json'),
		JSON.stringify({
			productionPairs: { count: 0, lines: 0 },
			productionAuto: { count: 0, lines: 0 },
		}),
	);
	const { errors } = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.ok(
		errors.some((e) => e.includes('Malformed JSON')),
		errors.join('\n'),
	);
});

test('fails loudly when both report and duplicates are empty', async () => {
	const { root } = await buildFixture({
		dupes: [],
		cloneCount: 0,
	});
	const { errors } = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.ok(
		errors.some((e) => e.includes('0 clones')),
		errors.join('\n'),
	);
});


test('real repository passes with current baseline', async () => {
	const reportPath = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		'../../../.dump/jscpd-report.json/jscpd-report.json',
	);
	const { execSync } = require('child_process');
	// Read the reference from git HEAD to match what the CLI guard does:
	// the CLI reads from the base commit via `git merge-base origin/develop HEAD`,
	// and in this test context git HEAD is the committed ref (not the working-tree
	// update). This verifies the committed baseline, not the locally-amended one.
	const refFromGit = execSync(
		'git show HEAD:packages/scripts-ts/src/jscpd-reference.json',
		{ encoding: 'utf-8' },
	);
	const tmpRefPath = path.join(os.tmpdir(), `jscpd-ref-${Date.now()}.json`);
	await writeFile(tmpRefPath, refFromGit);
	const { errors } = verifyJscpdRatchet(reportPath, tmpRefPath);
	assert.deepEqual(errors, [], `real-tree guard failed:\n${errors.join('\n')}`);
});

// ---------------------------------------------------------------------------
// #1932: the guard must name the EXACT pair that crossed its base, not just the
// top-5 contributors. This requires pairLines/autoLines to be present in the
// reference. The test proves both properties:
//   1. With pairLines populated, a synthetic over-baseline pair is named by its
//      exact file pair (base -> current lines), not the top-5 list.
//   2. The committed reference carries pairLines and autoLines (stripped maps
//      cause the test to fail loudly).
// ---------------------------------------------------------------------------

test('#1932: with pairLines in the reference, the exact crossing pair is named, not the top-5 list', async () => {
	// A synthetic report: five large pre-existing pairs fill the top-5, plus a
	// small NEW pair (a <-> b, 5 lines, base total 0) that crosses its base.
	// The guard must name (a <-> b, 0 -> 5) — the pair the PR actually made
	// worse — not the top-5 contributors.
	const big = Array.from({ length: 5 }, (_, i) => [
		`apps/api/Large${i}A.cs`,
		`apps/api/Large${i}B.cs`,
	]);
	const dupes = [
		...big.map(([a, b]) => ({
			firstFile: { name: a },
			secondFile: { name: b },
			lines: 100,
		})),
		{
			firstFile: { name: 'apps/api/NewA.cs' },
			secondFile: { name: 'apps/api/NewB.cs' },
			lines: 5,
		},
	];

	// The reference HAS pairLines — every pair's base is its current value,
	// except the new pair which has no base (base total 0).
	const ref = {
		productionPairs: { count: 5, lines: 500 },
		productionAuto: { count: 0, lines: 0 },
		pairLines: {
			...Object.fromEntries(big.map(([a, b]) => [`${a}|${b}`, 100])),
		},
		autoLines: {},
	};

	const root = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-1932-'));
	const refPath = path.join(root, 'ref.json');
	const reportPath = path.join(root, 'report.json');
	await writeFile(refPath, JSON.stringify(ref, null, '\t'));
	await writeFile(
		reportPath,
		JSON.stringify(
			{
				statistics: { total: { clones: 6 } },
				duplicates: dupes,
			},
			null,
			'\t',
		),
	);

	const { errors } = verifyJscpdRatchet(reportPath, refPath);
	assert.ok(errors.length > 0, 'the new pair must red the guard');

	// The EXACT crossing pair must be named (not the top-5 list).
	assert.ok(
		errors.some(
			(e) =>
				e.includes('apps/api/NewA.cs <-> apps/api/NewB.cs') &&
				e.includes('(0 -> 5 duplicated lines)'),
		),
		`guard must name the exact crossing pair, got: ${errors.join('\n')}`,
	);

	// The top-5 fallback message must NOT appear when pairLines is present.
	assert.ok(
		!errors.some((e) => e.includes('Largest pair contributors')),
		`guard must not fall back to top-5 list when pairLines is present, got: ${errors.join('\n')}`,
	);
});

test('#1932: the committed jscpd-reference.json carries pairLines and autoLines (stripping them fails the test)', () => {
	// Read the REAL committed reference file. The guard requires pairLines and
	// autoLines to name exact offenders; if they are stripped the guard degrades
	// to a top-5 list that frequently does NOT point at the pair the PR made
	// worse. This test pins their presence so they cannot be silently removed.
	const refPath = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		'jscpd-reference.json',
	);
	const raw = readFileSync(refPath, 'utf-8');
	const ref = JSON.parse(raw) as {
		pairLines?: unknown;
		autoLines?: unknown;
	};

	assert.ok(
		typeof ref.pairLines === 'object' && ref.pairLines !== null,
		'jscpd-reference.json must carry pairLines (stripping it breaks offender naming, #1932)',
	);
	assert.ok(
		Object.keys(ref.pairLines).length > 0,
		'pairLines must be non-empty (at least one production clone pair exists)',
	);
	assert.ok(
		typeof ref.autoLines === 'object' && ref.autoLines !== null,
		'jscpd-reference.json must carry autoLines (stripping it breaks self-dup offender naming, #1932)',
	);
	assert.ok(
		Object.keys(ref.autoLines).length > 0,
		'autoLines must be non-empty (at least one self-duplicated production file exists)',
	);
});
