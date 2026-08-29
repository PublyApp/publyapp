import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'os';

import { test } from 'vitest';

import { computeProductionStats, verifyJscpdRatchet } from './check-jscpd.ts';

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

test('same pair reported twice counts once (canonical key)', () => {
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
	// First occurrence wins
	assert.equal(r.pairLines, 30);
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

test('self-duplication with higher lines replaces lower (max per file)', () => {
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
	assert.equal(r.autoLines, 80); // max wins
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

const buildFixture = async (overrides) => {
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
	const errors = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.deepEqual(errors, []);
});

test('fails when production pair count increases', async () => {
	const { root } = await buildFixture({
		ref: { productionPairs: { count: 10, lines: 200 } },
		dupes: Array.from({ length: 11 }, (_, i) => ({
			firstFile: { name: `apps/api/SvcA${i}.cs` },
			secondFile: { name: `apps/api/SvcB${i}.cs` },
			lines: 10,
		})),
		cloneCount: 11,
	});
	const errors = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.ok(
		errors.some((e) => e.includes('increased from 10 to 11')),
		errors.join('\n'),
	);
});

test('fails when production pair lines increase', async () => {
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
	const errors = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.ok(
		errors.some((e) => e.includes('increased from 200 to 201')),
		errors.join('\n'),
	);
});

test('fails when production auto file count increases', async () => {
	const { root } = await buildFixture({
		ref: { productionAuto: { count: 5, lines: 100 } },
		dupes: Array.from({ length: 6 }, (_, i) => ({
			firstFile: { name: `apps/api/Svc${i}.cs` },
			secondFile: { name: `apps/api/Svc${i}.cs` },
			lines: 10,
		})),
		cloneCount: 6,
	});
	const errors = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.ok(
		errors.some((e) => e.includes('increased from 5 to 6')),
		errors.join('\n'),
	);
});

test('fails when production auto lines increase', async () => {
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
	const errors = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.ok(
		errors.some((e) => e.includes('increased from 100 to 101')),
		errors.join('\n'),
	);
});

test('fails loudly when report is missing', () => {
	const errors = verifyJscpdRatchet('/nope/report.json', '/nope/ref.json');
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
	const errors = verifyJscpdRatchet(
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
	const errors = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.ok(
		errors.some((e) => e.includes('0 clones')),
		errors.join('\n'),
	);
});

test('real repository passes with current baseline', () => {
	const reportPath = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		'../../../.dump/jscpd-report.json/jscpd-report.json',
	);
	const refPath = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		'./jscpd-reference.json',
	);
	const errors = verifyJscpdRatchet(reportPath, refPath);
	assert.deepEqual(errors, [], `real-tree guard failed:\n${errors.join('\n')}`);
});
