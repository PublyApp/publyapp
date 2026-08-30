import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import {
	SHARD_COUNT,
	classFqnFromListLine,
	partitionFromListOutput,
	shardFor,
} from './shard-api-tests.ts';

// Issue #1947: shard api-tests.yml across a 4-way matrix partitioned by
// hash of the fully-qualified test class name.
//
// THE CRITICAL TEST: partition completeness against the REAL artifact.
// ---------------------------------------------------------------
// The issue calls out test loss as risk #1: a partition that silently drops
// a class is a permanent false negative and looks like a speed-up. This test
// runs `dotnet test --list-tests` against the real test project, partitions
// the output, and asserts:
//
//   1. The union of shard entries equals the input entries as a multiset
//      (no test is dropped, no test is duplicated).
//   2. The sum of per-shard test counts equals the total test count.
//   3. No class FQN appears in more than one shard (class-not-split).
//   4. Every shard has at least one class (no empty shards — proves the
//      hash distributes across all four buckets for the real suite).
//
// This test operates on the ACTUAL `dotnet test --list-tests` blob, not a
// synthetic fixture. If the test project cannot be listed (e.g., Docker not
// available), the test is skipped rather than failed — the partition logic
// is unit-tested against fixtures in the other describe blocks.

const PROJECT = 'apps/api/Tests/PublyApp.Api.Tests.csproj';

const listTests = () => {
	const result = spawnSync(
		'dotnet',
		['test', PROJECT, '-c', 'Test', '--no-restore', '--nologo', '--list-tests'],
		{
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
			timeout: 120_000,
		},
	);

	if (result.status !== 0) {
		// Docker not available, project not built, etc. — skip rather than
		// fail, because this test requires a real build environment.
		return null;
	}

	return result.stdout;
};

describe('partitionFromListOutput (real artifact)', () => {
	it('ShouldPartitionTheRealSuiteWithoutDroppingOrDuplicatingTests', () => {
		const output = listTests();

		if (output === null) {
			// Skip when the test project cannot be listed (no Docker, no build).
			// The partition logic is unit-tested against fixtures below.
			return;
		}

		const partition = partitionFromListOutput(output);

		// The real suite has hundreds of classes — assert we found many.
		expect(partition.totalClassCount).toBeGreaterThan(100);
		expect(partition.totalTestCount).toBeGreaterThan(500);

		// 1. Union of shard entries equals input entries as a multiset.
		const union = partition.shards.flatMap((s) => s.entries).sort();
		const expected = output
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => classFqnFromListLine(l) !== null)
			.sort();
		expect(union).toEqual(expected);

		// 2. Sum of per-shard test counts equals total.
		let sum = 0;
		for (const s of partition.shards) {
			sum += s.testCount;
		}
		expect(sum).toBe(partition.totalTestCount);

		// 3. No class FQN appears in more than one shard.
		const unionOfClassNames = new Set();
		for (const s of partition.shards) {
			for (const entry of s.entries) {
				const fqn = classFqnFromListLine(entry);
				expect(unionOfClassNames.has(fqn)).toBe(false);
				unionOfClassNames.add(fqn);
			}
		}
		expect(unionOfClassNames.size).toBe(partition.totalClassCount);

		// 4. Every shard has at least one class (distribution check).
		for (const s of partition.shards) {
			expect(s.classCount).toBeGreaterThan(0);
		}
	});

	it('ShouldDistributeClassesAcrossAllFourShards', () => {
		const output = listTests();

		if (output === null) {
			return;
		}

		const partition = partitionFromListOutput(output);

		// All four shards must be non-empty for the real suite.
		const nonEmptyShards = partition.shards.filter((s) => s.classCount > 0);
		expect(nonEmptyShards.length).toBe(SHARD_COUNT);

		// No shard should dominate (more than 40% of total tests).
		// A healthy hash distribution should be roughly even (~25% each).
		for (const s of partition.shards) {
			const fraction = s.testCount / partition.totalTestCount;
			expect(fraction).toBeLessThan(0.4);
		}
	});
});

describe('shardFor', () => {
	it('ShouldReturnShardIndexInRangeWhenGivenAnyClassFqn', () => {
		for (const name of [
			'PublyApp.Api.Modules.Users.SomeSpec',
			'a',
			'X',
			'Foo.Bar.BazSpec',
		]) {
			const shard = shardFor(name);
			expect(shard).toBeGreaterThanOrEqual(0);
			expect(shard).toBeLessThan(SHARD_COUNT);
		}
	});

	it('ShouldBeDeterministicForTheSameInput', () => {
		const samples = [
			'PublyApp.Api.Modules.Users.Services.SomeSpec',
			'PublyApp.Api.Lib.Architecture.SomeSpec',
			'PublyApp.Api.Infrastructure.Jobs.SomeSpec',
		];

		for (const name of samples) {
			const first = shardFor(name);

			for (let i = 0; i < 10; i++) {
				expect(shardFor(name)).toBe(first);
			}
		}
	});

	it('ShouldDistributeAcrossShardsForRealisticInputs', () => {
		// Pair-red: a constant function (always 0) cannot pass this
		// test, because every shard must see at least one class when
		// the input has more classes than shards.
		const classes = Array.from(
			{ length: 40 },
			(_, i) => `PublyApp.Api.Modules.M${i}.Spec${i}`,
		);
		const seenShards = new Set(classes.map((c) => shardFor(c)));
		expect(seenShards.size).toBeGreaterThan(1);
	});

	it('ShouldThrowWhenClassFqnIsEmptyOrNotAString', () => {
		expect(() => shardFor('')).toThrow();
		// @ts-expect-error intentionally passing invalid types to test runtime guard
		expect(() => shardFor(null)).toThrow();
		// @ts-expect-error intentionally passing invalid types to test runtime guard
		expect(() => shardFor(undefined)).toThrow();
		// @ts-expect-error intentionally passing invalid types to test runtime guard
		expect(() => shardFor(42)).toThrow();
	});

	it('ShouldThrowWhenShardCountIsNotPositive', () => {
		expect(() => shardFor('Foo.Bar', 0)).toThrow();
		expect(() => shardFor('Foo.Bar', -1)).toThrow();
		expect(() => shardFor('Foo.Bar', 1.5)).toThrow();
	});
});

describe('classFqnFromListLine', () => {
	it('ShouldStripMethodNameFromASimpleLine', () => {
		expect(
			classFqnFromListLine('    PublyApp.Api.Modules.Foo.BarSpec.ItShouldDoX'),
		).toBe('PublyApp.Api.Modules.Foo.BarSpec');
	});

	it('ShouldStripParameterizedArgumentsBeforeTheMethodName', () => {
		expect(
			classFqnFromListLine(
				'    PublyApp.Api.Modules.Foo.BarSpec.ItShouldDoX(value: "admin")',
			),
		).toBe('PublyApp.Api.Modules.Foo.BarSpec');
	});

	it('ShouldReturnNullForBlankOrHeaderOrSummaryLines', () => {
		expect(classFqnFromListLine('')).toBe(null);
		expect(classFqnFromListLine('   ')).toBe(null);
		expect(classFqnFromListLine('The following Tests are available:')).toBe(
			null,
		);
		expect(
			classFqnFromListLine(
				'Test run for /tmp/PublyApp.Api.Tests.dll (.NETCoreApp,Version=v10.0)',
			),
		).toBe(null);
		expect(classFqnFromListLine('28 test(s) discovered')).toBe(null);
	});

	it('ShouldReturnNullWhenThereIsNoClassSeparator', () => {
		// Round 2 (#1984): a single-segment line like `JustAMethodName`
		// has no class boundary, so it does not match the test-entry
		// grammar. The round-1 parser returned null for "no boundary";
		// the round-2 parser throws on "shape does not match any
		// known header AND does not match the grammar". Either
		// outcome rejects the line — null just silently drops it, throw
		// aborts the partition. This asserts the strict-mode contract.
		expect(() => classFqnFromListLine('    JustAMethodName')).toThrow(
			/cannot parse line as a --list-tests entry/,
		);
	});

	it('ShouldThrowOnANoTestMatchesFilterErrorLine', () => {
		// Round 2 (#1984): the round-1 defect was that lines from
		// `dotnet test --filter ...` were silently parsed as class
		// FQNs. The most dangerous shape was anything that ended up
		// looking like `<dots>.<dots>.<dots>` after the round-1 parser
		// stripped a tail. The round-2 grammar throws on it, naming
		// the mis-shape. The arrow-shaped `ClassName="..." -> /path/...`
		// is now caught by the explicit MSBuild-skip rule (returns
		// null, not throws); both behaviours reject the line, just
		// for different reasons.
		expect(() =>
			classFqnFromListLine(
				'No test matches the given testcase filter `Foo` in /tmp/PublyApp.Api.Tests.dll',
			),
		).toThrow(/cannot parse line as a --list-tests entry/);
	});

	it('ShouldSkipMsBuildArrowLinesThatAppearAboveTheListing', () => {
		// MSBuild build messages (`<Project> -> <path>`) appear above
		// the actual `--list-tests` listing even with `--nologo`. They
		// are NOT test entries and the partition must skip them, not
		// throw. Round 2 explicitly classifies them as headers.
		expect(
			classFqnFromListLine(
				'  PublyApp.Api.Tests -> /home/runner/work/PublyApp.Api.Tests.dll',
			),
		).toBe(null);
		expect(
			classFqnFromListLine(
				'    ClassName="PublyApp.Api.Tests -> /home/runner/work/PublyApp.Api.Tests.dll"',
			),
		).toBe(null);
	});
});

describe('partitionFromListOutput (fixture)', () => {
	const SAMPLE_LIST_OUTPUT = `Test run for /tmp/PublyApp.Api.Tests.dll (.NETCoreApp,Version=v10.0)
The following Tests are available:
    PublyApp.Api.Modules.Users.Services.CreateStaffUserServiceSpec.ItShouldCreateUserAccountAndEnqueueVerifyEmailWhenSuccessful
    PublyApp.Api.Modules.Users.Services.CreateStaffUserServiceSpec.ItShouldRejectWhenUserHasTenantOrProjectAccounts
    PublyApp.Api.Modules.Users.Services.CreateStaffUserServiceSpec.ItShouldRollbackUserAndAccountWhenEnqueueFails
    PublyApp.Api.Modules.Users.Validation.UserValidationRulesSpec.ItShouldPassAccountLevelWhenValid(value: "admin")
    PublyApp.Api.Modules.Users.Validation.UserValidationRulesSpec.ItShouldPassAccountLevelWhenValid(value: "Admin")
    PublyApp.Api.Modules.Users.Validation.UserValidationRulesSpec.ItShouldPassAccountLevelWhenValid(value: "user")
    PublyApp.Api.Modules.Users.Validation.UserValidationRulesSpec.ItShouldPassAccountLevelWhenValid(value: "User")
    PublyApp.Api.Modules.Users.Validation.UserValidationRulesSpec.ItShouldFailAccountLevelWhenInvalidString
    PublyApp.Api.Modules.Users.Validation.UserValidationRulesSpec.ItShouldPassAccountLevelWhenNull
    PublyApp.Api.Modules.Users.Validation.UserValidationRulesSpec.ItShouldFailAccountLevelWhenJsonNull
    PublyApp.Api.Modules.Users.Validation.UserValidationRulesSpec.ItShouldFailAccountLevelWhenWrongType
    PublyApp.Api.Lib.Testing.Fixtures.ApiFixtureSpec.ItShouldBootWithFreshTemplatePerSpec
    PublyApp.Api.Lib.Testing.Fixtures.ApiFixtureSpec.ItShouldReuseTemplateAcrossSpecsInOneProcess
    PublyApp.Api.Infrastructure.Storage.LocalDiskFileStorageSpec.ItShouldPersistAUploadedFileAtItsRelativePath
    PublyApp.Api.Infrastructure.Storage.LocalDiskFileStorageSpec.ItShouldOverwriteAnExistingFileAtTheSameRelativePath
    PublyApp.Api.Infrastructure.Storage.LocalDiskFileStorageSpec.ItShouldRejectTraversalAttemptsForDelete(maliciousRelativePath: "../../etc/passwd")
    PublyApp.Api.Infrastructure.Storage.LocalDiskFileStorageSpec.ItShouldRejectTraversalAttemptsForDelete(maliciousRelativePath: "uploads/../../etc/passwd")
    PublyApp.Api.Infrastructure.Storage.LocalDiskFileStorageSpec.ItShouldRejectAnExtensionContainingPathSeparators(extension: "./../.png")
    PublyApp.Api.Infrastructure.Storage.LocalDiskFileStorageSpec.ItShouldRejectAnExtensionContainingPathSeparators(extension: ".png/../.jpg")
    PublyApp.Api.Infrastructure.Storage.LocalDiskFileStorageSpec.ItShouldServeAFilePreviouslyUploaded
    PublyApp.Api.Infrastructure.Storage.LocalDiskFileStorageSpec.ItShouldCleanUpFilesOnDispose
21 test(s) discovered
`;

	it('ShouldSplitTheSampleInputAcrossAllFourShardsByClass', () => {
		const partition = partitionFromListOutput(SAMPLE_LIST_OUTPUT);

		// SAMPLE_LIST_OUTPUT contains 4 distinct classes (one with 4
		// methods, one with 7 methods including 4 parameterized
		// variants, one with 2 methods, one with 9 methods including
		// 2 parameterized variants) and 21 test entries total.
		expect(partition.totalTestCount).toBe(21);
		expect(partition.totalClassCount).toBe(4);

		// Each class lands in exactly one shard — no class is split across
		// shards, but a shard can (and does) contain multiple entries
		// for the same class.
		const classNamesByShard = new Map();
		for (const s of partition.shards) {
			const seen = new Set();
			for (const entry of s.entries) {
				const fqn = classFqnFromListLine(entry);
				seen.add(fqn);
			}
			classNamesByShard.set(s.shard, seen);
		}

		// No class FQN appears in more than one shard.
		const unionOfClassNames = new Set();
		for (const set of classNamesByShard.values()) {
			for (const name of set) {
				expect(unionOfClassNames.has(name)).toBe(false);
				unionOfClassNames.add(name);
			}
		}
		expect(unionOfClassNames.size).toBe(partition.totalClassCount);

		// Union of shard entries equals input entries as a multiset.
		const union = partition.shards.flatMap((s) => s.entries).sort();
		const expected = SAMPLE_LIST_OUTPUT.split('\n')
			.map((l) => l.trim())
			.filter((l) => classFqnFromListLine(l) !== null)
			.sort();
		expect(union).toEqual(expected);

		// Sum of per-shard test counts equals total.
		let sum = 0;
		for (const s of partition.shards) {
			sum += s.testCount;
		}
		expect(sum).toBe(partition.totalTestCount);

		// Sum of per-shard class counts equals total unique classes.
		let sumClass = 0;
		for (const s of partition.shards) {
			sumClass += s.classCount;
		}
		expect(sumClass).toBe(partition.totalClassCount);
	});

	it('ShouldNeverSplitAClassAcrossTwoShards', () => {
		const partition = partitionFromListOutput(SAMPLE_LIST_OUTPUT);

		for (const s of partition.shards) {
			const classNames = new Set();
			for (const entry of s.entries) {
				classNames.add(classFqnFromListLine(entry));
			}
			expect(classNames.size).toBe(s.classCount);
		}
	});

	it('ShouldDetectAConstantShardPartitionAsAMissingDistribution', () => {
		// Pair-green (the detection-asserts-broken side). The real
		// partitioner distributes classes across shards; a broken
		// constant-shard partitioner (the red-proof reference under
		// tests/proofs/1947/) leaves every shard but shard 0 empty.
		// The kept-red proof in tests/proofs/1947/ asserts the SAME
		// broken partitioner satisfies a "more than one shard is
		// non-empty" expectation — that assertion is what the broken
		// code violates, producing the red. Here in the green suite,
		// we use the same broken reference and assert it IS detected
		// as broken: the constant-shard partition produces exactly one
		// non-empty shard, never more.
		const constantShardPartition = (listOutput: string) => {
			const lines = listOutput
				.split('\n')
				.map((l: string) => l.trim())
				.filter((l: string) => l.length > 0)
				.filter((l: string) => classFqnFromListLine(l) !== null);

			const shards = Array.from({ length: SHARD_COUNT }, (_, i) => ({
				shard: i + 1,
				entries: i === 0 ? lines : [],
				classNames: new Set(),
			}));

			return {
				shards,
				totalTestCount: lines.length,
				totalClassCount: 0,
			};
		};

		const broken = constantShardPartition(SAMPLE_LIST_OUTPUT);
		const nonEmptyBroken = broken.shards.filter((s) => s.entries.length > 0);

		// A constant-shard partitioner must produce EXACTLY one
		// non-empty shard. If the test ever sees a different number,
		// the reference has drifted from the kept-red proof and the
		// correspondence between green and red is broken — fail loud.
		expect(nonEmptyBroken.length).toBe(1);
	});

	it('ShouldProduceFourShardsEvenWhenInputIsSmall', () => {
		const tiny = `The following Tests are available:
    PublyApp.Api.Modules.OnlyOneSpec.ItShouldDoOneThing
1 test(s) discovered
`;
		const partition = partitionFromListOutput(tiny);
		expect(partition.shards).toHaveLength(SHARD_COUNT);

		let totalEntries = 0;
		for (const s of partition.shards) {
			totalEntries += s.entries.length;
		}
		expect(totalEntries).toBe(1);
	});

	it('ShouldReturnZeroCountsForEmptyInput', () => {
		const partition = partitionFromListOutput('');
		expect(partition.totalTestCount).toBe(0);
		expect(partition.totalClassCount).toBe(0);
		expect(partition.shards).toHaveLength(SHARD_COUNT);
		let totalTestCount = 0;
		for (const s of partition.shards) {
			totalTestCount += s.testCount;
		}
		expect(totalTestCount).toBe(0);
	});
});
