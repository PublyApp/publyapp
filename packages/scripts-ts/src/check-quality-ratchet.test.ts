import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	type Baseline,
	type CoderotSnapshot,
	assertCoverage,
	assertSnapshot,
	baseRef,
	checkBaselineNotRaised,
	checkFunctionCap,
	checkPrSize,
	checkRatchet,
	classifyPath,
	countSizedLines,
	measureZones,
	parseBaseline,
	parseTouches,
	policyFor,
	readBaselineAt,
	renamedTo,
	toBaselineZones,
} from './check-quality-ratchet.ts';

const zone = { complexityPer1k: 10, duplicationPer1k: 20 };
const baseline: Baseline = {
	functionCap: 15,
	prSizeMaxLines: 600,
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
		expect(classifyPath('apps/api/Lib/Testing/H.cs')).toBe('tests-api');
		expect(classifyPath('apps/api/Tests/A.cs')).toBe('tests-api');
		expect(classifyPath('apps/front/deploy/a.test.ts')).toBeNull();
		expect(classifyPath('apps/front/src/__tests__/h.ts')).toBe('tests-front');
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

describe('fail closed', () => {
	const full = (): CoderotSnapshot => ({
		files: [
			{ path: 'apps/api/A.cs', blob: 'a', test: false },
			{ path: 'apps/api/A.Spec.cs', blob: 'a', test: false },
			{ path: 'apps/front/src/a.ts', blob: 'a', test: false },
			{ path: 'apps/front/src/a.test.ts', blob: 'a', test: false },
			{ path: 'packages/scripts-ts/src/a.ts', blob: 'a', test: false },
		],
		blobs: { a: { sloc: 1, functions: [] } },
		clones: [
			{
				locations: [
					{ path: 'apps/api/A.cs', start: 1, end: 5 },
					{ path: 'apps/api/A.Spec.cs', start: 1, end: 5 },
				],
			},
		],
	});

	it('accepts a complete snapshot', () => {
		expect(() => assertSnapshot(full())).not.toThrow();
	});

	it('rejects empty, clone-less, missing-blob and unparsed snapshots', () => {
		expect(() => assertSnapshot({ ...full(), files: [] })).toThrow();
		expect(() => assertSnapshot({ ...full(), clones: undefined })).toThrow();
		expect(() => assertSnapshot({ ...full(), clones: [] })).toThrow(
			/valid clone/,
		);
		expect(() =>
			assertSnapshot({ ...full(), clones: [{ locations: [] }] }),
		).toThrow(/valid clone/);
		expect(() => assertSnapshot({ ...full(), blobs: {} })).toThrow(
			/fully measure/,
		);
		const unparsed = full();
		unparsed.blobs.a = { sloc: 1, functions: [], parsed: false };
		expect(() => assertSnapshot(unparsed)).toThrow();
		const nan = full();
		nan.blobs.a = {
			sloc: 1,
			functions: [{ name: 'f', start: 1, end: 2, cognitive: Number.NaN }],
		};
		expect(() => assertSnapshot(nan)).toThrow(/fully measure/);
		const badFn = (
			fn: { start: number; end: number; cognitive: number },
			sloc = 5,
		) => {
			const snap = full();
			snap.blobs.a = { sloc, functions: [{ name: 'f', ...fn }] };
			return snap;
		};
		expect(() =>
			assertSnapshot(badFn({ start: Number.NaN, end: 2, cognitive: 1 })),
		).toThrow(/fully measure/);
		expect(() =>
			assertSnapshot(badFn({ start: 5, end: 2, cognitive: 1 })),
		).toThrow(/fully measure/);
		expect(() =>
			assertSnapshot(badFn({ start: 1, end: 2, cognitive: -1 })),
		).toThrow(/fully measure/);
		expect(() =>
			assertSnapshot(badFn({ start: 1, end: 2, cognitive: 1 }, 0)),
		).toThrow(/fully measure/);
		const partial = full();
		partial.blobs.a = { sloc: 1, functions: [], unmeasuredFunctions: 2 };
		expect(() => assertSnapshot(partial)).toThrow();
	});

	it('validates every clone location against the scan', () => {
		const at = (path: string, start: number, end: number) => ({
			path,
			start,
			end,
		});
		const a = at('apps/api/A.cs', 1, 5);
		const ok = [{ locations: [a, at('apps/api/A.Spec.cs', 1, 5)] }];
		const stray = [...ok, { locations: [a, at('apps/api/Missing.cs', 1, 5)] }];
		const backwards = [...ok, { locations: [a, at('apps/api/A.cs', 9, 2)] }];
		const single = [{ locations: [a] }];
		expect(() => assertSnapshot({ ...full(), clones: ok })).not.toThrow();
		expect(() => assertSnapshot({ ...full(), clones: stray })).toThrow(
			/location/,
		);
		expect(() => assertSnapshot({ ...full(), clones: backwards })).toThrow(
			/location/,
		);
		expect(() => assertSnapshot({ ...full(), clones: single })).toThrow(
			/valid clone/,
		);
	});
});

describe('baseline cannot rise', () => {
	it('fails when any value, tolerance or exception rises', () => {
		const raised = {
			...baseline,
			zones: { ...baseline.zones, api: { ...zone, complexityPer1k: 11 } },
		};
		expect(checkBaselineNotRaised(baseline, raised, [])).toHaveLength(1);
		expect(
			checkBaselineNotRaised(baseline, { ...baseline, functionCap: 16 }, []),
		).toHaveLength(1);
		const waived = {
			...baseline,
			exceptions: [{ path: 'a', name: 'b', reason: 'r' }],
		};
		expect(checkBaselineNotRaised(baseline, waived, [])).toHaveLength(1);
	});

	it('allows lowering, an owner-labelled bootstrap, and the owner label', () => {
		const lowered = {
			...baseline,
			zones: { ...baseline.zones, api: { ...zone, complexityPer1k: 5 } },
		};
		expect(checkBaselineNotRaised(baseline, lowered, [])).toEqual([]);
		expect(
			checkBaselineNotRaised(null, baseline, ['quality-baseline-exception']),
		).toEqual([]);
		const raised = { ...baseline, functionCap: 20 };
		expect(
			checkBaselineNotRaised(baseline, raised, ['quality-baseline-exception']),
		).toEqual([]);
	});
});

describe('renames', () => {
	it('keeps the new path of a rename and counts a pure move as 0', () => {
		expect(renamedTo('a/{old => new}/x.ts')).toBe('a/new/x.ts');
		expect(renamedTo('old.ts => new.ts')).toBe('new.ts');
		expect(countSizedLines('0\t0\tapps/front/scripts/{a.mts => a.ts}')).toBe(0);
		expect(countSizedLines('3\t1\tapps/api/{Old => New}/A.cs')).toBe(4);
	});

	it('gives a pure rename no touched lines', () => {
		const diff =
			'diff --git a/apps/api/A.cs b/apps/api/B.cs\nsimilarity index 100%\nrename from apps/api/A.cs\nrename to apps/api/B.cs\n';
		expect(parseTouches(diff).size).toBe(0);
	});
});

describe('baseline schema and coverage', () => {
	const text = JSON.stringify(baseline);

	it('accepts a valid baseline', () => {
		expect(parseBaseline(text)).toEqual(baseline);
	});

	it('rejects quoted, deleted or mistyped thresholds and anonymous waivers', () => {
		const front = '"front":{"complexityPer1k":10,"duplicationPer1k":20},';
		const bad: [string, string][] = [
			['"tolerancePer1k":0.5', '"tolerancePer1k":"0.5"'],
			['"functionCap":15,', ''],
			['"complexityPer1k":10', '"complexityPer1k":"10"'],
			[front, ''],
			['"exceptions":[]', '"exceptions":null'],
			[
				'"exceptions":[]',
				'"exceptions":[{"path":"a","name":"<anonymous>","reason":"r"}]',
			],
		];
		for (const [from, to] of bad) {
			expect(text).toContain(from);
			expect(() => parseBaseline(text.replace(from, to))).toThrow(/invalid/);
		}
	});

	it('requires the owner label to introduce the baseline', () => {
		expect(checkBaselineNotRaised(null, baseline, [])).toHaveLength(1);
	});

	it('fails when a judged tracked file is missing from the scan', () => {
		const snap: CoderotSnapshot = {
			files: [{ path: 'apps/api/A.cs', blob: 'a', test: false }],
			blobs: {},
			clones: [],
		};
		expect(() =>
			assertCoverage(['apps/api/A.cs', 'README.md'], snap),
		).not.toThrow();
		expect(() =>
			assertCoverage(['apps/api/A.cs', 'apps/api/B.cs'], snap),
		).toThrow(/B\.cs/);
	});
});

describe('owner controls, base and size scope', () => {
	it('takes the base from the event, not a hardcoded develop', () => {
		expect(baseRef({ pull_request: { base: { sha: 'abc' } } })).toBe('abc');
		expect(baseRef({ merge_group: { base_sha: 'def' } })).toBe('def');
		expect(baseRef({})).toBe('origin/develop');
	});

	it('exempts generated or derived files from the size budget', () => {
		const stat = (f: string) => '700\t0\tpackages/scripts-ts/src/' + f;
		expect(countSizedLines(stat('reason-guard-ref.json'))).toBe(0);
		expect(countSizedLines(stat('ci-gate-manifest.json'))).toBe(700);
		expect(countSizedLines(stat('other.ts'))).toBe(700);
	});

	it('ignores deleted files when parsing touches', () => {
		const diff = '--- a/x.ts\n+++ /dev/null\n@@ -1,3 +0,0 @@\n';
		expect(parseTouches(diff).size).toBe(0);
	});
});

describe('readBaselineAt', () => {
	const git = (cwd: string, ...args: string[]) =>
		spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
			cwd,
		});

	it('returns null for an absent file, parses a present one, throws on an unreadable base', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-'));
		try {
			git(dir, 'init', '-q');
			git(dir, 'commit', '-q', '--allow-empty', '-m', 'a');
			expect(readBaselineAt('HEAD', dir)).toBeNull();
			const rel = 'packages/scripts-ts/src/quality-baseline.json';
			fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
			fs.writeFileSync(path.join(dir, rel), JSON.stringify(baseline));
			git(dir, 'add', '-A');
			git(dir, 'commit', '-q', '-m', 'b');
			expect(readBaselineAt('HEAD', dir)).toEqual(baseline);
			expect(() => readBaselineAt('deadbeef', dir)).toThrow(/cannot read/);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('remaining failure modes', () => {
	it('flags a function when a pure deletion removes its last line', () => {
		const snap = snapshot([{ name: 'big', start: 10, end: 29, cognitive: 16 }]);
		const diff =
			'diff --git a/apps/api/Modules/A.cs b/apps/api/Modules/A.cs\n+++ b/apps/api/Modules/A.cs\n@@ -30 +29,0 @@\n';
		expect(checkFunctionCap(snap, parseTouches(diff), baseline)).toHaveLength(
			1,
		);
	});

	it('fails the ratchet on NaN measures', () => {
		const nan = {
			...baseline.zones,
			api: { complexityPer1k: Number.NaN, duplicationPer1k: 1 },
		};
		expect(checkRatchet(nan, baseline)).toHaveLength(1);
	});

	it('detects a raised tolerance or size limit', () => {
		expect(
			checkBaselineNotRaised(baseline, { ...baseline, tolerancePer1k: 1 }, []),
		).toHaveLength(1);
		expect(
			checkBaselineNotRaised(
				baseline,
				{ ...baseline, prSizeMaxLines: 900 },
				[],
			),
		).toHaveLength(1);
	});

	it('checks the baseline on PRs and in the queue, size on PRs and locally', () => {
		expect(policyFor('pull_request')).toEqual({ baseline: true, size: true });
		expect(policyFor('merge_group')).toEqual({ baseline: true, size: false });
		expect(policyFor(undefined)).toEqual({ baseline: false, size: true });
	});

	it('reads the baseline at the given tip and throws on a corrupt tree', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-'));
		const git = (...a: string[]) =>
			spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
				cwd: dir,
				encoding: 'utf8',
			});
		const rel = 'packages/scripts-ts/src/quality-baseline.json';
		const commit = (b: Baseline) => {
			fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
			fs.writeFileSync(path.join(dir, rel), JSON.stringify(b));
			git('add', '-A');
			git('commit', '-q', '-m', 'c');
		};
		try {
			git('init', '-q');
			commit({ ...baseline, functionCap: 20 });
			commit({ ...baseline, functionCap: 12 });
			expect(readBaselineAt('HEAD', dir)?.functionCap).toBe(12);
			expect(readBaselineAt('HEAD~1', dir)?.functionCap).toBe(20);
			const tree = git('rev-parse', 'HEAD^{tree}').stdout.trim();
			fs.rmSync(
				path.join(dir, '.git/objects', tree.slice(0, 2), tree.slice(2)),
				{ force: true },
			);
			expect(() => readBaselineAt('HEAD', dir)).toThrow(/cannot read/);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('owner approval, waivers and trivial deletions', () => {
	it('lets a raise land unlabelled when the owner recorded it, and only that raise', () => {
		const raised = { ...baseline, functionCap: 20 };
		const approved = { ...raised, ownerApproved: ['functionCap=20'] };
		expect(checkBaselineNotRaised(baseline, approved, [])).toEqual([]);
		expect(
			checkBaselineNotRaised(baseline, { ...approved, tolerancePer1k: 2 }, []),
		).toHaveLength(1);
		expect(checkBaselineNotRaised(baseline, raised, [])).toHaveLength(1);
	});

	it('requires a named waiver and string approvals', () => {
		const text = JSON.stringify(baseline);
		const waiver = '"exceptions":[{"path":"a","name":"","reason":"r"}]';
		expect(() =>
			parseBaseline(text.replace('"exceptions":[]', waiver)),
		).toThrow(/invalid/);
		expect(() =>
			parseBaseline(
				text.replace('"exceptions":[]', '"exceptions":[],"ownerApproved":[1]'),
			),
		).toThrow(/invalid/);
	});

	it('does not flag a function for a deleted blank or comment line at its edge', () => {
		const snap = snapshot([{ name: 'big', start: 10, end: 29, cognitive: 16 }]);
		const head =
			'diff --git a/apps/api/Modules/A.cs b/apps/api/Modules/A.cs\n+++ b/apps/api/Modules/A.cs\n@@ -30 +29,0 @@\n';
		expect(
			checkFunctionCap(snap, parseTouches(head + '-\n'), baseline),
		).toEqual([]);
		expect(
			checkFunctionCap(snap, parseTouches(head + '-  // old\n'), baseline),
		).toEqual([]);
		expect(
			checkFunctionCap(snap, parseTouches(head + '-  doIt();\n'), baseline),
		).toHaveLength(1);
	});
});
