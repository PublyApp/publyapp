import { createHash } from 'node:crypto';

// Test-class sharder for .github/workflows/api-tests.yml.
//
// Issue #1947 splits the single-runner 14m41 `just test-api` step into a
// 4-way job matrix. Each shard runs the same test project on its own
// runner with its own Testcontainers Postgres, so the four shards are
// independent runners rather than four workers on one box.
//
// THE PARTITIONING RULE
// ---------------------
// xUnit tests are grouped by their fully-qualified class name (a class
// FQN, e.g. `PublyApp.Api.Modules.Users.Services.SomeSpec`). Every method
// in a class goes to the same shard — never split a class across shards,
// because that breaks parallelization in xUnit's per-class fixtures and
// produces unintuitive failures ("method A passed on shard 2, method B
// passed on shard 3" — was the class actually exercised?). The shard is
// determined by sha1(classFQN) modulo the shard count, interpreted as a
// uint64 big-endian from the first 8 bytes of the digest. The modulo is
// computed against the shard COUNT (not a fixed number) so the script is
// reusable for any N-way split.
//
// WHY HASH ON THE FUNNY-NAME, NOT ON A DISCOVERY INDEX
// -----------------------------------------------------
// A discovery-index split re-shuffles every test the moment one is added,
// which makes a red shard unreproducible: re-running the SAME shard N at
// the SAME commit picks up the SAME classes, but the next commit's shard
// N covers different classes entirely, so the red is not the same red.
// Hashing the FQN makes a red shard reproducible: the same class always
// lands in the same shard, so a re-run on the same commit reproduces the
// same failure on the same shard, and an unrelated commit that moves a
// class into a different shard leaves the original red shard alone.

export const SHARD_COUNT = 4;

/**
 * Map a fully-qualified test class name to a shard index in `[0, shardCount)`.
 * Deterministic: same input always yields the same output. Uses SHA-1
 * (a cryptographic hash is overkill but is built into Node and produces a
 * well-distributed first-8-bytes window — FNV would work too, but SHA-1 is
 * the path of least surprise for a reviewer who wants to verify the
 * partition by recomputing it in another language).
 *
 * @param {string} classFqn - fully-qualified test class name (no parens,
 *   no method suffix, e.g. `PublyApp.Api.Modules.Users.SomeSpec`)
 * @param {number} [shardCount=SHARD_COUNT] - how many shards to distribute
 *   into; defaults to 4 to match .github/workflows/api-tests.yml's matrix
 * @returns {number} shard index in `[0, shardCount)`
 */
export const shardFor = (
	classFqn: string,
	shardCount: number = SHARD_COUNT,
) => {
	if (typeof classFqn !== 'string' || classFqn.length === 0) {
		throw new Error(
			`shardFor: classFqn must be a non-empty string (got: ${JSON.stringify(classFqn)})`,
		);
	}

	if (!Number.isInteger(shardCount) || shardCount < 1) {
		throw new Error(
			`shardFor: shardCount must be a positive integer (got: ${shardCount})`,
		);
	}

	const digest = createHash('sha1').update(classFqn).digest();
	// Read the first 8 bytes of the digest as a big-endian uint64, then
	// take modulo shardCount. BigInt lets us use the full 64-bit window;
	// Number would lose precision above 2^53 and bias the partition
	// toward the lower shards.
	const view = new DataView(digest.buffer, digest.byteOffset, 8);
	const high = BigInt(view.getUint32(0, false));
	const low = BigInt(view.getUint32(4, false));
	const value = (high << 32n) | low;

	return Number(value % BigInt(shardCount));
};

/**
 * Strip a `--list-tests` line down to its class fully-qualified name.
 *
 * `dotnet test --list-tests` emits one line per discovered test, indented
 * with four spaces. Each line looks like
 *   `    PublyApp.Api.Foo.BarSpec.ItShouldDoX`
 * or, for `[Theory]` tests, with a trailing parameter suffix
 *   `    PublyApp.Api.Foo.BarSpec.ItShouldDoX(value: "foo")`
 * This returns `PublyApp.Api.Foo.BarSpec` in both cases.
 *
 * @param {string} line - one raw line from `dotnet test --list-tests`
 * @returns {string | null} the class FQN, or `null` if the line is not a
 *   test entry (header lines, blank lines, the trailing
 *   "X test(s) discovered" summary line)
 */
export const classFqnFromListLine = (line: string): string | null => {
	const trimmed = line.trim();

	if (trimmed.length === 0) {
		return null;
	}

	// Summary / header lines: "The following Tests are available:",
	// "X test(s) discovered", "Test run for ... (.NETCoreApp,...)".
	if (
		trimmed.startsWith('The following Tests') ||
		trimmed.startsWith('Test run for ') ||
		/\btest\(s\) discovered\b/.test(trimmed)
	) {
		return null;
	}

	// Drop the trailing `(args: ...)` parameter suffix if present. The
	// suffix is always parenthesized and always comes after the method
	// name (a PascalCase identifier), so matching from the last `.`+word
	// boundary forward is sufficient.
	const withoutParams = trimmed.replace(/\([^)]*\)\s*$/, '');

	// Drop the last segment (the method name). Methods start with a
	// capital letter by xUnit convention; the preceding dot is the
	// namespace/class separator we want to keep.
	const lastDot = withoutParams.lastIndexOf('.');

	if (lastDot < 1) {
		return null;
	}

	return withoutParams.slice(0, lastDot);
};

/**
 * Partition a raw `dotnet test --list-tests` blob into per-shard test
 * entries. Preserves the original line text on every emitted entry, so
 * the consumer can reuse xUnit's `DisplayName` filter syntax directly:
 * a shard's `entries` joined by `|` produces a `--filter` predicate
 * `DisplayName~"name1"|DisplayName~"name2"|...` that exactly matches what
 * the runner would have discovered.
 *
 * @param {string} listOutput - the entire stdout of
 *   `dotnet test --list-tests`
 * @param {number} [shardCount=SHARD_COUNT]
 */
export type ShardShards = {
	shard: number;
	entries: string[];
	classCount: number;
	testCount: number;
};

export type ShardPartition = {
	shards: ShardShards[];
	totalClassCount: number;
	totalTestCount: number;
};

export const partitionFromListOutput = (
	listOutput: string,
	shardCount: number = SHARD_COUNT,
): ShardPartition => {
	const buckets = Array.from({ length: shardCount }, () => ({
		entries: [] as string[],
		classNames: new Set<string>(),
	}));

	let totalTestCount = 0;

	for (const line of listOutput.split('\n')) {
		const classFqn = classFqnFromListLine(line);

		if (classFqn === null) {
			continue;
		}

		totalTestCount += 1;
		const shard = shardFor(classFqn, shardCount);
		buckets[shard].entries.push(line.trim());
		buckets[shard].classNames.add(classFqn);
	}

	const shards = buckets.map((bucket, index) => ({
		shard: index + 1,
		entries: bucket.entries,
		classCount: bucket.classNames.size,
		testCount: bucket.entries.length,
	}));

	// Every class FQN appears in exactly one shard; sum the unique class
	// counts to assert partition completeness at the consumer.
	const totalClassCount = shards.reduce((sum, s) => sum + s.classCount, 0);

	return {
		shards,
		totalClassCount,
		totalTestCount,
	};
};
