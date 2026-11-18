import { describe, expect, it } from 'vitest';

import {
	type Baseline,
	type CoderotSnapshot,
	checkFunctionCap,
	checkPrSize,
	checkRatchet,
	classifyPath,
	countSizedLines,
	lowerBaseline,
	measureZones,
	parseTouches,
	toBaselineZones,
} from './check-quality-ratchet.ts';

const zone = { complexityPer1k: 10, duplicationPer1k: 20 };
const baseline: Baseline = {
	functionCap: 15,
	prSizeMaxLines: 600,
	sizeExceptionLabel: 'size-exception',
	tolerancePer1k: 0.5,
	zones: {
		api: zone,
		front: zone,
		'tests-api': zone,
		'tests-front': zone,
		tooling: zone,
	},
	exceptions: [],
};

const snapshot = (
	functions: { name: string; start: number; end: number; cognitive: number }[],
	file = 'apps/api/Modules/A.cs',
): CoderotSnapshot => ({
	files: [{ path: file, blob: 'b', test: false }],
	blobs: {
		b: { sloc: 100, functions: functions.map((f) => ({ ...f, sloc: 1 })) },
	},
	clones: [
		{
			locations: [
				{ path: file, start: 1, end: 10 },
				{ path: file, start: 5, end: 14 },
			],
		},
	],
});

describe('classifyPath', () => {
	it('maps paths to zones and drops excluded files', () => {
		expect(classifyPath('apps/api/Modules/A.cs')).toBe('api');
		expect(classifyPath('apps/api/Modules/A.Spec.cs')).toBe('tests-api');
		expect(classifyPath('apps/front/src/a.test.tsx')).toBe('tests-front');
		expect(classifyPath('apps/front/src/a.tsx')).toBe('front');
		expect(classifyPath('packages/scripts-ts/src/x.ts')).toBe('tooling');
		expect(classifyPath('apps/front/scripts/guards/x.ts')).toBe('tooling');
		expect(classifyPath('apps/api/Migrations/M.cs')).toBeNull();
		expect(classifyPath('apps/front/src/routeTree.gen.ts')).toBeNull();
		expect(classifyPath('apps/api/Data/X.g.cs')).toBeNull();
		expect(classifyPath('README.md')).toBeNull();
		expect(classifyPath('apps/mobile/src/a.ts')).toBeNull();
		expect(classifyPath('packages/scripts-ts/src/a.test.ts')).toBe('tooling');
		expect(classifyPath('packages/lint-cs/A.Spec.cs')).toBe('tooling');
		expect(classifyPath('apps/front/e2e/a.ts')).toBe('tests-front');
	});
});

describe('measureZones', () => {
	it('sums complexity and merges overlapping clone ranges', () => {
		const m = measureZones(
			snapshot([{ name: 'f', start: 1, end: 5, cognitive: 7 }]),
		);
		expect(m.api).toEqual({ sloc: 100, cognitive: 7, duplicated: 14 });
		expect(toBaselineZones(m).api).toEqual({
			complexityPer1k: 70,
			duplicationPer1k: 140,
		});
	});
});

describe('checkRatchet', () => {
	it('passes within tolerance and fails above it', () => {
		const ok = {
			...baseline.zones,
			api: { complexityPer1k: 10.5, duplicationPer1k: 20 },
		};
		expect(checkRatchet(ok, baseline)).toEqual([]);
		const bad = {
			...baseline.zones,
			api: { complexityPer1k: 10.6, duplicationPer1k: 20 },
		};
		expect(checkRatchet(bad, baseline)).toHaveLength(1);
	});

	it('lowers but never raises the baseline', () => {
		const measured = {
			...baseline.zones,
			api: { complexityPer1k: 5, duplicationPer1k: 99 },
		};
		expect(lowerBaseline(measured, baseline).zones.api).toEqual({
			complexityPer1k: 5,
			duplicationPer1k: 20,
		});
	});
});

describe('function cap', () => {
	const diff = (hunk: string) =>
		parseTouches(
			`diff --git a/apps/api/Modules/A.cs b/apps/api/Modules/A.cs\n--- a/apps/api/Modules/A.cs\n+++ b/apps/api/Modules/A.cs\n${hunk}\n`,
		);

	it('flags a touched function above the cap', () => {
		const snap = snapshot([{ name: 'big', start: 10, end: 30, cognitive: 16 }]);
		expect(
			checkFunctionCap(snap, diff('@@ -12,0 +12,2 @@'), baseline),
		).toHaveLength(1);
	});

	it('ignores untouched functions and cap-compliant ones', () => {
		const snap = snapshot([
			{ name: 'big', start: 10, end: 30, cognitive: 16 },
			{ name: 'ok', start: 40, end: 50, cognitive: 15 },
		]);
		expect(checkFunctionCap(snap, diff('@@ -45 +45 @@'), baseline)).toEqual([]);
		expect(checkFunctionCap(snap, diff('@@ -60 +60 @@'), baseline)).toEqual([]);
	});

	it('judges a nested function on its own, not its container', () => {
		const snap = snapshot([
			{ name: 'describe', start: 1, end: 100, cognitive: 80 },
			{ name: 'it', start: 10, end: 20, cognitive: 3 },
		]);
		expect(checkFunctionCap(snap, diff('@@ -12 +12 @@'), baseline)).toEqual([]);
		expect(
			checkFunctionCap(snap, diff('@@ -50 +50 @@'), baseline),
		).toHaveLength(1);
	});

	it('counts a pure deletion inside a function, honours exceptions', () => {
		const snap = snapshot([{ name: 'big', start: 10, end: 30, cognitive: 16 }]);
		expect(
			checkFunctionCap(snap, diff('@@ -20,2 +19,0 @@'), baseline),
		).toHaveLength(1);
		const waived = {
			...baseline,
			exceptions: [
				{ path: 'apps/api/Modules/A.cs', name: 'big', reason: 'legacy' },
			],
		};
		expect(checkFunctionCap(snap, diff('@@ -20,2 +19,0 @@'), waived)).toEqual(
			[],
		);
	});
});

describe('PR size', () => {
	const numstat = [
		'500\t200\tapps/api/Modules/A.cs',
		'900\t0\tapps/api/Modules/A.Spec.cs',
		'900\t0\tpnpm-lock.yaml',
		'900\t0\tapps/api/Migrations/M.cs',
		'-\t-\timage.png',
	].join('\n');

	it('ignores tests, lockfiles, migrations and binaries', () => {
		expect(countSizedLines(numstat)).toBe(700);
	});

	it('fails over the limit unless the owner label is present', () => {
		expect(checkPrSize(601, [], baseline)).toHaveLength(1);
		expect(checkPrSize(600, [], baseline)).toEqual([]);
		expect(checkPrSize(900, ['size-exception'], baseline)).toEqual([]);
	});
});
