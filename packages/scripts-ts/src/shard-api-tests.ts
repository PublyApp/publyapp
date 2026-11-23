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

const MODULE_NAMESPACE = 'PublyApp.Api.Modules.';

// Specs outside `Modules/` that read every module, the whole assembly or the
// EF model, so an X-only PR must run them or it certifies a change they would
// reject. `Lib/Architecture/` guards reflect the assembly and the EF model and
// scan all of `Modules/**` (tenant predicates, publication writers, canary
// wiring, handler contracts, service conventions). The five exact names below
// live outside that folder and read across modules, `apps/api` or the assembly:
//   - JobEnqueueBoundarySpec: every `apps/api/**/*.cs` writes to job_queue
//   - OpenTelemetryLogPathGuardSpec: every `apps/api/**/*.cs` OTel token
//   - ServiceAttributeRegistrationSpec: every type in the API assembly
//   - RequireTenantScopeSpec: multi-module tenant guard whose ForTenant reads
//     throw on an unscoped context (outside `Modules/`)
//   - EndpointRateLimitAssignmentsSpec: pins the rate-limit policies of
//     Users/AuditLogs/Roles/Invitations/Uploads endpoints on the route graph
export const CROSS_MODULE_SPEC_PREFIXES = ['PublyApp.Api.Lib.Architecture.'];

export const CROSS_MODULE_SPECS = [
	'PublyApp.Api.Infrastructure.Jobs.JobEnqueueBoundarySpec',
	'PublyApp.Api.Lib.Diagnostics.OpenTelemetryLogPathGuardSpec',
	'PublyApp.Api.Lib.DI.ServiceAttributeRegistrationSpec',
	'PublyApp.Api.Data.DbContext.RequireTenantScopeSpec',
	'PublyApp.Api.Lib.RateLimiting.EndpointRateLimitAssignmentsSpec',
];

const isCrossModuleSpec = (className: string): boolean =>
	CROSS_MODULE_SPEC_PREFIXES.some((prefix) => className.startsWith(prefix)) ||
	CROSS_MODULE_SPECS.includes(className);

/**
 * Keeps the spec classes of the selected modules plus the cross-module guards.
 *
 * Returns `undefined` when the selection cannot be honoured: no class at all,
 * or any selected module without a spec class of its own. The caller then runs
 * the whole suite rather than silently dropping one module (a `Media,Posts`
 * diff where Media has no specs used to run Posts only).
 */
export const filterSuiteByModules = (
	suite: Suite,
	modules: readonly string[],
): Suite | undefined => {
	if (modules.length === 0) {
		return undefined;
	}
	const prefixes = new Map(
		modules.map((module) => [module, `${MODULE_NAMESPACE}${module}.`]),
	);
	const matched = new Set<string>();
	const filtered: Suite = new Map();
	for (const [className, tests] of suite) {
		const module = [...prefixes].find(([, prefix]) =>
			className.startsWith(prefix),
		)?.[0];
		if (module !== undefined) {
			matched.add(module);
			filtered.set(className, tests);
		} else if (isCrossModuleSpec(className)) {
			filtered.set(className, tests);
		}
	}
	if (filtered.size === 0 || matched.size !== modules.length) {
		return undefined;
	}
	return filtered;
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
				`cannot honour the ${modules.join(', ')} selection (a selected module has no spec class); running the full suite`,
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
