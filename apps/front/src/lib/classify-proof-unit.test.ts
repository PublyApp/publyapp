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
	classifyProofWithManifest,
	readProofReport,
	type ExpectedRedManifest,
	type ProofReport,
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
							{
								fullName: 'suite bad messages',
								status: 'failed',
								failureMessages: 'not array',
							},
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
							fullName: 'suite kept-red fails on assertion',
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
							fullName: 'suite thrown error',
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
							fullName: 'suite type error',
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
							fullName: 'suite wrap-assertion-in-error',
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
							fullName: 'suite mesure impossible',
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
							fullName: 'suite unexpected pass',
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
							fullName: 'suite unexpected exit code',
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

// --- classifyProofWithManifest: verdicts (r8 per-test expectation path) ---

// The r8 manifest classifier layers per-test kept-red expectations on top of
// the r7 global classifier. These tests cover the two verdicts the global
// classifier cannot produce: DECLARED RED PASSED (a declared kept-red test
// went green) and the manifest-driven CORRUPT PROOF cases (declared test
// missing from the report, or skipped/pending). The behavior itself is
// verified end-to-end by the preuves replay; these unit tests pin the verdict
// logic so a regression in classifyProofWithManifest turns a named test red
// instead of waiting for a CI replay.

describe('classifyProofWithManifest — base CORRUPT PROOF passes through', () => {
	test('a thrown Error report stays CORRUPT PROOF even with a valid manifest', () => {
		const report: ProofReport = {
			numTotalTests: 1,
			numFailedTests: 1,
			testResults: [
				{
					assertionResults: [
						{
							fullName: 'suite throws',
							status: 'failed',
							failureMessages: ['Error: harness crash'],
						},
					],
				},
			],
		};

		const manifest: ExpectedRedManifest = {
			expectedRed: [{ testName: 'throws', why: 'must measure the bug' }],
		};

		const result = classifyProofWithManifest(report, 1, manifest);

		expect(result.verdict).toBe('CORRUPT PROOF');
		expect(result.reason).toContain('thrown Error');
	});
});

describe('classifyProofWithManifest — declared kept-red test PASSED is DECLARED RED PASSED', () => {
	test('a passed declared-red test yields DECLARED RED PASSED even when another test still fails on an assertion', () => {
		// The r8 angle mort: the global classifier sees an AssertionError and
		// reports OK; the per-test classifier must catch that the DECLARED
		// kept-red test went green and report DECLARED RED PASSED instead.
		const report: ProofReport = {
			numTotalTests: 2,
			numFailedTests: 1,
			testResults: [
				{
					assertionResults: [
						{
							fullName: 'suite other test still fails',
							status: 'failed',
							failureMessages: ['AssertionError: expected 1 to be 2'],
						},
						{
							fullName: 'suite the declared red went green',
							status: 'passed',
							failureMessages: [],
						},
					],
				},
			],
		};

		const manifest: ExpectedRedManifest = {
			expectedRed: [
				{
					testName: 'the declared red went green',
					why: 'must fail on correct code',
				},
			],
		};

		const result = classifyProofWithManifest(report, 1, manifest);

		expect(result.verdict).toBe('DECLARED RED PASSED');
		expect(result.reason).toContain('declared kept-red test PASSED');
	});
});

describe('classifyProofWithManifest — manifest-driven CORRUPT PROOF cases', () => {
	test('a declared kept-red test missing from the report is CORRUPT PROOF', () => {
		const report: ProofReport = {
			numTotalTests: 1,
			numFailedTests: 1,
			testResults: [
				{
					assertionResults: [
						{
							fullName: 'suite only test',
							status: 'failed',
							failureMessages: ['AssertionError: expected 1 to be 2'],
						},
					],
				},
			],
		};

		const manifest: ExpectedRedManifest = {
			expectedRed: [{ testName: 'ghost test', why: 'declared but gone' }],
		};

		const result = classifyProofWithManifest(report, 1, manifest);

		expect(result.verdict).toBe('CORRUPT PROOF');
		expect(result.reason).toContain('not found in vitest report');
	});

	test('a declared kept-red test that was skipped is CORRUPT PROOF', () => {
		const report: ProofReport = {
			numTotalTests: 2,
			numFailedTests: 1,
			testResults: [
				{
					assertionResults: [
						{
							fullName: 'suite red one',
							status: 'failed',
							failureMessages: ['AssertionError: expected a to be b'],
						},
						{
							fullName: 'suite skipped red',
							status: 'skipped',
							failureMessages: [],
						},
					],
				},
			],
		};

		const manifest: ExpectedRedManifest = {
			expectedRed: [{ testName: 'skipped red', why: 'must fail, not skip' }],
		};

		const result = classifyProofWithManifest(report, 1, manifest);

		expect(result.verdict).toBe('CORRUPT PROOF');
		expect(result.reason).toContain('skipped/pending');
	});
});

describe('classifyProofWithManifest — all declared tests red is OK (control)', () => {
	test('every declared kept-red test failing on an assertion yields OK', () => {
		const report: ProofReport = {
			numTotalTests: 2,
			numFailedTests: 2,
			testResults: [
				{
					assertionResults: [
						{
							fullName: 'suite red one',
							status: 'failed',
							failureMessages: ['AssertionError: expected a to be b'],
						},
						{
							fullName: 'suite red two',
							status: 'failed',
							failureMessages: ['AssertionError: expected b to be c'],
						},
					],
				},
			],
		};

		const manifest: ExpectedRedManifest = {
			expectedRed: [
				{ testName: 'red one', why: 'first kept-red axis' },
				{ testName: 'red two', why: 'second kept-red axis' },
			],
		};

		const result = classifyProofWithManifest(report, 1, manifest);

		expect(result.verdict).toBe('OK');
		expect(result.reason).toContain('2 declared kept-red');
	});
});
