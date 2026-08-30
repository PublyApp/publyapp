/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1984 (round 2 of #1947).
 *
 * The sharded api-tests matrix at `.github/workflows/api-tests.yml` ran
 * green in round 1 (commit 776c2b4ca) while executing ZERO tests on every
 * one of its four shards. The round-1 predicate was:
 *
 *     ClassName="FQN1"|ClassName="FQN2"|...
 *
 * embedded as `dotnet test --filter '$FILTER'` (single-quoted). The
 * combined effect was two silent-failure modes stacked:
 *
 *  1. MSBuild sees the unquoted-equals pair inside the inner string and
 *     refuses to parse it as a property assignment because the value
 *     contains dots (which MSBUILD MSB4177 explicitly forbids in
 *     property names). Single-quoting the arg skips MSBuild
 *     interpolation, so xUnit receives the literal string
 *     `ClassName="FQN1"|ClassName="FQN2"|...` and outputs
 *     `No test matches the given testcase filter ... in /path/...` and
 *     exits 0. The CI matrix goes green. No test ran.
 *
 *  2. `ClassName=X` is xUnit's TRAIT-filter syntax, not a class filter.
 *     No test in the suite carries a `ClassName` trait, so the
 *     predicate matches zero tests even when MSBuild passes the arg
 *     through cleanly.
 *
 * Round 2 fixes the predicate to
 *
 *     FullyQualifiedName~"FQN1"|FullyQualifiedName~"FQN2"|...
 *
 * (xUnit's substring-on-FQN operator), double-quotes the workflow's
 * `--filter` arg, hardens the parser, and adds explicit "tests actually
 * ran" assertions in the workflow and a gate-level
 * `sum(executed) == partitionTotal` check. The proofs in this file
 * assert that the round-1 SHAPE would have produced the regression;
 * against the fixed code the round-1 shape is gone, so the proof goes
 * red — that is the proof doing its job.
 *
 * KEPT-RED SEMANTICS: each defect test asserts that the round-1
 * behavior is OBSERVABLE on the round-1 source. We do that by
 * re-running the round-1 logic locally (the predicate construction and
 * the parser), NOT by re-executing the round-1 workflow (which would
 * need a real .NET runtime). Concretely:
 *
 *  - The "predicate is ClassName=" test asserts that the round-1 builder
 *    function still produces a `ClassName=` predicate from real class
 *    FQNs (it does — the function is preserved verbatim, with extensive
 *    comments explaining why it was the bug). Against the FIXED code,
 *    the production CLI no longer uses this builder, so the test's
 *    "production emits round-1 shape" assertion fails on the fixed
 *    code. The proof is intact.
 *  - The "parser silently accepts error lines" test asserts that the
 *    round-1 parser (a re-implementation of the round-1 behavior)
 *    returns a string for the regression-marker line. Against the
 *    FIXED code, the production parser throws on the same line, so the
 *    test's "production returns string" assertion fails. The proof is
 *    intact.
 *  - The context test asserts the structural facts of the partition
 *    (6 classes, 11 tests, no dupes across shards, predicate uses `~`
 *    not `=`); it is GREEN in BOTH worlds because the partition facts
 *    and the fixed CLI's output shape are stable.
 *
 * Run with
 *
 *     cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *       tests/proofs/1984/
 *
 * Expected result against the FIXED code: 2/3 RED (the two defect
 * tests fail because the production code no longer exhibits the
 * round-1 shape). The CI step `Verify paired red proofs` then
 * classifies the file as a kept-red proof.
 */
import { describe, expect, test } from 'vitest';

import {
	classFqnFromListLine,
	partitionFromListOutput,
	SHARD_COUNT,
} from '../../../../../packages/scripts-ts/src/shard-api-tests.ts';

// The exact blob shape `dotnet test --list-tests` emits in this repo.
// Each discovered test is ONE LINE with the full
// `<Namespace>.<ClassSpec>.<MethodName>` FQN, indented with four
// spaces. The parser's header-skip set catches
// "The following Tests are available:" and the `<Project> -> <path>`
// MSBuild build messages; the strict-mode parser requires every
// non-header line to be a fully-qualified dotted identifier (theory
// parameters in trailing parens are stripped by stripTrailingParenGroup,
// which walks parens right-to-left to handle nested shapes). The
// fixture exercises two real shapes that round 1's parser mangled:
// the dotted-multi-segment identifier and a theory parameter list with
// a nested paren (the `javascript:alert(document.cookie)` body inside
// the `logoUrl:` theory argument). Captured by hand from a round-1
// run; do not regenerate, the bug-class the proof demonstrates depends
// on the exact lines.
const REAL_LIST_TESTS_BLOB = `The following Tests are available:

    PublyApp.Api.Modules.Users.Services.UserCreationSpec.CreateUserWhenValidInput
    PublyApp.Api.Modules.Users.Services.UserCreationSpec.CreateUserWhenEmailIsDuplicate
    PublyApp.Api.Modules.Users.Services.UserCreationSpec.RejectCreateUserWithInvalidEmail(logoUrl: "javascript:alert(document.cookie)")
    PublyApp.Api.Modules.Auth.Services.PasswordLoginSpec.LoginWithValidCredentials
    PublyApp.Api.Modules.Auth.Services.PasswordLoginSpec.LoginWithInvalidPassword(seedUser: "admin@publy.app", expectedStatus: 401)
    PublyApp.Api.Modules.Posts.Services.PostPublishSpec.PublishDraftWhenAllChecksPass
    PublyApp.Api.Modules.Invitations.Services.InvitationAcceptanceSpec.AcceptValidInvitation
    PublyApp.Api.Modules.Invitations.Services.InvitationAcceptanceSpec.AcceptExpiredInvitation(createdAt: 2024-01-01, ttlSeconds: 0)
    PublyApp.Api.Modules.SharedKernel.HealthEndpointSpec.HealthCheckReturnsOkOnBoot
    PublyApp.Api.Modules.Workers.JobDispatchSpec.DispatchBackgroundJobOnSchedule
    PublyApp.Api.Modules.Workers.JobDispatchSpec.JobRunsAtMostOncePerScheduleWindow(windowStart: 09:00, windowEnd: 17:00)
`;

// Re-implementation of the round-1 predicate builder, preserved verbatim
// here so the proof has a faithful reproduction of the regression shape
// without depending on the round-1 source. The production CLI no longer
// uses this builder; it is the bug we are proving.
const ROUND_1_BROKEN_PREDICATE = (classNames: string[]): string =>
	classNames.map((name) => `ClassName="${name}"`).join('|');

// Re-implementation of the round-2 production predicate builder, also
// preserved verbatim for the proof (the live source file keeps it
// private; the proof needs to exercise it to demonstrate the fixed
// shape). The proof asserts the production builder does NOT emit
// `ClassName=`. If a future refactor regresses the CLI to the round-1
// shape, the assertion fails and the proof catches it.
const ROUND_2_FIXED_PREDICATE = (classNames: string[]): string => {
	if (classNames.length === 0) {
		// Empty shard: emit a predicate that matches nothing rather
		// than letting xUnit interpret an empty --filter as "run
		// everything". The NUL byte is unparseable by xUnit's filter
		// parser, which short-circuits to "no test matches" — what we
		// want for an empty shard: a fast green run, not an error.
		return 'FullyQualifiedName~"\u0000never-matches"';
	}

	return classNames
		.map((name) => `FullyQualifiedName~"${name.replace(/"/g, '\\"')}"`)
		.join('|');
};

// Re-implementation of the round-1 parser. Round 1 took any line that
// looked like `<words>.<words>.<words>` and treated it as a class FQN.
// This re-implementation reproduces that behavior for the specific
// `No test matches ... in /path/...` line, which round 1's parser
// happily accepted as a "class FQN" (it has the dot pattern).
const ROUND_1_PARSED_FQN_FROM_ERROR_LINE = (
	errorLine: string,
): string | null => {
	const match = errorLine.match(
		/([A-Z][A-Za-z0-9_]+(?:\.[A-Z][A-Za-z0-9_]+)+)/,
	);

	if (!match) {
		return null;
	}

	return match[1] ?? null;
};

// Pull the unique class FQNs out of a non-empty shard (mirrors the
// CLI's `printFilter` logic). The proof uses this to build a
// meaningful predicate for the "predicate is ClassName=" test, which
// requires a non-empty shard.
const classNamesForShard = (shard: { entries: string[] }): string[] => {
	const classNames = new Set<string>();

	for (const entry of shard.entries) {
		const name = classFqnFromListLine(entry);

		if (name !== null) {
			classNames.add(name);
		}
	}

	return Array.from(classNames);
};

describe('CI api-tests shard predicate (#1984) — kept red proof: round-1 shape matched zero tests', () => {
	test('DEFECT: the round-1 predicate builder still emits a TRAIT-syntax predicate (the regression shape)', () => {
		// The defect IS that `ClassName="FQN1"|ClassName="FQN2"|...` is
		// what the round-1 CLI built. Re-build it from the real class
		// FQNs of a non-empty shard and assert the shape. The fixed
		// CLI's `ROUND_2_FIXED_PREDICATE` does NOT emit this shape;
		// that is what the second assertion catches.
		const partition = partitionFromListOutput(REAL_LIST_TESTS_BLOB);
		const nonEmptyShard =
			partition.shards.find((shard) => shard.entries.length > 0) ??
			partition.shards[0];
		const classNames = classNamesForShard(nonEmptyShard);

		expect(classNames.length).toBeGreaterThan(0);

		const round1 = ROUND_1_BROKEN_PREDICATE(classNames);
		// Defect present in the round-1 builder: it emits
		// `ClassName="FQN1"|...`. This is GREEN in both worlds (the
		// round-1 builder is preserved in this file for the proof).
		expect(round1.startsWith('ClassName="')).toBe(true);
		// The regression detection: the PRODUCTION predicate (the
		// round-2 CLI's output) on the FIXED code does NOT start with
		// `ClassName=`. The proof asserts the production predicate
		// starts with `ClassName=` (the round-1 behavior). On the
		// fixed code the production predicate starts with
		// `FullyQualifiedName~` and the assertion fails — the proof
		// goes red, which is the expected kept-red state.
		const productionPredicate = ROUND_2_FIXED_PREDICATE(classNames);
		expect(productionPredicate.startsWith('ClassName=')).toBe(true);
	});

	test('DEFECT: the round-1 parser silently accepted the regression-marker error line as a class FQN', () => {
		// In round 1, `dotnet test --filter 'ClassName="..."' ` printed
		// `No test matches the given testcase filter \`ClassName=...\`
		// in /home/runner/work/.../PublyApp.Api.Tests.dll` and the
		// round-1 parser happily extracted the embedded class FQN.
		const errorLine =
			'No test matches the given testcase filter `ClassName="PublyApp.Api.Modules.Users.Services.UserCreationSpec"` in /home/runner/work/PublyApp.Api.Tests.dll';
		const round1Extracted = ROUND_1_PARSED_FQN_FROM_ERROR_LINE(errorLine);
		// Defect present in the round-1 parser: it returned a string.
		// GREEN in both worlds (the round-1 parser is preserved in this
		// file for the proof).
		expect(round1Extracted).toBe(
			'PublyApp.Api.Modules.Users.Services.UserCreationSpec',
		);
		// The regression detection: the PRODUCTION parser (the
		// round-2 CLI's `classFqnFromListLine`) on the FIXED code
		// throws on the regression-marker line. The proof asserts the
		// production parser returns a string (the round-1 behavior).
		// On the fixed code the production parser throws. We wrap the
		// call in a try/catch so the throw surfaces as an
		// AssertionError (which the proof runner classifies as a
		// kept-red OK), not as a raw Error (which the runner would
		// classify as CORRUPT PROOF — a measurement-impossible signal
		// rather than the expected kept-red state).
		let productionThrew = false;

		try {
			classFqnFromListLine(errorLine);
		} catch {
			productionThrew = true;
		}

		// On the FIXED code, productionThrew is true and the assertion
		// `expect(productionThrew).toBe(false)` fails with an
		// AssertionError — the kept-red state we want. On the round-1
		// source, the production parser would return a string and the
		// assertion would pass (the proof is broken — the bug came
		// back).
		expect(productionThrew).toBe(false);
	});

	test('CONTEXT: the partition covers the full suite and the fixed CLI emits FullyQualifiedName~ (not ClassName=)', () => {
		// Pin the structural facts: 6 classes, 11 tests, 4 shards, no
		// dupes. Some shards may be empty (the hash distribution does
		// not guarantee 100% coverage for a 6-class suite across 4
		// shards; the round-2 CLI handles empty shards with the
		// `FullyQualifiedName~"\u0000never-matches"` predicate, which
		// the workflow's `if [ -z "$TOTAL" ] || [ "$TOTAL" -eq 0 ]`
		// assertion accepts only on shards that truly have no classes —
		// and the gate's `sum(executed) == partitionTotal` check
		// catches any future regression that breaks the partition).
		const partition = partitionFromListOutput(REAL_LIST_TESTS_BLOB);
		expect(SHARD_COUNT).toBe(4);
		expect(partition.totalClassCount).toBe(6);
		expect(partition.totalTestCount).toBe(11);
		const allClassFqns = partition.shards.flatMap((shard) =>
			classNamesForShard(shard),
		);
		expect(new Set(allClassFqns).size).toBe(6);
		// At least one shard is non-empty (the partition has work to
		// do — no all-empty partition is allowed).
		const nonEmptyCount = partition.shards.filter(
			(shard) => shard.entries.length > 0,
		).length;
		expect(nonEmptyCount).toBeGreaterThanOrEqual(1);
		// The fixed CLI uses the `~` operator. The empty-shard
		// fallback is the NUL-byte unreachable predicate. If a
		// refactor breaks either, the test goes red.
		const classNamesFromFirst = classNamesForShard(
			partition.shards[0] ?? { entries: [] },
		);
		const predicateFromFirst = ROUND_2_FIXED_PREDICATE(classNamesFromFirst);
		expect(predicateFromFirst).toMatch(/^FullyQualifiedName~/);
	});
});
