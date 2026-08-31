/**
 * Unit tests for the guard-coverage gate (issue #1525, round 2).
 *
 * The gate exists to make "every front guard routes through run-guarded.mts"
 * an ENFORCED statement instead of a documented wish: the round-1 review of
 * #1525 counted 9 of 39 pnpm scripts bypassing the wrapper (including a bare
 * `node --test` inside the main `pnpm --filter front test` chain), and knip —
 * which traces `node --test` natively — cannot see wrapper usage, so nothing
 * failed when the coverage drifted. These tests pin the gate's behaviour
 * against the REAL artifact and against the failure modes an unwrapped
 * future would reintroduce:
 *
 * - REAL ARTIFACT: the real `apps/front/package.json` must analyse with zero
 *   findings. A future guard added without the wrapper turns this test red,
 *   naming the script (rule: the guard must attend the real artifact).
 * - NAMES THE SCRIPT: synthetic package.json records with unwrapped bare
 *   `node` invocations produce findings whose `script` field names the
 *   offender. lint/no-floating-promises note: same `void test(...)` and
 *   `node:test` convention as the other guard tests.
 * - GUARD FAMILIES: a family script that does not invoke run-guarded.mts at
 *   all (bare `vitest run` / `playwright test` shape) is a named finding.
 * - LONG-RUNNING EXEMPTIONS: `start` (node server.mjs) is exempted with a
 *   stated reason and must NOT produce a finding; the reason is visible in
 *   the exemption record itself.
 * - FAIL-CLOSED: an empty family, a missing file, unparseable JSON, and a
 *   missing/non-string `scripts` map all throw loud errors — never a
 *   compliant empty. Only a real empty analysis is green.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
	analyzeScripts,
	loadScripts,
	LONG_RUNNING_EXEMPTIONS,
} from './check-guard-coverage.mts';

const here = path.dirname(import.meta.filename ?? import.meta.url);
const frontDir = path.resolve(here, '..', '..');
const realPackageJson = path.join(frontDir, 'package.json');

void test('the real apps/front/package.json has zero findings (real artifact)', () => {
	const scripts = loadScripts(realPackageJson);
	const findings = analyzeScripts(scripts);
	assert.deepEqual(
		findings,
		[],
		'expected the real guard families to all route through run-guarded.mts; got findings ' +
			JSON.stringify(findings, null, 2),
	);
});

void test('a bare `node --test` in a family script is a finding naming the script', () => {
	const findings = analyzeScripts({
		'test:typecheck-coverage-guard':
			'node --test scripts/guards/check-typecheck-coverage.test.mts',
		'test:ok':
			'node scripts/run-guarded.mts --test scripts/guards/check-ok.test.mts',
	});
	const offender = findings.find(
		(finding) => finding.script === 'test:typecheck-coverage-guard',
	);
	assert.ok(offender, 'expected a finding for the unwrapped family script');
	assert.ok(
		offender!.script === 'test:typecheck-coverage-guard',
		'expected the finding to NAME the offending script',
	);
	assert.ok(
		offender!.detail.includes(
			'node --test scripts/guards/check-typecheck-coverage.test.mts',
		),
		`expected the detail to name the offending invocation: ${offender!.detail}`,
	);
});

void test('a bare `node` in a non-family script is a finding naming the script', () => {
	const findings = analyzeScripts({
		typecheck:
			'tsc --noEmit && node scripts/guards/check-typecheck-coverage.mts',
		'test:ok': 'node scripts/run-guarded.mts scripts/guards/check-ok.mts',
	});
	assert.equal(findings.length, 1);
	assert.equal(findings[0]!.script, 'typecheck');
	assert.match(findings[0]!.detail, /check-typecheck-coverage\.mts/);
});

void test('a guard-family script with no wrapper invocation is a named finding', () => {
	const findings = analyzeScripts({
		'check:ok': 'node scripts/run-guarded.mts scripts/guards/check-ok.mts',
		'test:drawer-contrast': 'vitest run --config vitest.drawer.config.ts',
	});
	assert.equal(findings.length, 1);
	assert.equal(findings[0]!.script, 'test:drawer-contrast');
	assert.match(findings[0]!.detail, /run-guarded\.mts/);
});

void test('the long-running `start` exemption carries its reason and never flags', () => {
	assert.ok(
		LONG_RUNNING_EXEMPTIONS.start,
		'expected an exemption entry for `start` with a reason string',
	);
	assert.ok(
		String(LONG_RUNNING_EXEMPTIONS.start).length > 24,
		'expected the exemption reason to say WHY `start` is exempt',
	);
	const findings = analyzeScripts({
		start: 'node server.mjs',
		dev: 'vite dev',
		'test:ok': 'node scripts/run-guarded.mts scripts/guards/check-ok.mts',
	});
	assert.deepEqual(findings, []);
});

void test('an empty guard family is a loud throw, not a compliant green', () => {
	assert.throws(
		() => analyzeScripts({ start: 'node server.mjs' }),
		/no test:\/check:\/verify: scripts found/,
	);
});

void test('a missing package.json is a loud throw', () => {
	const missing = path.join(frontDir, 'no-such-package.json');
	assert.throws(
		() => loadScripts(missing),
		/cannot read .*no-such-package\.json/,
	);
});

void test('unparseable package.json is a loud throw', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'guard-coverage-'));
	try {
		const broken = path.join(dir, 'package.json');
		await writeFile(broken, '{ this is not json', 'utf8');
		assert.throws(() => loadScripts(broken), /cannot parse .* as JSON/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

void test('a scripts map that is missing is a loud throw', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'guard-coverage-'));
	try {
		const incomplete = path.join(dir, 'package.json');
		await writeFile(incomplete, JSON.stringify({ name: 'front' }), 'utf8');
		assert.throws(() => loadScripts(incomplete), /has no "scripts" object/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

void test('a non-string script value is a loud throw, never a silent skip', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'guard-coverage-'));
	try {
		const bogus = path.join(dir, 'package.json');
		await writeFile(
			bogus,
			JSON.stringify({ scripts: { 'test:ok': { nested: true } } }),
			'utf8',
		);
		assert.throws(() => loadScripts(bogus), /is not a string/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

void test('a family script delegating via pnpm is a named finding', () => {
	// The next author's most likely escape: `test:foo: pnpm other:bar` where
	// `other:bar` is wrapped. The family script itself is not wrapped — the
	// guard must flag it, not trace through pnpm indirections.
	const findings = analyzeScripts({
		'test:foo': 'pnpm other:bar',
		'other:bar': 'node scripts/run-guarded.mts scripts/bar.mts',
	});
	const offender = findings.find((finding) => finding.script === 'test:foo');
	assert.equal(offender!.script, 'test:foo');
	assert.match(offender!.detail, /run-guarded\.mts/);
});

void test('a wrapper invocation through a ./ prefix is a bare-node finding', () => {
	// `node ./scripts/run-guarded.mts ...` is the same wrapper — but written
	// differently; the rule pins the exact `node scripts/run-guarded.mts`
	// form so an alternate spelling cannot smuggle a bare runner past it.
	const findings = analyzeScripts({
		'test:ok': 'node ./scripts/run-guarded.mts scripts/guards/check-ok.mts',
	});
	const offender = findings.find((finding) => finding.script === 'test:ok');
	assert.equal(offender!.script, 'test:ok');
	assert.match(offender!.detail, /bare node invocation/);
});
