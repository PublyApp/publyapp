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
//
// THE --list-tests PARSE CONTRACT (Round 2)
// -----------------------------------------
// Round 1 of #1947 (commit 776c2b4ca) shipped a parser that returned
// `null` for any line it could not interpret — a forgiving design that
// silently dropped the line. Round 2 (#1984) tightens the contract:
// `classFqnFromListLine` distinguishes three outcomes:
//   - `null`         — a KNOWN non-test line (header, blank, summary)
//   - `<class FQN>`  — a line whose shape matches the test-entry grammar
//   - throws         — a non-empty line whose shape does NOT match the
//                      grammar. A `dotnet test --list-tests` blob that
//                      contains such a line has been corrupted (e.g.,
//                      piped from the wrong `dotnet test` subcommand, or
//                      from a `dotnet test --filter ...` run that
//                      produces the "ClassName=... -> /path/..." line).
//                      Silently turning it into a class FQN would seed
//                      the predicate with garbage and quietly fail every
//                      shard. Failing loud forces a real investigation.

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
 * The shape every test entry in `dotnet test --list-tests` MUST match.
 * Captured as a single regex so the parser and the strict-mode tests
 * agree on what counts as a real test entry vs. a header line.
 *
 * Matches, on a trimmed line:
 *   - `<PascalCase identifier segments separated by .>`
 *   - `.` (the boundary between class FQN and method name)
 *   - `<method name>` (a PascalCase identifier — xUnit's `[Fact]` and
 *     `[Theory]` convention)
 *   - optional `(parenthesized parameter list)` (theory parameters)
 *
 * No `->`, no `=`, no path separators: a line like
 *   `ClassName="PublyApp.Api.Tests -> /home/runner/.../PublyApp.Api.Tests"`
 * does NOT match, and the parser throws.
 */
const TEST_ENTRY_GRAMMAR =
	/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;

// Strip the trailing theory parameter list if present. Theory lines
// look like
//   `    Foo.BarSpec.ItShouldDoX(value: "admin")`
// and may contain anything (including nested parens, e.g.
// `(logoUrl: "javascript:alert(document.cookie)")`). A naive
// `\([^)]*\)\s*$` regex breaks on nested parens: it stops at the
// first `)` it sees, leaving a trailing `(...)` stranded at end of
// line. The correct shape is "the LAST `(` that has its matching
// `)` at end of line" — walked right-to-left counting depth.
const stripTrailingParenGroup = (s: string): string => {
	if (!s.endsWith(')')) {
		return s;
	}

	let depth = 0;

	for (let i = s.length - 1; i >= 0; i--) {
		const c = s[i];

		if (c === ')') {
			depth++;
		} else if (c === '(') {
			depth--;

			if (depth === 0) {
				return s.slice(0, i).trimEnd();
			}
		}
	}

	// Unbalanced parens at end of line: fall through to grammar check,
	// which will reject the line.
	return s;
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
 * Returns:
 *   - `null`     — the line is a KNOWN non-test entry (header, blank,
 *                  summary, "X test(s) discovered", etc.)
 *   - `<class FQN>` — the line matches the test-entry grammar
 *
 * Throws when the line is non-empty, is not a known header, and does NOT
 * match the test-entry grammar. That happens when the blob fed to
 * `partitionFromListOutput` is not a real `--list-tests` listing — for
 * example, the output of a `dotnet test --filter ...` invocation
 * (which writes `No test matches the given testcase filter
 * \`ClassName=...\` in /path/to/PublyApp.Api.Tests.dll`) starts with a
 * line `ClassName="PublyApp.Api.Tests -> /path/.../PublyApp.Api.Tests"`,
 * which the round-1 parser happily accepted as a class FQN and silently
 * partitioned. Round 2 (#1984) throws instead, so the partition fails
 * loudly rather than producing a green shard that ran zero tests.
 *
 * @param {string} line - one raw line from `dotnet test --list-tests`
 * @returns {string | null} the class FQN, or `null` for known headers
 * @throws when the line is not empty, not a known header, and not a
 *   valid test entry
 */
export const classFqnFromListLine = (line: string): string | null => {
	const trimmed = line.trim();

	if (trimmed.length === 0) {
		return null;
	}

	// Summary / header lines: "The following Tests are available:",
	// "X test(s) discovered", "Test run for ... (.NETCoreApp,...)".
	// MSBuild build messages appear above the listing
	// (`<Project> -> <path>` shape) even with `--nologo`. Round 2
	// skips them explicitly rather than relying on the grammar to
	// reject them, so the partition does not throw on the inevitable
	// build trail when a shard happens to need a build.
	if (
		trimmed.startsWith('The following Tests') ||
		trimmed.startsWith('Test run for ') ||
		/\btest\(s\) discovered\b/.test(trimmed) ||
		/->\s/.test(trimmed)
	) {
		return null;
	}

	// Strip the optional trailing parenthesized parameter list (theory
	// parameters). Without this, a theory line like
	//   `    Foo.BarSpec.ItShouldDoX(value: "admin")`
	// would not match TEST_ENTRY_GRAMMAR because of the `(value: ...)`
	// tail. The grammar (not this strip) defines what counts as a test
	// entry; this strip just prepares the line for the grammar check.
	const withoutParams = stripTrailingParenGroup(trimmed);

	if (!TEST_ENTRY_GRAMMAR.test(withoutParams)) {
		// The line is non-empty, not a known header, and not a valid
		// test entry. The blob we are parsing is not a real
		// `--list-tests` listing. Fail loud: silently coercing this
		// to a class FQN was the round-1 defect (silently seeded the
		// shard predicate with garbage and produced four green shards
		// that ran zero tests).
		throw new Error(
			`shard-api-tests: cannot parse line as a --list-tests entry: ${JSON.stringify(line)}\n` +
				`Expected the indented shape '    <Namespace>.<ClassSpec>.<MethodName>' or its theory variant '(args: ...)'. ` +
				`Got a non-empty, non-header line that does not match — most often this means the blob fed to partitionFromListOutput() is not a real --list-tests output (e.g., the output of a failed 'dotnet test --filter ...' run, which produces lines like 'No test matches the given testcase filter ...' and 'ClassName="..." -> /path/...').`,
		);
	}

	// Drop the last segment (the method name) — the test-entry grammar
	// guarantees at least one `.`, so the slice is always defined.
	const lastDot = withoutParams.lastIndexOf('.');

	return withoutParams.slice(0, lastDot);
};

/**
 * Partition a raw `dotnet test --list-tests` blob into per-shard test
 * entries. Preserves the original line text on every emitted entry, so
 * the consumer can reuse xUnit's filter syntax directly: a shard's
 * `entries` joined by `|` produces a `--filter` predicate of
 * `FullyQualifiedName~name1|FullyQualifiedName~name2|...` that
 * matches exactly the methods the runner would have discovered.
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
		// `classFqnFromListLine` returns `null` for known headers and
		// throws on unparseable lines. A throw aborts the partition
		// loudly, which is the round-2 fix for the round-1 silent
		// acceptance of malformed input.
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
	let totalClassCount = 0;
	for (const s of shards) {
		totalClassCount += s.classCount;
	}

	return {
		shards,
		totalClassCount,
		totalTestCount,
	};
};
