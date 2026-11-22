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
const MODULE_NAME = /^[A-Za-z][A-Za-z0-9]*$/;

/** Listed test count per fully-qualified class name. */
export type Suite = Map<string, number>;

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
				// The listing header is parsed as English text.
				DOTNET_CLI_UI_LANGUAGE: 'en',
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

/**
 * Counts every listed line per class: theory rows whose display names collide are
 * listed repeatedly and all execute, so the listing count equals the executed count.
 */
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
		suite.set(className, (suite.get(className) ?? 0) + 1);
	}
	if (suite.size === 0) {
		throw new Error('Test listing is empty');
	}
	return suite;
};

export const shardOf = (className: string, total: number): number =>
	(createHash('sha256').update(className).digest().readUInt32BE(0) % total) + 1;

type ShardPlan = { classes: string[]; tests: number; filter: string };

/**
 * Keeps only the spec classes of the selected modules. Returns `undefined` when
 * no class matches, so the caller can fall back to the whole suite rather than
 * certify an empty run (a module with no spec classes of its own, or a mapping
 * that no longer holds).
 */
export const filterSuiteByModules = (
	suite: Suite,
	modules: readonly string[],
): Suite | undefined => {
	const prefixes = modules.map((module) => `PublyApp.Api.Modules.${module}.`);
	const filtered: Suite = new Map();
	for (const [className, tests] of suite) {
		if (prefixes.some((prefix) => className.startsWith(prefix))) {
			filtered.set(className, tests);
		}
	}
	return filtered.size === 0 ? undefined : filtered;
};

export const planShard = (
	suite: Suite,
	shard: number,
	total: number,
	allowEmpty = false,
): ShardPlan => {
	const classes = [...suite.keys()]
		.filter((className) => shardOf(className, total) === shard)
		.sort();
	if (classes.length === 0) {
		if (!allowEmpty) {
			throw new Error(`Shard ${shard}/${total} owns no test classes`);
		}
		// A partial (PR) selection can legitimately miss a whole shard; the
		// union across the four shards is still exactly the selected suite.
		return { classes: [], tests: 0, filter: '' };
	}
	let tests = 0;
	for (const className of classes) {
		tests += suite.get(className) ?? 0;
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
	const modulesArg = process.argv[4];
	if (
		!Number.isInteger(shard) ||
		!Number.isInteger(total) ||
		shard < 1 ||
		shard > total
	) {
		console.error(
			'usage: shard-api-tests.ts <shard> <total> [module,module]  (1 <= shard <= total)',
		);
		process.exit(2);
	}
	const modules =
		modulesArg === undefined || modulesArg === ''
			? undefined
			: modulesArg.split(',').filter((module) => module !== '');
	if (
		modules !== undefined &&
		(modules.length === 0 ||
			!modules.every((module) => MODULE_NAME.test(module)))
	) {
		console.error(`invalid module selection: ${modulesArg}`);
		process.exit(2);
	}
	let suite = discoverSuite();
	let selectedModules: string[] | undefined;
	if (modules !== undefined) {
		const filtered = filterSuiteByModules(suite, modules);
		if (filtered === undefined) {
			console.error(
				`no spec class matches ${modules.join(', ')}; running the full suite`,
			);
		} else {
			suite = filtered;
			selectedModules = modules;
		}
	}
	const plan = planShard(suite, shard, total, selectedModules !== undefined);
	console.error(
		`API shard ${shard}/${total}: ${plan.classes.length} classes, ${plan.tests} tests${selectedModules === undefined ? '' : ` (selection: ${selectedModules.join(', ')})`}`,
	);
	console.log(`tests=${plan.tests}`);
	console.log(`filter=${plan.filter}`);
}
