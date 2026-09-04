/**
 * @vitest-environment node
 *
 * Unit test for the proof classifier (classify-proof.mts).
 *
 * This test exercises the REAL classification pipeline end-to-end:
 * 1. It runs the REAL vitest on a fixture test that throws an Error
 *    whose message contains "AssertionError".
 * 2. It reads the REAL vitest JSON report produced.
 * 3. It feeds that report to the classifier.
 * 4. It asserts the verdict is CORRUPT PROOF (not OK).
 *
 * This is NOT a synthetic JSON report fabricated by hand — that would
 * only prove that our literal object is classified correctly, not that
 * the classifier holds against what vitest actually emits.
 *
 * The fixture lives under tests/fixtures/1784/ (NOT tests/proofs/) so
 * the guard's declaration-scoped replay does not pick it up. It is a
 * fixture, not a kept-red proof — it is the INPUT the classifier must
 * learn to classify, not a proof that asserts ideal behavior.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
	classifyProof,
	readProofReport,
} from '../../scripts/ci/classify-proof.mts';

const FIXTURE_PATH =
	'tests/fixtures/1784/_repro-1784-throws-assertion-error.test.ts';
const CONFIG = 'vitest.proofs.config.ts';

describe('Proof classifier — thrown Error containing AssertionError is CORRUPT PROOF', () => {
	test('classifies a thrown Error whose message contains AssertionError as CORRUPT PROOF', () => {
		// Verify the fixture exists before running.
		expect(existsSync(FIXTURE_PATH)).toBe(true);

		// Run the REAL vitest on the fixture with the REAL proof config.
		// The JSON report is the structural source of truth — we do NOT
		// fabricate a synthetic report.
		const reportFile = join(
			tmpdir(),
			`classify-test-${process.pid}-${Date.now()}.json`,
		);
		let exitCode: number;
		try {
			execFileSync(
				'pnpm',
				[
					'exec',
					'vitest',
					'run',
					'--config',
					CONFIG,
					'--no-color',
					'--reporter=json',
					`--outputFile=${reportFile}`,
					FIXTURE_PATH,
				],
				{ stdio: 'pipe', encoding: 'utf-8' },
			);
			// If execFileSync did NOT throw, vitest exited 0 = the test passed.
			// That would be unexpected — the fixture throws an Error.
			exitCode = 0;
		} catch (err) {
			const error = err as { status?: number };
			exitCode = error.status ?? 1;
		} finally {
			// Always clean up the temp report file.
			try {
				unlinkSync(reportFile);
			} catch {
				// Ignore: the file may already be gone.
			}
		}

		// The fixture throws an Error, so vitest must exit 1.
		expect(exitCode).toBe(1);

		// Read the REAL vitest JSON report — this is what the classifier
		// must classify, not a hand-crafted object.
		// Note: the report file is deleted in the finally block above,
		// so we need to re-run vitest to get a fresh report for the
		// classifier to read. This is intentional — the classifier
		// must read a real report file, not an in-memory object.
		const reportFile2 = join(
			tmpdir(),
			`classify-test2-${process.pid}-${Date.now()}.json`,
		);
		try {
			execFileSync(
				'pnpm',
				[
					'exec',
					'vitest',
					'run',
					'--config',
					CONFIG,
					'--no-color',
					'--reporter=json',
					`--outputFile=${reportFile2}`,
					FIXTURE_PATH,
				],
				{ stdio: 'pipe', encoding: 'utf-8' },
			);
		} catch {
			// Expected: the fixture throws an Error, vitest exits 1.
		}

		// The report file must exist — vitest writes it even on failure.
		expect(existsSync(reportFile2)).toBe(true);

		// Read and parse the REAL report.
		const report = readProofReport(reportFile2);

		// The report must show the test failed.
		expect(report.numFailedTests).toBeGreaterThan(0);
		expect(report.numTotalTests).toBeGreaterThan(0);

		// Classify the report.
		const result = classifyProof(report, 1);

		// The verdict MUST be CORRUPT PROOF — the fixture throws an Error,
		// which is NOT an assertion failure. The old regex
		// `/AssertionError/.test(failureMessages[0])` would have returned
		// true (false green). The new startsWith('AssertionError:') returns
		// false because the message starts with "Error:".
		expect(result.verdict).toBe('CORRUPT PROOF');
		expect(result.reason).toContain('thrown Error');

		// Clean up.
		try {
			unlinkSync(reportFile2);
		} catch {
			// Ignore.
		}
	});
});
