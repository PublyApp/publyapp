import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Splits the API integration suite into shards for the central CI `api` lane
// (#1947). Whole test classes are assigned by a stable hash of the class's
// fully-qualified name, so a class never spans shards and adding or removing a
// class never moves another one.
//
//   node packages/scripts-ts/src/shard-api-tests.ts <shard> <total>
//
// prints `tests=<assigned test count>` and `filter=<dotnet test --filter>` on
// stdout. The shard job runs that filter and fails unless the executed total
// equals the assigned count.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

const LISTING_HEADER = 'The following Tests are available:';
const CLASS_NAME = /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)+$/;

export type Suite = Map<string, Set<string>>;

/** Discovers the real suite: builds (if stale) and lists the API test project. */
export const discoverSuite = (root: string = repoRoot): Suite => {
	const result = spawnSync(
		'dotnet',
		[
			'test',
			'Tests/PublyApp.Api.Tests.csproj',
			'-c',
			'Test',
			'--no-restore',
			'--nologo',
			'--list-tests',
		],
		{
			cwd: path.join(root, 'apps/api'),
			encoding: 'utf8',
			maxBuffer: 256 * 1024 * 1024,
			env: {
				...process.env,
				APP_ROLE: 'all',
				ASPNETCORE_ENVIRONMENT: 'Testing',
			},
		},
	);
	if (result.error !== undefined) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(
			`API test discovery failed (exit ${result.status}):\n${result.stdout.slice(-4000)}${result.stderr}`,
		);
	}
	return parseListing(result.stdout);
};

/** Groups `dotnet test --list-tests` output by class, deduping tests per class. */
export const parseListing = (output: string): Suite => {
	const lines = output.split(/\r?\n/);
	const header = lines.indexOf(LISTING_HEADER);
	if (header === -1) {
		throw new Error(`Test listing has no "${LISTING_HEADER}" section`);
	}
	const suite: Suite = new Map();
	for (const line of lines.slice(header + 1)) {
		if (line.trim() === '') {
			continue;
		}
		if (!line.startsWith('    ')) {
			throw new Error(`Unexpected line in test listing: ${line}`);
		}
		const test = line.trim();
		const methodName = test.split('(')[0] ?? test;
		const className = methodName.slice(0, methodName.lastIndexOf('.'));
		if (!CLASS_NAME.test(className)) {
			throw new Error(`Cannot derive a plain class name from test: ${test}`);
		}
		const tests = suite.get(className) ?? new Set<string>();
		tests.add(test);
		suite.set(className, tests);
	}
	if (suite.size === 0) {
		throw new Error('Test listing is empty');
	}
	return suite;
};

export const shardOf = (className: string, total: number): number =>
	(createHash('sha256').update(className).digest().readUInt32BE(0) % total) + 1;

type ShardPlan = { classes: string[]; tests: number; filter: string };

export const planShard = (
	suite: Suite,
	shard: number,
	total: number,
): ShardPlan => {
	const classes = [...suite.keys()]
		.filter((className) => shardOf(className, total) === shard)
		.sort();
	if (classes.length === 0) {
		throw new Error(`Shard ${shard}/${total} owns no test classes`);
	}
	let tests = 0;
	for (const className of classes) {
		tests += suite.get(className)?.size ?? 0;
	}
	// The trailing dot keeps `Ns.FooSpec` from also matching `Ns.FooSpecExtra`.
	const filter = classes
		.map((className) => `FullyQualifiedName~${className}.`)
		.join('|');
	return { classes, tests, filter };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const shard = Number(process.argv[2]);
	const total = Number(process.argv[3]);
	if (
		!Number.isInteger(shard) ||
		!Number.isInteger(total) ||
		shard < 1 ||
		shard > total
	) {
		console.error(
			'usage: shard-api-tests.ts <shard> <total>  (1 <= shard <= total)',
		);
		process.exit(2);
	}
	const plan = planShard(discoverSuite(), shard, total);
	console.error(
		`API shard ${shard}/${total}: ${plan.classes.length} classes, ${plan.tests} tests`,
	);
	console.log(`tests=${plan.tests}`);
	console.log(`filter=${plan.filter}`);
}
