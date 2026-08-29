/**
 * Unit tests for the scanner's ability to recognise every describe shape
 * that the repo currently uses or may introduce:
 *   - test.describe.serial / .parallel / .only / .skip / .fixme
 *   - Chained modifiers like .serial.only
 *   - function() callback (instead of arrow)
 *   - Unsupported callback shapes → error, never silent ignore
 *
 * Each fixture is written to a temp file so the scanner operates on real
 * TypeScript source text (no mocks).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect } from 'vitest';

import { analyzeFile } from './tag-guard';

/** Write a temporary .spec.ts file and return its path. */
const fixture = (name: string, code: string): string => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-guard-fixture-'));
	const filePath = path.join(dir, name);
	fs.writeFileSync(filePath, code, 'utf8');
	return filePath;
}

describe('describe shape recognition', () => {
	it('test.describe.serial missing @ticket → red', () => {
		const file = fixture(
			'serial-no-ticket.spec.ts',
			"test.describe.serial('serial test', () => {\n});\n",
		);
		const results = analyzeFile(file);
		const topLevel = results.filter((d) => d.topLevel);
		expect(
			topLevel.length,
			'serial describe should be detected as top-level',
		).toBe(1);
		expect(topLevel[0]!.tags).toHaveLength(0);
	});

	it('test.describe.parallel missing @ticket → red', () => {
		const file = fixture(
			'parallel-no-ticket.spec.ts',
			"test.describe.parallel('parallel test', () => {\n});\n",
		);
		const results = analyzeFile(file);
		const topLevel = results.filter((d) => d.topLevel);
		expect(
			topLevel.length,
			'parallel describe should be detected as top-level',
		).toBe(1);
		expect(topLevel[0]!.tags).toHaveLength(0);
	});

	it('test.describe.serial.only missing @ticket → red (chained modifier)', () => {
		const file = fixture(
			'serial-only-no-ticket.spec.ts',
			"test.describe.serial.only('serial.only test', () => {\n});\n",
		);
		const results = analyzeFile(file);
		const topLevel = results.filter((d) => d.topLevel);
		expect(
			topLevel.length,
			'serial.only describe should be detected as top-level',
		).toBe(1);
		expect(topLevel[0]!.tags).toHaveLength(0);
	});

	it('function() callback with valid tags → green', () => {
		const file = fixture(
			'function-cb-valid.spec.ts',
			"test.describe('function cb test', { tag: ['@auth', '@713'] }, function () {\n});\n",
		);
		const results = analyzeFile(file);
		const topLevel = results.filter((d) => d.topLevel);
		expect(
			topLevel.length,
			'function callback describe should be detected',
		).toBe(1);
		expect(topLevel[0]!.tags).toContain('@auth');
		expect(topLevel[0]!.tags).toContain('@713');
		expect(topLevel[0]!.error).toBeUndefined();
	});

	it('function() callback without tags → red', () => {
		const file = fixture(
			'function-cb-no-tags.spec.ts',
			"test.describe('function no tags', function () {\n});\n",
		);
		const results = analyzeFile(file);
		const topLevel = results.filter((d) => d.topLevel);
		expect(
			topLevel.length,
			'function callback describe should be detected',
		).toBe(1);
		expect(topLevel[0]!.tags).toHaveLength(0);
		expect(topLevel[0]!.error).toBeUndefined();
	});

	it('unsupported callback shape → red with explicit error', () => {
		const file = fixture(
			'unsupported-shape.spec.ts',
			"const cb = () => {};\ntest.describe('unsupported', cb);\n",
		);
		const results = analyzeFile(file);
		const errored = results.filter((d) => d.error);
		expect(
			errored.length,
			'unsupported shape should produce an error record',
		).toBe(1);
		expect(errored[0]!.error).toMatch(/unsupported describe shape/);
		expect(errored[0]!.error).toContain('position');
		expect(errored[0]!.describePos).toBeGreaterThan(0);
	});

	it('test.describe.fixme missing @ticket → red', () => {
		const file = fixture(
			'fixme-no-ticket.spec.ts',
			"test.describe.fixme('fixme test', () => {\n});\n",
		);
		const results = analyzeFile(file);
		const topLevel = results.filter((d) => d.topLevel);
		expect(
			topLevel.length,
			'fixme describe should be detected as top-level',
		).toBe(1);
		expect(topLevel[0]!.tags).toHaveLength(0);
	});

	it('test.describe.only missing @ticket → red', () => {
		const file = fixture(
			'only-no-ticket.spec.ts',
			"test.describe.only('only test', () => {\n});\n",
		);
		const results = analyzeFile(file);
		const topLevel = results.filter((d) => d.topLevel);
		expect(
			topLevel.length,
			'only describe should be detected as top-level',
		).toBe(1);
		expect(topLevel[0]!.tags).toHaveLength(0);
	});

	it('modifier describe with valid tags → green', () => {
		const file = fixture(
			'modifier-valid.spec.ts',
			"test.describe.skip('skip test', { tag: ['@design', '@806'] }, () => {\n});\n",
		);
		const results = analyzeFile(file);
		const topLevel = results.filter((d) => d.topLevel);
		expect(
			topLevel.length,
			'skip describe should be detected as top-level',
		).toBe(1);
		expect(topLevel[0]!.tags).toContain('@design');
		expect(topLevel[0]!.tags).toContain('@806');
		expect(topLevel[0]!.error).toBeUndefined();
	});
});
