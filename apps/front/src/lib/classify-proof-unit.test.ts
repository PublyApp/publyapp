/**
 * @vitest-environment node
 *
 * Unit tests for readProofReport and classifyProof.
 *
 * These tests exercise the classifier's branches directly with crafted
 * reports. The integration test (classify-proof.test.ts) already proves
 * the full pipeline with a real vitest run; these tests prove the
 * edge cases that are hard to trigger end-to-end:
 *
 * - readProofReport: missing file, empty file, invalid JSON, wrong shape
 * - classifyProof: OK, CORRUPT PROOF, NO_TESTS, UNEXPECTED_PASS, ERROR
 */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
	classifyProof,
	readProofReport,
} from '../../scripts/ci/classify-proof.mts';

// --- Helpers ---

const TMP = join(tmpdir(), `classify-unit-${process.pid}`);

beforeAll(() => {
	mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
	rmSync(TMP, { recursive: true, force: true });
});

function writeReport(name: string, content: string): string {
	const path = join(TMP, name);
	writeFileSync(path, content);
	return path;
}

// --- readProofReport: unreadable reports ---

describe('readProofReport — unreadable reports fail loud', () => {
	test('missing file throws naming the cause', () => {
		expect(() => readProofReport(join(TMP, 'nope.json'))).toThrow(/not found/);
	});

	test('empty file throws naming the cause', () => {
		const path = writeReport('empty.json', '');
		expect(() => readProofReport(path)).toThrow(/empty \(0 bytes\)/);
	});

	test('invalid JSON throws naming the cause', () => {
		const path = writeReport('garbage.json', '{ not json ');
		expect(() => readProofReport(path)).toThrow(/not valid JSON/);
	});

	test('non-object JSON throws naming the cause', () => {
		const path = writeReport('literal.json', '"just a string"');
		expect(() => readProofReport(path)).toThrow(/not an object/);
	});

	test('missing numTotalTests throws naming the cause', () => {
		const path = writeReport(
			'missing-num.json',
			JSON.stringify({ testResults: [] }),
		);
		expect(() => readProofReport(path)).toThrow(/missing numTotalTests/);
	});

	test('missing testResults array throws naming the cause', () => {
		const path = writeReport(
			'missing-results.json',
			JSON.stringify({ numTotalTests: 0, numFailedTests: 0 }),
		);
		expect(() => readProofReport(path)).toThrow(/missing testResults array/);
	});

	test('non-object test result throws naming the cause', () => {
		const path = writeReport(
			'bad-result.json',
			JSON.stringify({
				numTotalTests: 1,
				numFailedTests: 1,
				testResults: ['not an object'],
			}),
		);
		expect(() => readProofReport(path)).toThrow(/non-object test result/);
	});

	test('non-object assertion result throws naming the cause', () => {
		const path = writeReport(
			'bad-assertion.json',
			JSON.stringify({
				numTotalTests: 1,
				numFailedTests: 1,
				testResults: [{ assertionResults: ['not an object'] }],
			}),
		);
		expect(() => readProofReport(path)).toThrow(/non-object assertion result/);
	});

	test('non-string status throws naming the cause', () => {
		const path = writeReport(
			'bad-status.json',
			JSON.stringify({
				numTotalTests: 1,
				numFailedTests: 1,
				testResults: [{ assertionResults: [{ status: 42 }] }],
			}),
		);
		expect(() => readProofReport(path)).toThrow(/'status' is not a string/);
	});

	test('non-array failureMessages throws naming the cause', () => {
		const path = writeReport(
			'bad-messages.json',
			JSON.stringify({
				numTotalTests: 1,
				numFailedTests: 1,
				testResults: [
					{
						assertionResults: [
							{ status: 'failed', failureMessages: 'not array' },
						],
					},
				],
			}),
		);
		expect(() => readProofReport(path)).toThrow(
			/'failureMessages' is not an array of strings/,
		);
	});
});

// --- classifyProof: verdicts ---

describe('classifyProof — assertion failure is OK', () => {
	test('failed test starting with AssertionError: is OK', () => {
		const report = {
			numTotalTests: 1,
			numFailedTests: 1,
			testResults: [
				{
					assertionResults: [
						{
							status: 'failed',
							failureMessages: ['AssertionError: expected "a" to be "b"'],
						},
					],
				},
			],
		};

		const result = classifyProof(report, 1);

		expect(result.verdict).toBe('OK');
		expect(result.reason).toContain('assertion failure');
		expect(result.failedTests).toBe(1);
		expect(result.totalTests).toBe(1);
	});
});

describe('classifyProof — thrown Error is CORRUPT PROOF', () => {
	test('failed test starting with Error: is CORRUPT PROOF', () => {
		const report = {
			numTotalTests: 1,
			numFailedTests: 1,
			testResults: [
				{
					assertionResults: [
						{
							status: 'failed',
							failureMessages: ['Error: something went wrong in the harness'],
						},
					],
				},
			],
		};

		const result = classifyProof(report, 1);

		expect(result.verdict).toBe('CORRUPT PROOF');
		expect(result.reason).toContain('thrown Error');
	});

	test('failed test starting with TypeError: is CORRUPT PROOF', () => {
		const report = {
			numTotalTests: 1,
			numFailedTests: 1,
			testResults: [
				{
					assertionResults: [
						{
							status: 'failed',
							failureMessages: [
								"TypeError: Cannot read properties of undefined (reading 'foo')",
							],
						},
					],
				},
			],
		};

		const result = classifyProof(report, 1);

		expect(result.verdict).toBe('CORRUPT PROOF');
		expect(result.reason).toContain('thrown Error');
	});

	test('failed test whose message contains AssertionError but does not start with it is CORRUPT PROOF', () => {
		// This is the exact case the old regex got wrong.
		const report = {
			numTotalTests: 1,
			numFailedTests: 1,
			testResults: [
				{
					assertionResults: [
						{
							status: 'failed',
							failureMessages: ['Error: AssertionError: something went wrong'],
						},
					],
				},
			],
		};

		const result = classifyProof(report, 1);

		expect(result.verdict).toBe('CORRUPT PROOF');
		expect(result.reason).toContain('thrown Error');
	});
});

describe('classifyProof — MESURE IMPOSSIBLE is CORRUPT PROOF', () => {
	test('failed test with MESURE IMPOSSIBLE marker is CORRUPT PROOF', () => {
		const report = {
			numTotalTests: 1,
			numFailedTests: 1,
			testResults: [
				{
					assertionResults: [
						{
							status: 'failed',
							failureMessages: [
								'AssertionError: MESURE IMPOSSIBLE — harness could not extract',
							],
						},
					],
				},
			],
		};

		const result = classifyProof(report, 1);

		expect(result.verdict).toBe('CORRUPT PROOF');
		expect(result.reason).toContain('measurement impossible');
	});
});

describe('classifyProof — no tests is NO_TESTS', () => {
	test('zero total tests is NO_TESTS', () => {
		const report = {
			numTotalTests: 0,
			numFailedTests: 0,
			testResults: [],
		};

		const result = classifyProof(report, 1);

		expect(result.verdict).toBe('NO_TESTS');
		expect(result.reason).toContain('no test cases');
	});
});

describe('classifyProof — unexpected pass is UNEXPECTED_PASS', () => {
	test('exit code 0 is UNEXPECTED_PASS', () => {
		const report = {
			numTotalTests: 1,
			numFailedTests: 0,
			testResults: [
				{
					assertionResults: [
						{
							status: 'passed',
							failureMessages: [],
						},
					],
				},
			],
		};

		const result = classifyProof(report, 0);

		expect(result.verdict).toBe('UNEXPECTED_PASS');
		expect(result.reason).toContain('passed unexpectedly');
	});
});

describe('classifyProof — unexpected exit code is ERROR', () => {
	test('exit code 2 is ERROR', () => {
		const report = {
			numTotalTests: 1,
			numFailedTests: 1,
			testResults: [
				{
					assertionResults: [
						{
							status: 'failed',
							failureMessages: ['AssertionError: x'],
						},
					],
				},
			],
		};

		const result = classifyProof(report, 2);

		expect(result.verdict).toBe('ERROR');
		expect(result.reason).toContain('unexpected code 2');
	});
});
