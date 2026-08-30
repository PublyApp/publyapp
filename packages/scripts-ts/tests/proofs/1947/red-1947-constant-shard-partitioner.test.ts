/**
 * KEPT RED TEST — issue #1947 (CI: shard the API test suite).
 *
 * This test proves that a constant-shard partitioner ("every test on
 * shard 0, shards 1-3 always empty") looks complete from the union
 * perspective (no test is dropped) while actually dropping three
 * runners' worth of work. The real partitioner
 * (`shardFor(classFqn)` in src/shard-api-tests.ts) hashes the
 * fully-qualified class name with SHA-1 and distributes classes
 * across all four shards; the constant-shard reference below skips
 * the modulo, so every class lands on shard 0. Against this broken
 * reference, the assertion in the green suite
 * (`ShouldDetectAConstantShardPartitionAsAMissingDistribution` in
 * src/shard-api-tests.test.ts) is satisfied with `toBe(1)` — the
 * broken partition produces exactly one non-empty shard, exactly
 * what the green test demands. But the assertion here, which
 * requires the distribution to match what a healthy 4-way split
 * produces, is NOT satisfied: the constant-shard reference yields
 * just one non-empty shard, so the test FAILS.
 *
 * Replay:
 *   cd packages/scripts-ts && \
 *     pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1947/red-1947-constant-shard-partitioner.test.ts
 *
 * Expected: FAIL — `expected 1 to be greater than 1`. See
 * .dump/preuve-1947-shard-api-tests.md for the mutation that
 * reproduces this against the production partitioner, and the
 * adverse-mutation search that confirms the assertion grips the
 * defect rather than a coincidence of the chosen mutation.
 *
 * The test lives under tests/proofs/ (not src/) and is excluded
 * from the green suite by vitest.config.ts; vitest.preuves.config.ts
 * adds it back so a reviewer can replay it on demand. See
 * docs/guides/test-conventions.md §"Paired Red/Green Proofs —
 * keeping the red test alive" for the convention.
 *
 * Note: the proof duplicates the line-class FQN parser inline
 * rather than importing it from src/. Vitest's resolver is rooted
 * at the include glob `src/**.test.ts`; an import from src/ to
 * tests/ is rejected because the tests/ directory is not part of
 * the resolver root for the green config. Duplicating the small
 * parser keeps the proof executable standalone, with the SAMPLE
 * and the parser invariant given in one file — the duplication
 * is the cost of a self-contained replay and is named in the
 * trace under .dump/preuve-1947-shard-api-tests.md.
 */

import { describe, expect, it } from 'vitest';

const SHARD_COUNT = 4;

// Same logic as `classFqnFromListLine` in src/shard-api-tests.ts,
// duplicated here for the reasons explained in the file header.
// A drift between this copy and the production parser would let
// the red proof silently stop corresponding to the real defect;
// the SAMPLE_LIST_OUTPUT comment in src/shard-api-tests.test.ts
// and the one below must stay identical.
const classFqnFromListLine = (line) => {
	const trimmed = line.trim();

	if (trimmed.length === 0) {
		return null;
	}

	if (
		trimmed.startsWith('The following Tests') ||
		trimmed.startsWith('Test run for ') ||
		/\btest\(s\) discovered\b/.test(trimmed)
	) {
		return null;
	}

	const withoutParams = trimmed.replace(/\([^)]*\)\s*$/, '');
	const lastDot = withoutParams.lastIndexOf('.');

	if (lastDot < 1) {
		return null;
	}

	return withoutParams.slice(0, lastDot);
};

// Same SAMPLE as in src/shard-api-tests.test.ts.
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
    PublyApp.Api.Modules.Users.Validation.UserValidationRulesSpec.ItShouldPassAccountLevelWhenJsonNull
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

// The broken reference: every parsed entry goes to shard 0, every
// other shard is empty. This is the partition shape a partitioner
// that drops the modulo step would produce; it is the same shape
// the green suite's `constantShardPartition` helper uses, so a
// reviewer can compare the two side-by-side without leaving the
// proof.
const constantShardPartition = (listOutput) => {
	const lines = listOutput
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => classFqnFromListLine(l) !== null);

	const shards = Array.from({ length: SHARD_COUNT }, (_, i) => ({
		shard: i + 1,
		entries: i === 0 ? lines : [],
	}));

	return { shards };
};

describe('red-1947-constant-shard-partitioner', () => {
	it('ShouldFailWhenAConstantShardPartitionerIsUsedInPlaceOfShardFor', () => {
		// Healthy assertion: a real 4-way partition must produce
		// more than one non-empty shard whenever the input contains
		// more than one class. The SAMPLE has four classes, so a
		// healthy partition must put them on at least two shards.
		const broken = constantShardPartition(SAMPLE_LIST_OUTPUT);
		const nonEmpty = broken.shards.filter((s) => s.entries.length > 0);

		// This is the IDEAL the green partitioner is expected to
		// meet. The constant-shard reference violates it because
		// it concentrates every test on shard 0, leaving shards
		// 1-3 empty. The red is the gap between this assertion and
		// the broken reference's actual output.
		expect(nonEmpty.length).toBeGreaterThan(1);
	});
});
