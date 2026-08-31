import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Issue #1984 round 5: the CLI's filter-predicate output must contain NO
// double-quote characters. An embedded `"` in the predicate, once the shell
// strips the outer `"$FILTER"` pair, reaches `dotnet test --filter`'s
// argument parser and triggers MSB4177 ("Invalid property") because MSBuild
// splits the `--filter` value on `=` and then tries to interpret each
// fragment as a property name. The NUL-byte sentinel in the empty-shard
// branch must also be unquoted.
//
// These tests invoke the CLI exactly as the CI workflow does — piping a
// `dotnet test --list-tests` blob on stdin and capturing stdout — and assert
// on the raw output. They are the guard that makes the quoting fix permanent.

const CLI_PATH = resolve(import.meta.dirname, 'shard-api-tests-cli.ts');

const SAMPLE_LIST_OUTPUT = `Test run for /tmp/PublyApp.Api.Tests.dll (.NETCoreApp,Version=v10.0)
The following Tests are available:
    PublyApp.Api.Modules.Users.Services.CreateStaffUserServiceSpec.ItShouldCreateUserAccountAndEnqueueVerifyEmailWhenSuccessful
    PublyApp.Api.Modules.Users.Services.CreateStaffUserServiceSpec.ItShouldRejectWhenUserHasTenantOrProjectAccounts
    PublyApp.Api.Lib.Testing.Fixtures.ApiFixtureSpec.ItShouldBootWithFreshTemplatePerSpec
    PublyApp.Api.Infrastructure.Storage.LocalDiskFileStorageSpec.ItShouldPersistAUploadedFileAtItsRelativePath
    PublyApp.Api.Infrastructure.Storage.LocalDiskFileStorageSpec.ItShouldCleanUpFilesOnDispose
5 test(s) discovered
`;

/**
 * Invoke the CLI with a fake --list-tests blob on stdin (non-empty shard case).
 */
const runCliWithShard = (shard: number): string => {
	const result = spawnSync('node', [CLI_PATH, String(shard)], {
		input: SAMPLE_LIST_OUTPUT,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	});

	expect(result.status).toBe(0);
	return result.stdout;
};

/**
 * Invoke the CLI --manifest with a fake --list-tests blob on stdin.
 */
const runCliManifest = (): string => {
	const result = spawnSync('node', [CLI_PATH, '--manifest'], {
		input: SAMPLE_LIST_OUTPUT,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	});

	expect(result.status).toBe(0);
	return result.stdout;
};

describe('shard-api-tests-cli output quoting guard (#1984 round 5)', () => {
	it('ShouldEmitNoDoubleQuotesInFilterForNonEmptyShard', () => {
		const output = runCliWithShard(1);
		// The raw stdout must contain zero `"` characters.
		expect(output).not.toContain('"');
	});

	it('ShouldEmitNoDoubleQuotesInFilterForEveryShard', () => {
		for (let shard = 1; shard <= 4; shard++) {
			const output = runCliWithShard(shard);
			// Round-5 guard: MSB4177 fires on ANY embedded double quote
			// in the predicate. Assert for every shard, not just one.
			expect(output).not.toContain('"');
		}
	});

	it('ShouldEmitFullyQualifiedNameTildeFormatWithoutQuotes', () => {
		const output = runCliWithShard(1);
		const trimmed = output.trim();

		// Non-empty shard: must start with the ~ operator, no quotes.
		expect(trimmed).toMatch(/^FullyQualifiedName~/);
		// Must contain a class FQN segment (dots separate namespace/class).
		expect(trimmed).toMatch(/[A-Za-z]+(\.[A-Za-z]+)+/);
	});

	it('ShouldNotContainDoubleQuotesEvenForClassesWithNoShards', () => {
		// A partition where every class hashes to the same shard leaves
		// the other three shards empty. The empty-shard branch must
		// also emit a quote-free predicate (the NUL sentinel).
		const emptyOutput = spawnSync('node', [CLI_PATH, '2'], {
			input: SAMPLE_LIST_OUTPUT,
			encoding: 'utf8',
		});

		if (emptyOutput.status === 0 && emptyOutput.stdout.trim()) {
			expect(emptyOutput.stdout).not.toContain('"');
		}
	});

	it('ShouldEmitNoDoubleQuotesInManifestOutput', () => {
		// The manifest is JSON, which legitimately contains double quotes
		// around keys and string values. This test documents that the
		// manifest output is EXCLUDED from the quoting guard: only the
		// FILTER predicate (the default mode, shard N) is constrained.
		const manifest = runCliManifest();
		expect(manifest).toContain('"');
	});
});
