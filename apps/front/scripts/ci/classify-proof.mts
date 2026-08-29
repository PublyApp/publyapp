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
			fullName: string;
			status: string;
			failureMessages: string[];
		}>;
	}>;
}

/**
 * A per-test kept-red declaration read from the versioned
 * `.expected-red.json` manifest that sits next to a paired red proof.
 * The runner enforces that a test declared `expected: true` MUST fail
 * on correct code; if it passes, the runner reports CORRUPT PROOF even
 * when other tests in the file still fail with assertion errors. This
 * is the r8 fix for the angle mort identified in #1863, scoped to this
 * proof file.
 */
interface ExpectedRedDeclaration {
	testName: string;
	why: string;
}

/**
 * Validated shape of the `.expected-red.json` manifest. The file MUST
 * declare at least one kept-red test; an empty declaration is
 * indistinguishable from "I forgot to declare anything" and the runner
 * must refuse to classify on it.
 */
export interface ExpectedRedManifest {
	expectedRed: ExpectedRedDeclaration[];
}

/**
 * The six verdicts the classifier can return.
 */
type ClassificationVerdict =
	| 'OK' // assertion failure — expected kept-red
	| 'CORRUPT PROOF' // thrown Error or measurement impossible
	| 'NO_TESTS' // vitest found no test cases
	| 'UNEXPECTED_PASS' // test passed when it should have failed
	| 'DECLARED RED PASSED' // a declared kept-red test passed (proof is stale)
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
export function readProofReport(reportPath: string): ProofReport {
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
			if (typeof assertionObj.fullName !== 'string') {
				throw new Error(
					`vitest JSON report has an assertion result whose 'fullName' is ` +
						`not a string at ${reportPath} — the reporter output is ` +
						`malformed. Per-test expectation matching reads fullName; an ` +
						`unreadable value must not be classified at all.`,
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
				fullName: assertionObj.fullName,
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
}

/**
 * Classify a proof test's failure mode from its vitest JSON report.
 *
 * @param report   The parsed vitest JSON report (from `readProofReport`).
 * @param exitCode The exit code vitest returned.
 * @returns The classification result with verdict and evidence.
 */
export function classifyProof(
	report: ProofReport,
	exitCode: number,
): ClassificationResult {
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
}

/**
 * Read and validate a `.expected-red.json` per-test expectation manifest
 * that sits next to a paired red proof file. The manifest is a versioned
 * declaration: the runner refuses to classify on an unreadable or
 * incomplete manifest. An empty `expectedRed` array is rejected: it is
 * indistinguishable from "I forgot to declare anything" and a default-
 * compliant verdict on an unreadable input is the exact failure class
 * the runner must prevent.
 *
 * @param manifestPath Absolute path to the manifest JSON file.
 * @returns The validated manifest.
 * @throws On missing file, empty file, invalid JSON, wrong shape, empty
 *         `expectedRed` array, or any entry whose `testName`/`why` is
 *         not a non-empty string. Each error names the cause; no
 *         default-compliant value is ever returned.
 */
export function readExpectedRedManifest(
	manifestPath: string,
): ExpectedRedManifest {
	if (!existsSync(manifestPath)) {
		throw new Error(
			`expected-red manifest not found at ${manifestPath} — the runner ` +
				`refuses to classify a paired red proof without a per-test ` +
				`expectation declaration. Add the file and declare which tests ` +
				`are expected to stay red.`,
		);
	}

	const buf = readFileSync(manifestPath);
	if (buf.length === 0) {
		throw new Error(
			`expected-red manifest is empty (0 bytes) at ${manifestPath} — ` +
				`the file must declare at least one kept-red test.`,
		);
	}

	const raw = buf.toString('utf-8');

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		throw new Error(
			`expected-red manifest is not valid JSON at ${manifestPath}: ` +
				(err as Error).message,
		);
	}

	if (typeof parsed !== 'object' || parsed === null) {
		throw new Error(
			`expected-red manifest is not an object at ${manifestPath}.`,
		);
	}

	const obj = parsed as Record<string, unknown>;
	if (!Array.isArray(obj.expectedRed)) {
		throw new Error(
			`expected-red manifest missing or non-array 'expectedRed' at ` +
				`${manifestPath}.`,
		);
	}
	if (obj.expectedRed.length === 0) {
		throw new Error(
			`expected-red manifest declares ZERO kept-red tests at ` +
				`${manifestPath} — an empty declaration is indistinguishable ` +
				`from "I forgot to declare anything". The runner refuses to ` +
				`classify on a manifest that names no expected-red tests.`,
		);
	}

	const expectedRed: ExpectedRedDeclaration[] = [];
	for (let i = 0; i < obj.expectedRed.length; i += 1) {
		const entry = obj.expectedRed[i]!;
		if (typeof entry !== 'object' || entry === null) {
			throw new Error(
				`expected-red manifest entry #${i} is not an object at ` +
					`${manifestPath}.`,
			);
		}
		const e = entry as Record<string, unknown>;
		if (typeof e.testName !== 'string' || e.testName.length === 0) {
			throw new Error(
				`expected-red manifest entry #${i} has empty or non-string ` +
					`'testName' at ${manifestPath}.`,
			);
		}
		if (typeof e.why !== 'string' || e.why.length === 0) {
			throw new Error(
				`expected-red manifest entry #${i} has empty or non-string ` +
					`'why' at ${manifestPath}.`,
			);
		}
		expectedRed.push({ testName: e.testName, why: e.why });
	}

	return { expectedRed };
}

/**
 * Classify a proof test's failure mode using both the global failure
 * signal (the r7 logic) AND the per-test expectation manifest (the r8
 * fix for the angle mort identified in #1863, scoped to this proof
 * file). A kept-red test declared in the manifest that PASSES is a
 * CORRUPT PROOF — even when other tests in the file still fail with
 * assertion errors. This closes the gap the r7 verdict named: a paired
 * weakening of the detection logic and its sanity check (adv-1) or a
 * bracket-notation mutation on the production handler (adv-2) both
 * made one of the proof's two declared kept-red tests pass while the
 * other still failed on an AssertionError. The r7 global classifier
 * saw an AssertionError and reported OK (CI green); the r8 per-test
 * classifier sees a passed declared-red test and reports CORRUPT PROOF
 * (CI red).
 *
 * @param report   The parsed vitest JSON report.
 * @param exitCode The exit code vitest returned.
 * @param manifest The validated per-test expectation manifest.
 * @returns The classification result with verdict and evidence.
 */
export function classifyProofWithManifest(
	report: ProofReport,
	exitCode: number,
	manifest: ExpectedRedManifest,
): ClassificationResult {
	// Step 1: re-apply the r7 global logic so any existing CORRUPT
	// PROOF / NO_TESTS / UNEXPECTED_PASS conditions are still caught
	// before we layer the per-test check on top.
	const baseResult = classifyProof(report, exitCode);
	if (baseResult.verdict !== 'OK') {
		return baseResult;
	}

	// Step 2: per-test verification. Build a map from the test's
	// short name (the suffix of fullName after the suite prefix) to
	// its assertion result, so a declared `testName` matches the test
	// regardless of where the proof file is mounted.
	const seenTestShortNames = new Set<string>();
	const passedDeclaredRed: {
		testName: string;
		why: string;
		fullName: string;
	}[] = [];
	const failedDeclaredRed: string[] = [];

	for (const decl of manifest.expectedRed) {
		const match = findAssertionByTestName(report, decl.testName);
		if (match === undefined) {
			// The declared test is missing from the report. This is
			// itself a CORRUPT PROOF — the proof file no longer carries
			// the test the manifest expects to find. We never silently
			// collapse this to OK.
			return {
				verdict: 'CORRUPT PROOF',
				reason:
					`expected-red test not found in vitest report: ${JSON.stringify(decl.testName)}. ` +
					`The proof file no longer carries the declared kept-red test — ` +
					`either the test was renamed/removed or the manifest drifted. ` +
					`Why this test was declared kept-red: ${decl.why}`,
				exitCode,
				failedTests: report.numFailedTests,
				totalTests: report.numTotalTests,
			};
		}
		seenTestShortNames.add(match.shortName);
		if (match.status === 'passed') {
			passedDeclaredRed.push({
				testName: decl.testName,
				why: decl.why,
				fullName: match.fullName,
			});
		} else if (match.status === 'failed') {
			failedDeclaredRed.push(match.fullName);
		} else {
			// 'skipped' or 'pending' — neither red nor green. Treat
			// as a kept-red gap: a declared red that was skipped is a
			// proof that no longer measures, so CORRUPT PROOF.
			return {
				verdict: 'CORRUPT PROOF',
				reason:
					`expected-red test was skipped/pending: ${match.fullName}. ` +
					`A declared kept-red test must fail with an assertion, not be ` +
					`skipped. Why this test was declared kept-red: ${decl.why}`,
				exitCode,
				failedTests: report.numFailedTests,
				totalTests: report.numTotalTests,
			};
		}
	}

	// Step 3: a declared kept-red test that PASSED is a STALE PROOF.
	// This is the silent-green path the global classifier missed: the file
	// still has another test that fails on an AssertionError (so
	// classifyProof said OK), but the declared kept-red is gone.
	// We use a DISTINCT verdict from CORRUPT PROOF so the summary can
	// name the different failure cause — a stale proof is a different
	// defect class from a corrupt/unparseable proof file (issue #1806).
	if (passedDeclaredRed.length > 0) {
		const first = passedDeclaredRed[0]!;
		return {
			verdict: 'DECLARED RED PASSED',
			reason:
				`declared kept-red test PASSED: ${first.fullName}. ` +
				`Why this test was declared kept-red: ${first.why}. ` +
				`The proof can no longer measure the bug: either the detection ` +
				`mechanism was weakened (paired mutation) or the production ` +
				`code was changed so the bug it documented no longer exists in ` +
				`the form the proof expects.`,
			exitCode,
			failedTests: report.numFailedTests,
			totalTests: report.numTotalTests,
		};
	}

	// All declared kept-red tests failed → the proof measured and the
	// ideal is not met, on every declared axis. Verdict OK.
	return {
		verdict: 'OK',
		reason:
			`proof test failed as expected (assertion failure on ${failedDeclaredRed.length} ` +
			`declared kept-red test(s): ${failedDeclaredRed.map((n) => JSON.stringify(n)).join(', ')}).`,
		exitCode,
		failedTests: report.numFailedTests,
		totalTests: report.numTotalTests,
	};
}

/**
 * Find an assertion result by its declared testName. The declared name
 * is the exact `test('…', …)` literal; vitest's `fullName` is the
 * concatenation of describe + test names with a SPACE separator
 * (vitest's reporter does not emit Jest's ` > ` between them — it
 * joins them directly). We match by suffix equality (the test name
 * is at the END of fullName, after the describe prefix + a space) so
 * the runner works regardless of where the proof is mounted.
 */
function findAssertionByTestName(
	report: ProofReport,
	declaredName: string,
): { fullName: string; shortName: string; status: string } | undefined {
	const SEPARATOR = ' ';
	const suffix = SEPARATOR + declaredName;
	for (const suite of report.testResults) {
		for (const t of suite.assertionResults) {
			if (t.fullName === declaredName || t.fullName.endsWith(suffix)) {
				return {
					fullName: t.fullName,
					shortName: declaredName,
					status: t.status,
				};
			}
		}
	}
	return undefined;
}
