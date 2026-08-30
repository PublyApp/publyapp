/**
 * classify-proof.mts — structural classification of a proof test's failure mode.
 *
 * This module extracts the classification logic from run-preuves.mts so it can
 * be unit-tested independently. The logic is unchanged — it is only factored
 * out so a test can feed it a real vitest JSON report and assert the verdict.
 *
 * The classifier answers one binary question: did this proof fail on an
 * ASSERTION, or did it fail on a THROWN ERROR? Both produce "Tests 1 failed"
 * and exit code 1, but they mean different things:
 *
 * - Assertion failure → the proof measured and the ideal is not met
 *   (kept-red, the expected state) → OK.
 * - Thrown Error (measurement impossible, harness crash, extraction failure)
 *   → the proof could NOT measure. This is NOT the expected kept-red state —
 *   it is a broken measurement → CORRUPT PROOF.
 *
 * Classification is structural: it reads the first token of
 * `failureMessages[0]` from vitest's JSON report, never regex on display text.
 */
import { readFileSync, existsSync } from 'node:fs';

/**
 * Structural shape of the vitest JSON report that `readProofReport` parses.
 */
export interface ProofReport {
	numTotalTests: number;
	numFailedTests: number;
	testResults: Array<{
		assertionResults: Array<{
			status: string;
			failureMessages: string[];
		}>;
	}>;
}

/**
 * The five verdicts the classifier can return.
 */
type ClassificationVerdict =
	| 'OK' // assertion failure — expected kept-red
	| 'CORRUPT PROOF' // thrown Error or measurement impossible
	| 'NO_TESTS' // vitest found no test cases
	| 'UNEXPECTED_PASS' // test passed when it should have failed
	| 'ERROR'; // unexpected exit code

/**
 * A classification result: the verdict plus the evidence that led to it.
 */
export interface ClassificationResult {
	verdict: ClassificationVerdict;
	reason: string;
	exitCode: number;
	failedTests: number;
	totalTests: number;
}

/**
 * Read and validate the vitest JSON report from --outputFile.
 *
 * The report is the single source of structural truth for classifying a
 * proof. Any deviation — missing file, empty file, invalid JSON, or a
 * shape that lacks the fields we read — is an UNREADABLE REPORT and MUST
 * fail loud naming the cause. We never fall back to text heuristics nor
 * to a compliant default: an input we cannot parse is not replaced by a
 * "failed as expected" verdict.
 *
 * The four unreadable-report cases each get their own error so the
 * message names the cause:
 *   1. File absent   → "not found"
 *   2. File empty    → "empty (0 bytes)"
 *   3. File garbage  → "not valid JSON" + the parse error
 *   4. Wrong shape   → "missing numTotalTests/numFailedTests" or
 *                      "missing testResults array"
 */
export const readProofReport = (reportPath: string): ProofReport => {
	if (!existsSync(reportPath)) {
		throw new Error(
			`vitest JSON report not found at ${reportPath} — vitest exited ` +
				`without writing a report. The test file may have a syntax error ` +
				`or the test setup may have crashed before the JSON reporter ` +
				`could write.`,
		);
	}

	const buf = readFileSync(reportPath);
	if (buf.length === 0) {
		throw new Error(
			`vitest JSON report is empty (0 bytes) at ${reportPath} — vitest ` +
				`wrote no data. The test file may be unparseable.`,
		);
	}

	const raw = buf.toString('utf-8');

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		throw new Error(
			`vitest JSON report is not valid JSON at ${reportPath}: ` +
				`${(err as Error).message} — the output is truncated or the ` +
				`process was interrupted.`,
		);
	}

	if (typeof parsed !== 'object' || parsed === null) {
		throw new Error(
			`vitest JSON report is not an object at ${reportPath} — ` +
				`the reporter output is malformed.`,
		);
	}
	const obj = parsed as Record<string, unknown>;

	if (
		typeof obj.numTotalTests !== 'number' ||
		typeof obj.numFailedTests !== 'number'
	) {
		throw new Error(
			`vitest JSON report missing numTotalTests/numFailedTests at ` +
				`${reportPath} — the reporter output is malformed.`,
		);
	}

	if (!Array.isArray(obj.testResults)) {
		throw new Error(
			`vitest JSON report missing testResults array at ${reportPath} — ` +
				`the reporter output is malformed.`,
		);
	}

	// Build the narrowed value from the validated pieces instead of asserting
	// the shape onto `obj`. An assertion chain would have hidden a real gap:
	// nothing below `assertionResults` was checked, yet `status` and
	// `failureMessages[0]` are exactly what the classifier reads. An entry we
	// cannot read must fail loud here, at the boundary — never reach the
	// classifier as a plausible default.
	const testResults: ProofReport['testResults'] = [];
	for (const suite of obj.testResults) {
		if (typeof suite !== 'object' || suite === null) {
			throw new Error(
				`vitest JSON report has a non-object test result at ${reportPath}.`,
			);
		}
		const suiteObj = suite as Record<string, unknown>;
		if (!Array.isArray(suiteObj.assertionResults)) {
			throw new Error(
				`vitest JSON report has a test result missing assertionResults ` +
					`at ${reportPath}.`,
			);
		}
		const assertionResults: ProofReport['testResults'][number]['assertionResults'] =
			[];
		for (const assertion of suiteObj.assertionResults) {
			if (typeof assertion !== 'object' || assertion === null) {
				throw new Error(
					`vitest JSON report has a non-object assertion result at ` +
						`${reportPath}.`,
				);
			}
			const assertionObj = assertion as Record<string, unknown>;
			if (typeof assertionObj.status !== 'string') {
				throw new Error(
					`vitest JSON report has an assertion result whose 'status' is ` +
						`not a string at ${reportPath} — the reporter output is ` +
						`malformed.`,
				);
			}
			if (
				!Array.isArray(assertionObj.failureMessages) ||
				assertionObj.failureMessages.some(
					(message) => typeof message !== 'string',
				)
			) {
				throw new Error(
					`vitest JSON report has an assertion result whose ` +
						`'failureMessages' is not an array of strings at ` +
						`${reportPath} — classification reads failureMessages[0], so ` +
						`an unreadable value must not be classified at all.`,
				);
			}
			assertionResults.push({
				status: assertionObj.status,
				failureMessages: assertionObj.failureMessages as string[],
			});
		}
		testResults.push({ assertionResults });
	}

	return {
		numTotalTests: obj.numTotalTests,
		numFailedTests: obj.numFailedTests,
		testResults,
	};
};

/**
 * Classify a proof test's failure mode from its vitest JSON report.
 *
 * @param report   The parsed vitest JSON report (from `readProofReport`).
 * @param exitCode The exit code vitest returned.
 * @returns The classification result with verdict and evidence.
 */
export const classifyProof = (
	report: ProofReport,
	exitCode: number,
): ClassificationResult => {
	const ranTests = report.numFailedTests > 0;
	const noTests = report.numTotalTests === 0;

	// An assertion failure in vitest is reported with the error type
	// as the first token of the failure message: "AssertionError: ...".
	// A thrown error (Error, TypeError, ...) starts with that type
	// instead: "Error: ...". Checking the first token distinguishes
	// "the proof measured and the ideal is not met" (assertion
	// failure, the expected kept-red state) from "the proof could not
	// measure" (thrown Error — harness crash, extraction failure).
	const hasAssertionFailure = report.testResults.some((suite) =>
		suite.assertionResults.some(
			(t) =>
				t.status === 'failed' &&
				t.failureMessages.length > 0 &&
				t.failureMessages[0]!.startsWith('AssertionError:'),
		),
	);

	// The measurement-impossible marker is carried in the failure
	// message. We check every failed test's messages, not just the
	// first — a proof can fail on multiple axes and any of them may
	// carry the marker.
	const hasMeasurementError = report.testResults.some((suite) =>
		suite.assertionResults.some(
			(t) =>
				t.status === 'failed' &&
				t.failureMessages.some((m) => m.includes('MESURE IMPOSSIBLE')),
		),
	);

	if (exitCode === 0) {
		return {
			verdict: 'UNEXPECTED_PASS',
			reason:
				'proof test passed unexpectedly — the bug it documented may have changed form.',
			exitCode,
			failedTests: report.numFailedTests,
			totalTests: report.numTotalTests,
		};
	}

	if (
		exitCode === 1 &&
		ranTests &&
		hasAssertionFailure &&
		!hasMeasurementError
	) {
		return {
			verdict: 'OK',
			reason: 'proof test failed as expected (assertion failure).',
			exitCode,
			failedTests: report.numFailedTests,
			totalTests: report.numTotalTests,
		};
	}

	if (
		exitCode === 1 &&
		ranTests &&
		(!hasAssertionFailure || hasMeasurementError)
	) {
		const reason = hasMeasurementError
			? 'measurement impossible (MESURE IMPOSSIBLE)'
			: 'thrown Error (not an assertion failure)';
		return {
			verdict: 'CORRUPT PROOF',
			reason: `proof test failed with ${reason}, not the expected assertion failure.`,
			exitCode,
			failedTests: report.numFailedTests,
			totalTests: report.numTotalTests,
		};
	}

	if (exitCode === 1 && noTests) {
		return {
			verdict: 'NO_TESTS',
			reason: 'vitest found no test cases (empty/truncated/not a test).',
			exitCode,
			failedTests: report.numFailedTests,
			totalTests: report.numTotalTests,
		};
	}

	return {
		verdict: 'ERROR',
		reason: `proof test exited with unexpected code ${exitCode}.`,
		exitCode,
		failedTests: report.numFailedTests,
		totalTests: report.numTotalTests,
	};
};
