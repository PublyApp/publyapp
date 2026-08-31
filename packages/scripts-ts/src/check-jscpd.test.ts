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
	isTestInfraDir,
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

test('C# Tests.cs files are excluded from production pairs, but arbitrary .g.cs files are NOT', () => {
	// #1897: the blanket `*.g.cs` pattern was removed. Only files explicitly
	// listed in GENERATED_FILE_PATHS are excluded. An arbitrary `.g.cs` file
	// is now counted as production — the exclusion must be deliberate.
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
	assert.equal(r.pairCount, 1);
	assert.equal(r.pairLines, 30);
	assert.equal(r.specPairCount, 1);
	assert.equal(r.specPairLines, 40);
});

test('ResponseKeys.g.cs is excluded by explicit path (issue #1897)', () => {
	// The one known generated file is excluded by path, not by pattern.
	const dupes = [
		{
			firstFile: { name: 'apps/api/SomeService.cs' },
			secondFile: { name: 'apps/api/Localization/ResponseKeys.g.cs' },
			lines: 60,
		},
	];
	const r = computeProductionStats(dupes);
	assert.equal(r.pairCount, 0);
	assert.equal(r.specPairCount, 1);
	assert.equal(r.specPairLines, 60);
});

test('test-infrastructure files under Lib/Testing/ are excluded (issue #1895)', () => {
	// A file under Lib/Testing/ has no `.Spec.cs` suffix but is test-only
	// code compiled into the test project. It must be excluded by path.
	const dupes = [
		{
			firstFile: { name: 'apps/api/Lib/Testing/Helpers/TenantTestHelper.cs' },
			secondFile: {
				name: 'apps/api/Lib/Testing/Helpers/StaffUserTestHelper.cs',
			},
			lines: 50,
		},
	];
	const r = computeProductionStats(dupes);
	assert.equal(r.pairCount, 0);
	assert.equal(r.specPairCount, 1);
	assert.equal(r.specPairLines, 50);
});

test('test-infrastructure files under Tests/ are excluded (issue #1895)', () => {
	const dupes = [
		{
			firstFile: {
				name: 'apps/api/Tests/Data/DbContext/AppDbContextAuditTrackingSpec.cs',
			},
			secondFile: { name: 'apps/api/SomeService.cs' },
			lines: 40,
		},
	];
	const r = computeProductionStats(dupes);
	assert.equal(r.pairCount, 0);
	assert.equal(r.specPairCount, 1);
	assert.equal(r.specPairLines, 40);
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

// ---------------------------------------------------------------------------
// #1890 — offender naming against the stored base report
// ---------------------------------------------------------------------------

test('names the exact pair that crossed its base (offender below the top-5 cut)', async () => {
	// Five big pairs fill the old top-5 list; the NEW offender (a <-> b,
	// 5 lines, a new pair with base total 0) ranks sixth by size. The old
	// top-5 message could not name it; the base-report diff must.
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
	const { root } = await buildFixture({
		ref: {
			productionPairs: { count: 5, lines: 500 },
			productionAuto: { count: 5, lines: 100 },
			pairLines: Object.fromEntries(big.map(([a, b]) => [`${a}|${b}`, 100])),
		},
		dupes,
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
	// The exact offender, named with its base -> current totals — even though
	// it is NOT in the top-5 contributors.
	assert.ok(
		errors.some(
			(e) =>
				e.includes('apps/api/NewA.cs <-> apps/api/NewB.cs') &&
				e.includes('(0 -> 5 duplicated lines)'),
		),
		errors.join('\n'),
	);
	// And the measurement source is stated.
	assert.ok(
		errors.some((e) => e.includes('Measured against file:')),
		errors.join('\n'),
	);
});

test('names the self-duplicated file that crossed its base', async () => {
	const { root } = await buildFixture({
		ref: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 20 },
			autoLines: { 'apps/api/A.cs': 10, 'apps/api/B.cs': 10 },
		},
		dupes: [
			{
				firstFile: { name: 'apps/api/A.cs' },
				secondFile: { name: 'apps/api/A.cs' },
				lines: 15,
			},
			{
				firstFile: { name: 'apps/api/B.cs' },
				secondFile: { name: 'apps/api/B.cs' },
				lines: 10,
			},
		],
		cloneCount: 2,
	});
	const { errors } = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.ok(
		errors.some((e) => e.includes('increased from 20 to 25')),
		errors.join('\n'),
	);
	// Only A grew (10 -> 15); B is at its base (10) and must NOT be named.
	assert.ok(
		errors.some(
			(e) =>
				e.includes('Files that crossed their base') &&
				e.includes('apps/api/A.cs (10 -> 15 duplicated lines)'),
		),
		errors.join('\n'),
	);
	assert.ok(
		!errors.some((e) => e.includes('apps/api/B.cs (')),
		errors.join('\n'),
	);
});

test('legacy reference (no per-pair map) falls back to the top-5 list and says so', async () => {
	const { root } = await buildFixture({
		ref: { productionPairs: { count: 1, lines: 40 } },
		dupes: [
			{
				firstFile: { name: 'apps/api/NewA.cs' },
				secondFile: { name: 'apps/api/NewB.cs' },
				lines: 50,
			},
		],
		cloneCount: 1,
	});
	const { errors } = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.ok(
		errors.some((e) => e.includes('increased from 40 to 50')),
		errors.join('\n'),
	);
	// The legacy fallback names the top contributors, not a base diff.
	assert.ok(
		errors.some((e) =>
			e.includes('Largest pair contributors (by duplicated lines)'),
		),
		errors.join('\n'),
	);
});

test('a pair at its base total is not an offender (equal is not a violation)', async () => {
	const { root } = await buildFixture({
		ref: {
			productionPairs: { count: 2, lines: 40 },
			productionAuto: { count: 5, lines: 100 },
			pairLines: {
				'apps/api/A.cs|apps/api/B.cs': 20,
				'apps/api/C.cs|apps/api/D.cs': 20,
			},
		},
		dupes: [
			{
				firstFile: { name: 'apps/api/A.cs' },
				secondFile: { name: 'apps/api/B.cs' },
				lines: 20,
			},
			{
				firstFile: { name: 'apps/api/C.cs' },
				secondFile: { name: 'apps/api/D.cs' },
				lines: 20,
			},
		],
		cloneCount: 2,
	});
	const { errors } = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		path.join(root, 'ref.json'),
	);
	assert.deepEqual(errors, []);
});

test('findOffendingPairs returns null for a legacy reference (no pairLines map)', () => {
	const stats = computeProductionStats(
		[
			{
				firstFile: { name: 'apps/api/A.cs' },
				secondFile: { name: 'apps/api/B.cs' },
				lines: 10,
			},
		],
		{ withMaps: true },
	);
	if (stats.pairMaps === undefined) {
		assert.fail('withMaps must expose the pair map');
	}
	assert.equal(findOffendingPairs(stats.pairMaps, undefined), null);
	const offenders = findOffendingPairs(stats.pairMaps, {});
	assert.ok(offenders !== null);
	assert.deepEqual(offenders, [
		{ files: ['apps/api/A.cs', 'apps/api/B.cs'], lines: 10, baseLines: 0 },
	]);
});

// ---------------------------------------------------------------------------
// #1890 — the reference is anchored to the merge base, never to this tree
// ---------------------------------------------------------------------------

const gitIn = (gitDir: string, ...args: string[]): void => {
	execFileSync('git', args, { cwd: gitDir, stdio: 'pipe', timeout: 30_000 });
};

/**
 * Builds a hermetic git fixture: a bare "remote" plus a clone whose branch
 * `main` carries the reference. The clone's `refs/remotes/origin/main` is
 * what a PR merge-base read would resolve.
 */
const buildBaseGitFixture = async (
	ref: Record<string, unknown>,
): Promise<{ gitDir: string }> => {
	const remote = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-jscpd-remote-'),
	);
	gitIn(remote, 'init', '--bare', '--initial-branch=main', '.');
	const gitDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-clone-'));
	gitIn(gitDir, 'init', '--initial-branch=main', '.');
	gitIn(gitDir, 'config', 'user.email', 'test@example.com');
	gitIn(gitDir, 'config', 'user.name', 'Test');

	const dir = path.join(gitDir, 'packages', 'scripts-ts', 'src');
	await mkdir(dir, { recursive: true });
	await writeFile(
		path.join(dir, 'jscpd-reference.json'),
		`${JSON.stringify(ref, null, '\t')}\n`,
	);

	gitIn(gitDir, 'add', '.');
	gitIn(gitDir, 'commit', '-m', 'base reference');
	gitIn(gitDir, 'remote', 'add', 'origin', remote);
	gitIn(gitDir, 'push', 'origin', 'main');
	gitIn(gitDir, 'fetch', 'origin');
	return { gitDir };
};

test('#1890: the ratchet reads the reference from the base, not from this tree', async () => {
	const { gitDir } = await buildBaseGitFixture({
		productionPairs: { count: 10, lines: 200 },
		productionAuto: { count: 5, lines: 100 },
	});

	const root = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-'));
	const report = {
		statistics: { total: { clones: 1 } },
		duplicates: [
			{
				firstFile: { name: 'apps/api/SvcA.cs' },
				secondFile: { name: 'apps/api/SvcB.cs' },
				lines: 200,
			},
		],
	};
	await writeFile(
		path.join(root, 'report.json'),
		JSON.stringify(report, null, '\t'),
	);

	// 1. Explicit base ref (the CI merge-base seam): 200 lines vs the base
	//    total of 200 -> pass.
	const ok = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		undefined,
		'refs/remotes/origin/main',
		gitDir,
	);
	assert.deepEqual(ok.errors, []);
	assert.ok(
		ok.refSource === 'git:refs/remotes/origin/main',
		`refSource=${ok.refSource}`,
	);

	// 2. Same tree, base with a TIGHTER reference (100 lines): the identical
	//    report must now FAIL. The verdict depends on the BASE, not on any
	//    file in this tree — the old guard read the reference from the
	//    working tree and could never distinguish these two.
	const tight = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-tight-'));
	gitIn(tight, 'init', '--initial-branch=main', '.');
	gitIn(tight, 'config', 'user.email', 'test@example.com');
	gitIn(tight, 'config', 'user.name', 'Test');
	const tightDir = path.join(tight, 'packages', 'scripts-ts', 'src');
	await mkdir(tightDir, { recursive: true });
	await writeFile(
		path.join(tightDir, 'jscpd-reference.json'),
		JSON.stringify(
			{
				productionPairs: { count: 10, lines: 100 },
				productionAuto: { count: 5, lines: 100 },
			},
			null,
			'\t',
		),
	);
	gitIn(tight, 'add', '.');
	gitIn(tight, 'commit', '-m', 'tighter base');
	// The tight repo has no remote-tracking refs; use the commit ref form:
	const red = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		undefined,
		'HEAD',
		tight,
	);
	assert.ok(red.errors.length > 0, 'tighter base must red the same report');
	assert.ok(
		red.errors.some((e) => e.includes('increased from 100 to 200')),
		red.errors.join('\n'),
	);
	assert.ok(red.refSource === 'git:HEAD', `refSource=${red.refSource}`);
});

test('#1890: the ATTACK is caught — a raised working-tree reference does not loosen the ratchet', async () => {
	// The #1890 bypass, end to end: the base carries 100 lines; the PR tree
	// "raises" the committed reference to 200 (in the PR's own tree) while
	// the scan reports 200 lines of duplication. The old guard read the
	// raised working-tree file and exited 0. The anchored guard must red,
	// measured against the base.
	const { gitDir } = await buildBaseGitFixture({
		productionPairs: { count: 10, lines: 100 },
		productionAuto: { count: 5, lines: 100 },
		pairLines: {},
		autoLines: {},
	});

	// The PR tree: working-tree reference "raised" to 200 (the attack) —
	// committed state at origin/main is still 100.
	await writeFile(
		path.join(gitDir, 'packages/scripts-ts/src/jscpd-reference.json'),
		JSON.stringify(
			{
				productionPairs: { count: 10, lines: 200 },
				productionAuto: { count: 5, lines: 100 },
			},
			null,
			'\t',
		),
	);

	const root = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-'));
	const report = {
		statistics: { total: { clones: 1 } },
		duplicates: [
			{
				firstFile: { name: 'apps/api/SvcA.cs' },
				secondFile: { name: 'apps/api/SvcB.cs' },
				lines: 200,
			},
		],
	};
	await writeFile(
		path.join(root, 'report.json'),
		JSON.stringify(report, null, '\t'),
	);

	const verdict = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		undefined,
		'refs/remotes/origin/main',
		gitDir,
	);
	assert.ok(verdict.errors.length > 0, 'the attack must red');
	assert.ok(
		verdict.errors.some((e) => e.includes('increased from 100 to 200')),
		verdict.errors.join('\n'),
	);
	// The message names what it measured against — the BASE, not the raised
	// working-tree file (which says 200 and would pass).
	assert.ok(
		verdict.refSource === 'git:refs/remotes/origin/main',
		`refSource=${verdict.refSource}`,
	);
});

test('#1890: a missing base fails loudly, naming the cause and the expected action', async () => {
	const empty = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-nogit-'));
	gitIn(empty, 'init', '--initial-branch=main', '.');
	gitIn(empty, 'config', 'user.email', 'test@example.com');
	gitIn(empty, 'config', 'user.name', 'Test');

	const root = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-'));
	const report = {
		statistics: { total: { clones: 1 } },
		duplicates: [
			{
				firstFile: { name: 'apps/api/SvcA.cs' },
				secondFile: { name: 'apps/api/SvcB.cs' },
				lines: 50,
			},
		],
	};
	await writeFile(
		path.join(root, 'report.json'),
		JSON.stringify(report, null, '\t'),
	);

	// No origin/develop, no fetchable origin -> the guard must fail loud.
	const prevRemote = process.env.GITHUB_BASE_REF;
	const prevSeam = process.env.PUBLY_JSCPD_BASE_REF;
	try {
		delete process.env.GITHUB_BASE_REF;
		delete process.env.PUBLY_JSCPD_BASE_REF;
		const verdict = verifyJscpdRatchet(
			path.join(root, 'report.json'),
			undefined,
			undefined,
			empty,
		);
		assert.ok(verdict.errors.length > 0);
		const msg = verdict.errors[0];
		assert.ok(msg.includes('unavailable from the merge base'), msg);
		assert.ok(msg.includes('refs/remotes/origin/develop'), msg);
		assert.ok(msg.includes('git fetch origin develop'), msg);
		assert.ok(msg.includes('#1890'), msg);
	} finally {
		if (prevRemote !== undefined) {
			process.env.GITHUB_BASE_REF = prevRemote;
		}
		if (prevSeam !== undefined) {
			process.env.PUBLY_JSCPD_BASE_REF = prevSeam;
		}
	}
});

test('#1890: GITHUB_BASE_REF selects the CI base branch ref', async () => {
	const { gitDir } = await buildBaseGitFixture({
		productionPairs: { count: 10, lines: 200 },
		productionAuto: { count: 5, lines: 100 },
	});
	// Name the fixture branch like a base branch.
	gitIn(gitDir, 'branch', '-M', 'main', 'develop');
	gitIn(gitDir, 'push', 'origin', 'develop:develop', '--force');
	gitIn(gitDir, 'fetch', 'origin');

	const root = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-'));
	const report = {
		statistics: { total: { clones: 1 } },
		duplicates: [
			{
				firstFile: { name: 'apps/api/SvcA.cs' },
				secondFile: { name: 'apps/api/SvcB.cs' },
				lines: 201,
			},
		],
	};
	await writeFile(
		path.join(root, 'report.json'),
		JSON.stringify(report, null, '\t'),
	);

	const prevRemote = process.env.GITHUB_BASE_REF;
	const prevSeam = process.env.PUBLY_JSCPD_BASE_REF;
	try {
		delete process.env.PUBLY_JSCPD_BASE_REF;
		process.env.GITHUB_BASE_REF = 'develop';
		const verdict = verifyJscpdRatchet(
			path.join(root, 'report.json'),
			undefined,
			undefined,
			gitDir,
		);
		assert.ok(
			verdict.errors.some((e) => e.includes('increased from 200 to 201')),
			verdict.errors.join('\n'),
		);
		assert.ok(
			verdict.refSource === 'git:refs/remotes/origin/develop',
			`refSource=${verdict.refSource}`,
		);
	} finally {
		if (prevRemote === undefined) {
			delete process.env.GITHUB_BASE_REF;
		} else {
			process.env.GITHUB_BASE_REF = prevRemote;
		}
		if (prevSeam === undefined) {
			delete process.env.PUBLY_JSCPD_BASE_REF;
		} else {
			process.env.PUBLY_JSCPD_BASE_REF = prevSeam;
		}
	}
});

test('#1890: readReferenceFromBase fails loud on a malformed base blob', async () => {
	const remote = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-jscpd-remote-'),
	);
	gitIn(remote, 'init', '--bare', '--initial-branch=main', '.');
	const gitDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-clone-'));
	gitIn(gitDir, 'init', '--initial-branch=main', '.');
	gitIn(gitDir, 'config', 'user.email', 'test@example.com');
	gitIn(gitDir, 'config', 'user.name', 'Test');
	const dir = path.join(gitDir, 'packages', 'scripts-ts', 'src');
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, 'jscpd-reference.json'), '{ broken');
	gitIn(gitDir, 'add', '.');
	gitIn(gitDir, 'commit', '-m', 'malformed');
	gitIn(gitDir, 'remote', 'add', 'origin', remote);
	gitIn(gitDir, 'push', 'origin', 'main');
	gitIn(gitDir, 'fetch', 'origin');

	const result = readReferenceFromBase(gitDir, 'refs/remotes/origin/main');
	assert.equal(result.ok, false);
	assert.ok(result.error?.includes('malformed reference JSON'), result.error);
});

test('#1890: the explicit base seam reads a reference file', async () => {
	const { gitDir } = await buildBaseGitFixture({
		productionPairs: { count: 1, lines: 10 },
		productionAuto: { count: 1, lines: 5 },
	});
	const root = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-'));
	const refFile = path.join(root, 'seam-ref.json');
	await writeFile(
		refFile,
		JSON.stringify({
			productionPairs: { count: 10, lines: 50 },
			productionAuto: { count: 5, lines: 20 },
		}),
	);
	const report = {
		statistics: { total: { clones: 1 } },
		duplicates: [
			{
				firstFile: { name: 'apps/api/SvcA.cs' },
				secondFile: { name: 'apps/api/SvcB.cs' },
				lines: 60,
			},
		],
	};
	await writeFile(
		path.join(root, 'report.json'),
		JSON.stringify(report, null, '\t'),
	);
	const verdict = verifyJscpdRatchet(
		path.join(root, 'report.json'),
		undefined,
		refFile,
		gitDir,
	);
	assert.ok(
		verdict.errors.some((e) => e.includes('increased from 50 to 60')),
		verdict.errors.join('\n'),
	);
	assert.ok(
		verdict.refSource === `file:${refFile}`,
		`refSource=${verdict.refSource}`,
	);
});

test('#1890: the CLI default resolves the reference from the base (a working-tree raise cannot pass the gate)', async () => {
	// The guard is invoked through `just ci-jscpd` as a bare CLI run
	// (`node check-jscpd.ts <report>`). That entry point must resolve the
	// reference from the merge base — a mutation that makes the CLI default
	// to the packaged reference file reopens the #1890 bypass while every
	// unit test stays green, so this test drives the real CLI end to end.
	const { gitDir } = await buildBaseGitFixture({
		productionPairs: { count: 10, lines: 100 },
		productionAuto: { count: 5, lines: 100 },
		pairLines: {},
		autoLines: {},
	});

	// The attack: the PR tree raises the reference to 200 — the value that
	// would swallow the 200-line report below. The CLI must measure against
	// the base (100), never this working-tree decoy.
	await writeFile(
		path.join(gitDir, 'packages/scripts-ts/src/jscpd-reference.json'),
		JSON.stringify(
			{
				productionPairs: { count: 10, lines: 200 },
				productionAuto: { count: 5, lines: 100 },
			},
			null,
			'\t',
		),
	);

	const cli = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		'check-jscpd.ts',
	);
	const runCli = async (
		report: unknown,
	): Promise<{ code: number; stdout: string; stderr: string }> => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-cli-'));
		const reportPath = path.join(root, 'report.json');
		await writeFile(reportPath, JSON.stringify(report, null, '\t'));
		const env = {
			...process.env,
			PUBLY_JSCPD_GIT_DIR: gitDir,
			PUBLY_JSCPD_BASE_REF: 'refs/remotes/origin/main',
		};
		try {
			const out = execFileSync(process.execPath, [cli, reportPath], {
				env,
				encoding: 'utf-8',
			});
			return { code: 0, stdout: out, stderr: '' };
		} catch (e) {
			const err = e as {
				status?: number;
				stdout?: string | Buffer;
				stderr?: string | Buffer;
			};
			return {
				code: err.status ?? 1,
				stdout: String(err.stdout ?? ''),
				stderr: String(err.stderr ?? ''),
			};
		}
	};

	const report = {
		statistics: { total: { clones: 1 } },
		duplicates: [
			{
				firstFile: { name: 'apps/api/SvcA.cs' },
				secondFile: { name: 'apps/api/SvcB.cs' },
				lines: 200,
			},
		],
	};

	// Attack run: 200 lines vs the base's 100 -> exit 1, pair named, and the
	// message says it measured against the BASE ref, not the working tree.
	const attack = await runCli(report);
	assert.equal(attack.code, 1, attack.stderr);
	assert.ok(attack.stderr.includes('increased from 100 to 200'), attack.stderr);
	assert.ok(
		attack.stderr.includes('apps/api/SvcA.cs <-> apps/api/SvcB.cs'),
		attack.stderr,
	);
	assert.ok(
		attack.stderr.includes('Measured against git:refs/remotes/origin/main'),
		attack.stderr,
	);

	// Control run: the same tree with a report at the base total passes.
	const control = await runCli({
		statistics: { total: { clones: 1 } },
		duplicates: [
			{
				firstFile: { name: 'apps/api/SvcA.cs' },
				secondFile: { name: 'apps/api/SvcB.cs' },
				lines: 100,
			},
		],
	});
	assert.equal(control.code, 0, control.stderr);
});

test('#1890: a missing base fails loud even when a decoy reference sits in the working tree', async () => {
	// The silent-fallback hole: when the base is unavailable, a mutation can
	// fall back to the working-tree reference. The existing base-missing test
	// cannot see that hole — its fixture has no reference file in the working
	// tree, so a fallback has nothing to read and still fails loud. This test
	// plants the decoy (the PR's own raised baseline) and demands a loud
	// failure: the guard must never measure against a file the PR provides.
	const gitDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-decoy-'));
	gitIn(gitDir, 'init', '--initial-branch=main', '.');
	gitIn(gitDir, 'config', 'user.email', 'test@example.com');
	gitIn(gitDir, 'config', 'user.name', 'Test');
	const dir = path.join(gitDir, 'packages', 'scripts-ts', 'src');
	await mkdir(dir, { recursive: true });
	// The decoy reference: a raised baseline that would swallow the report.
	await writeFile(
		path.join(dir, 'jscpd-reference.json'),
		JSON.stringify(
			{
				productionPairs: { count: 20, lines: 500 },
				productionAuto: { count: 5, lines: 100 },
			},
			null,
			'\t',
		),
	);

	const root = await mkdtemp(path.join(os.tmpdir(), 'publyapp-jscpd-'));
	const report = {
		statistics: { total: { clones: 11 } },
		duplicates: Array.from({ length: 11 }, (_, i) => ({
			firstFile: { name: `apps/api/SvcA${i}.cs` },
			secondFile: { name: `apps/api/SvcB${i}.cs` },
			lines: 10,
		})),
	};
	await writeFile(
		path.join(root, 'report.json'),
		JSON.stringify(report, null, '\t'),
	);

	const prevRemote = process.env.GITHUB_BASE_REF;
	const prevSeam = process.env.PUBLY_JSCPD_BASE_REF;
	try {
		delete process.env.GITHUB_BASE_REF;
		delete process.env.PUBLY_JSCPD_BASE_REF;
		const verdict = verifyJscpdRatchet(
			path.join(root, 'report.json'),
			undefined,
			undefined,
			gitDir,
		);
		assert.ok(
			verdict.errors.length > 0,
			'the decoy must NOT satisfy the guard',
		);
		const msg = verdict.errors[0];
		assert.ok(msg.includes('unavailable from the merge base'), msg);
		assert.ok(msg.includes('refs/remotes/origin/develop'), msg);
		assert.ok(msg.includes('git fetch origin develop'), msg);
		// Never a silent fallback: the guard must not resolve anything.
		assert.equal(verdict.refSource, null, `refSource=${verdict.refSource}`);
	} finally {
		if (prevRemote !== undefined) {
			process.env.GITHUB_BASE_REF = prevRemote;
		}
		if (prevSeam !== undefined) {
			process.env.PUBLY_JSCPD_BASE_REF = prevSeam;
		}
	}
});

// ---------------------------------------------------------------------------
// Real-tree tests (require a jscpd report at the default path and an
// origin/develop remote — `just ci-jscpd` provides both before running).
// ---------------------------------------------------------------------------

test('real repository passes with the merge-base reference', () => {
	const reportPath = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		'../../../.dump/jscpd-report.json/jscpd-report.json',
	);
	const { errors, refSource } = verifyJscpdRatchet(reportPath);
	assert.ok(refSource !== null, 'the reference must come from the merge base');
	assert.ok(refSource.startsWith('git:'), `refSource=${refSource}`);
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
		pairLines: Object.fromEntries(big.map(([a, b]) => [`${a}|${b}`, 100])),
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

// ---------------------------------------------------------------------------
// isTestInfraDir anchor coverage (issue #1929 r3).
//
// The patterns are anchored to the two known test-project roots so a future
// `Tests/` directory added anywhere else is NOT silently swallowed. These
// tests pin the anchor: the green state recognises the two real roots and
// rejects every other path that merely contains a `Tests` segment. If the
// anchor is loosened back to an unanchored `/\/Tests\//` (the pre-#1929-r3
// shape), the "rejected" test goes red — the mutation bites.
// ---------------------------------------------------------------------------

test('isTestInfraDir recognises the two anchored test-infrastructure roots', () => {
	// Green: the two real, anchored roots must be recognised.
	const recognised = [
		'apps/api/Tests/SomeTest.cs',
		'apps/api/Tests/Data/DbContext/AppDbContextAuditTrackingSpec.cs',
		'apps/api/Lib/Testing/Helpers/TenantTestHelper.cs',
		'apps/api/Lib/Testing/Fixtures/SomeFixture.cs',
		'apps/api/Lib/Testing/Fakes/SomeFake.cs',
		'apps/api/Lib/Testing/Diagnostics/SomeDiag.cs',
	];
	for (const file of recognised) {
		assert.strictEqual(
			isTestInfraDir(file),
			true,
			`anchor regression: ${file} must be recognised as a test-infra path`,
		);
	}
});

test('isTestInfraDir rejects a Tests/ directory added outside the two anchored roots', () => {
	// Red-when-anchor-is-broken: every other location that merely has a
	// `Tests` segment MUST be rejected. If the guard ever broadens its
	// patterns (e.g. back to the pre-r3 unanchored `/\/Tests\//` form),
	// these assertions fail loud and the operator sees the test name.
	const notRecognised = [
		// A Tests/ directory added under apps/front/src — must NOT be
		// silently absorbed by the patterns.
		'apps/front/src/Tests/SomeTest.tsx',
		'apps/front/src/Tests/Nested/SomeTest.ts',
		// A Tests/ directory added under packages/shared-ts — must NOT be
		// silently absorbed either.
		'packages/shared-ts/Tests/SomeTest.ts',
		'packages/shared-ts/Tests/Sub/Dir/SomeTest.ts',
		// A Tests/ directory added under packages/lint-cs — outside the
		// production roots entirely, but the anchor contract says: if the
		// file is NOT under apps/api/Tests/ or apps/api/Lib/Testing/,
		// the pattern must NOT match. Pins the contract.
		'packages/lint-cs/Tests/SomeTest.cs',
		// A Lib/Testing/ segment appearing outside apps/api — same contract.
		'apps/front/src/Lib/Testing/SomeHelper.ts',
		'packages/shared-ts/Lib/Testing/SomeHelper.ts',
		// A file NAMED Tests.cs that is not inside any test-infrastructure
		// directory — must NOT be auto-classified by the patterns (the
		// `.Tests.cs` suffix rule handles this elsewhere).
		'apps/api/Modules/Auth/Tests.cs',
	];
	for (const file of notRecognised) {
		assert.strictEqual(
			isTestInfraDir(file),
			false,
			`anchor regression: ${file} must NOT be recognised as a test-infra ` +
				`path — a new Tests/ directory outside the anchored roots must ` +
				`require an explicit extension to TEST_INFRA_DIR_PATTERNS.`,
		);
	}
});

test('isTestInfraDir rejects a third Tests/ root added under apps/api (e.g. apps/api/Tests2/)', () => {
	// The risk the anchor addresses: an exclusion pattern that names a
	// directory can match a SIBLING that happens to share the same suffix
	// (apps/api/Tests/ vs apps/api/Tests2/). The anchored form requires
	// the trailing slash, so `apps/api/Tests2/...` does NOT match
	// `^apps/api/Tests/`. This test pins that property — without the
	// trailing slash, the patterns would over-match.
	const tests2Paths = [
		'apps/api/Tests2/SomeFile.cs',
		'apps/api/Tests2/Nested/SomeFile.cs',
	];
	for (const file of tests2Paths) {
		assert.strictEqual(
			isTestInfraDir(file),
			false,
			`anchor regression: ${file} must NOT match — the anchored pattern ` +
				`requires the trailing slash, so the sibling apps/api/Tests2/ ` +
				`directory is not silently absorbed.`,
		);
	}
});
