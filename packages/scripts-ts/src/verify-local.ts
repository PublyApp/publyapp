import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
	classifyPath,
	countSizedLines,
	isSizeExempt,
} from './check-quality-ratchet.ts';
import { LANE_PATTERNS } from './ci-changed-paths.ts';

export const repoRoot = path.resolve(
	fileURLToPath(new URL('../../..', import.meta.url)),
);
export const DEFAULT_BASE = 'origin/develop';
export const DIFF_LIMITS = { maxFiles: 50, maxSizedLines: 600 } as const;
export type Scope = 'all' | 'front' | 'api' | 'tooling';

const TRIGGER_ROWS = [
	String.raw`deps;;^(pnpm-lock\.yaml|package-lock\.json|packages\.lock\.json|pnpm-workspace\.yaml|\.npmrc|turbo\.json)$|(^|\/)package\.json$;;pnpm-lock.yaml;;all`,
	String.raw`config;;^(packages\/_tsconfig\/|\.oxlintrc\.json$|\.oxfmtrc\.json$|knip\.ts$)|(^|\/)(tsconfig[^/]*\.json|vitest[^/]*\.config\.ts|vitest\.setup\.ts)$;;tsconfig.json;;all;;1`,
	String.raw`ci;;^(\.github\/(workflows|actions)\/|\.github\/CODEOWNERS$|justfile$|\.gitignore$|\.dockerignore$|dokploy\.yml$)|(^|\/)(docker-)?compose[^/]*\.ya?ml$;;justfile;;all`,
	String.raw`dotnet;;^(Directory\.Build\.(props|targets)|Directory\.Packages\.props|global\.json|PublyApp\.slnx|\.config\/dotnet-tools\.json)$|(^|\/)[^/]+\.csproj$;;Directory.Build.props;;all`,
	String.raw`api-shared;;^apps\/api\/(Lib|Data|Infrastructure|Migrations|Tests)\/|^apps\/apphost\/;;apps/api/Lib/AppEnvironment.cs;;api`,
	String.raw`front-inputs;;^(packages\/shared-ts\/|apps\/front\/scripts\/ci\/|apps\/front\/src\/routeTree\.gen\.ts$);;packages/shared-ts/src/lib/logger/iso-logger.ts;;front`,
	String.raw`generated-client;;^(packages\/client-ts\/|apps\/api\/openapi\.json$);;packages/client-ts/src/index.ts;;all`,
	String.raw`lint-packages;;^packages\/(lint-ts|lint-cs)\/;;packages/lint-ts/src/index.ts;;all`,
	String.raw`scripts-ts;;^packages\/scripts-ts\/;;packages/scripts-ts/src/ci-changed-paths.ts;;tooling`,
	String.raw`generated-cs;;\.g\.cs$;;apps/api/Modules/Posts/Posts.g.cs;;api`,
];

export const FULL_TRIGGERS = TRIGGER_ROWS.map((row) => {
	const [id, source, example, scope, localOnly] = row.split(';;');
	return {
		id,
		pattern: new RegExp(source),
		example,
		scope: scope as Scope,
		localOnly: localOnly === '1',
	};
});

const DOCS = new RegExp(LANE_PATTERNS.docs);
// `.github/` is in the docs lane for CI, but a deleted workflow must fail closed.
const isDocs = (file: string) =>
	DOCS.test(file) && !file.startsWith('.github/');

const TESTS = /\.(test|spec)\.[cm]?[tj]sx?$/;
// Excluded from the front Vitest project; CI runs them in the non-vitest lane.
const NON_VITEST =
	/^apps\/front\/(src\/lib\/(i18n\/key-coverage|mutation-feedback\/mutation-feedback-architecture|query\/route-loader-query-key-guard)|scripts\/ci\/(check-front-runtime-image|compose-startup|validate-runtime-env-startup|vitest-shard-coverage|__fixtures__\/))/;
// Front Vitest's real `include`, minus its own exclusions and the proofs lane.
export const isFrontTest = (file: string) =>
	/^apps\/front\/(src\/(?!styles\/drawer-description-contrast).+\.test\.tsx?|e2e\/(helpers|__tests__)\/.+\.test\.ts|scripts\/ci\/.+\.test\.ts)$/.test(
		file,
	) && !NON_VITEST.test(file);
const LINTABLE = /\.(ts|tsx|js|jsx|mjs|mts|cts|cjs)$/;
const FORMATTABLE = /\.(ts|tsx|js|jsx|mjs|mts|cts|cjs|json|css)$/;
const FRONT_PROGRAM =
	/^(apps\/front\/(src|scripts|tools|deploy)\/|packages\/shared-ts\/src\/)/;
const API_PROJECT = 'apps/api/Tests/PublyApp.Api.Tests.csproj';
const API_BUILD_ENV = {
	APP_ROLE: 'api',
	SOCIAL_ACCOUNTS_MASTER_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
};
const API_TEST_ENV = {
	APP_ROLE: 'all',
	ASPNETCORE_ENVIRONMENT: 'Testing',
	SOCIAL_ACCOUNTS_MASTER_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
};
const OXFMT = 'pnpm exec oxfmt --check';
const OXLINT = 'pnpm exec oxlint --deny-warnings';
const TSC_FRONT =
	'pnpm exec tsc -p apps/front/tsconfig.json --incremental --tsBuildInfoFile node_modules/.cache/verify/front.tsbuildinfo';
const TSC_SERVER = 'pnpm exec tsc --noEmit -p apps/front/tsconfig.server.json';
const TSC_JS = 'pnpm exec tsc --noEmit -p apps/front/tsconfig.js-surfaces.json';
const COVERAGE =
	'node apps/front/scripts/run-guarded.ts apps/front/scripts/guards/check-typecheck-coverage.ts';
const VITEST_FRONT = 'pnpm --filter front exec vitest run';
const VITEST_RELATED = 'pnpm --filter front exec vitest related --run';
const SCRIPTS_TEST = 'pnpm --filter scripts-ts exec vitest run';
const API_BUILD = `dotnet build ${API_PROJECT} -c Test --nologo --verbosity minimal`;
const API_TEST = `dotnet test ${API_PROJECT} -c Test --nologo --verbosity minimal`;
const DOC_LINKS = 'just ci-doc-links';
const SPEC_DRIFT = 'just ci-spec-drift';
const MIGRATION_GUARD = 'just ci-migration-expand-contract';
const KNP = 'pnpm exec knip';
const RATCHET = 'pnpm check:quality';

export type Check = {
	id: string;
	short: string;
	command: string[];
	env?: NodeJS.ProcessEnv;
};
export type Plan = {
	mode: 'subset' | 'full';
	scope: Scope | null;
	reason: string | null;
	changed: string[];
	checks: Check[];
	skipped: { id: string; reason: string }[];
};
export type PlanDeps = {
	listDir: (dir: string) => string[];
	findImporters: (file: string) => string[];
};
export type PlanInput = {
	changed: readonly string[];
	deleted?: readonly string[];
	sizedLines?: number;
	full?: boolean;
	deps?: Partial<PlanDeps>;
};
const argv = (line: string) => line.split(' ');
const withFiles = (line: string, files: readonly string[]) => [
	...argv(line),
	...files,
];
const relTo = (root: string, files: readonly string[]) =>
	files.map((file) => path.posix.relative(root, file));
const git = (args: string[], cwd = repoRoot): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });

const check = (
	id: string,
	short: string,
	line: string | string[],
	env?: NodeJS.ProcessEnv,
): Check => {
	const command = typeof line === 'string' ? argv(line) : line;
	return env ? { id, short, command, env } : { id, short, command };
};

export const laneOf = (
	file: string,
): 'front' | 'api' | 'tooling' | 'docs' | null => {
	if (DOCS.test(file)) {
		return 'docs';
	}
	const zone = classifyPath(file);
	if (zone === 'front' || zone === 'tests-front') {
		return 'front';
	}
	if (zone === 'api' || zone === 'tests-api') {
		return 'api';
	}
	if (zone === 'tooling') {
		return file.startsWith('apps/front/') ? 'front' : 'tooling';
	}
	if (/^apps\/(front|api|apphost)\//.test(file)) {
		return file.startsWith('apps/front/') ? 'front' : 'api';
	}
	return null;
};

const sourceStem = (file: string) => {
	const base = path.posix.basename(file).replace(/\.[^.]+$/, '');
	if (base === 'index') {
		return path.posix.basename(path.posix.dirname(file));
	}
	return base;
};

/** Depth-1: changed tests, co-located tests, direct importers, then related. */
export const selectTests = (
	sources: readonly string[],
	changedTests: readonly string[],
	deps: PlanDeps,
	isTest: (file: string) => boolean = (file) => TESTS.test(file),
) => {
	const tests = new Set(changedTests);
	const related: string[] = [];
	for (const source of sources) {
		const dir = path.posix.dirname(source);
		const found = [
			...deps.listDir(dir).map((name) => `${dir}/${name}`),
			...deps.findImporters(source),
		].filter(isTest);
		for (const file of found) {
			tests.add(file);
		}
		if (found.length === 0) {
			related.push(source);
		}
	}
	if (tests.size > 40) {
		return { tests: [], related: [], full: true };
	}
	return { tests: [...tests].sort(), related: related.sort(), full: false };
};

type Add = (
	id: string,
	short: string,
	command: string | string[],
	env?: NodeJS.ProcessEnv,
) => void;

const frontPlan = (
	changed: readonly string[],
	deps: PlanDeps,
	add: Add,
): void => {
	const program = changed.some((file) => FRONT_PROGRAM.test(file));
	// CI runs these for every front change; a subset must not certify less.
	for (const line of [
		'pnpm --filter front build',
		'pnpm --filter front check:design-system',
		'just react-doctor',
		KNP,
	]) {
		add(line, line, line);
	}
	if (program) {
		add('tsc-front', 'tsc(front, incremental)', TSC_FRONT);
		add('tsc-server', 'tsc(server)', TSC_SERVER);
		add('tsc-js-surfaces', 'tsc(js-surfaces)', TSC_JS);
	}
	if (changed.some((file) => file.startsWith('apps/front/scripts/'))) {
		add('typecheck-coverage', 'typecheck-coverage', COVERAGE);
	}
	if (changed.some((file) => NON_VITEST.test(file))) {
		add('non-vitest', 'non-vitest', 'pnpm --filter front test:ci-non-vitest');
	}
	const front = changed.filter((file) => file.startsWith('apps/front/'));
	const selection = selectTests(
		front.filter((file) => !TESTS.test(file)),
		front.filter(isFrontTest),
		deps,
		isFrontTest,
	);
	if (selection.full) {
		add('vitest-front', 'depth-1 > 40 importers -> full front', VITEST_FRONT);
	}
	if (selection.tests.length > 0) {
		add(
			'vitest-front',
			`depth-1: ${selection.tests.length} file(s)`,
			withFiles(VITEST_FRONT, relTo('apps/front', selection.tests)),
		);
	}
	if (selection.related.length > 0) {
		add(
			'vitest-front-related',
			`related: ${selection.related.length} file(s)`,
			withFiles(VITEST_RELATED, relTo('apps/front', selection.related)),
		);
	}
};

const apiPlan = (changed: readonly string[], add: Add): void => {
	const modules = changed
		.map((file) => file.match(/^apps\/api\/Modules\/([^/]+)\//)?.[1])
		.filter((name): name is string => Boolean(name));
	const moduleOnly =
		modules.length > 0 &&
		changed.every((file) => /^apps\/api\/Modules\/[^/]+\//.test(file));
	const names = [...new Set(modules)].sort();
	const filters = moduleOnly
		? names.map((name) => `FullyQualifiedName~Modules.${name}`).join('|')
		: null;
	const label = moduleOnly ? `api: ${names.join(',')}` : 'api';
	add('build-api', `build(${label})`, argv(API_BUILD), API_BUILD_ENV);
	add('spec-drift', 'openapi+client drift', SPEC_DRIFT);
	add(
		'test-api',
		`test(${label})`,
		[
			...argv(API_TEST),
			...(filters ? ['--filter', filters] : []),
			'--no-build',
		],
		API_TEST_ENV,
	);
};

const subsetPlan = (
	changed: readonly string[],
	deleted: readonly string[],
	deps: PlanDeps,
): Check[] => {
	const lanes = new Set(changed.map((file) => laneOf(file) ?? 'unknown'));
	const checks: Check[] = [];
	const add: Add = (id, short, command, env) => {
		checks.push(check(id, short, command, env));
	};
	const frontOrTooling = lanes.has('front') || lanes.has('tooling');
	for (const [id, line, pattern] of [
		['format', OXFMT, FORMATTABLE],
		['lint', OXLINT, LINTABLE],
	] as const) {
		const files = changed.filter((file) => pattern.test(file));
		if (frontOrTooling && files.length > 0) {
			add(id, `${id}(${files.length})`, withFiles(line, files));
		}
	}
	if (lanes.has('front')) {
		frontPlan(changed, deps, add);
	}
	if (lanes.has('api')) {
		apiPlan(changed, add);
	}
	if (changed.some((file) => classifyPath(file) !== null)) {
		add('ratchet', 'ratchet', RATCHET);
	}
	if ([...changed, ...deleted].some(isDocs)) {
		add('doc-links', 'doc-links', DOC_LINKS);
	}
	return checks;
};

const FULL_GATES = {
	all: 'just ci',
	front: 'just ci-front',
	api: 'just test-api',
	tooling: SCRIPTS_TEST,
} satisfies Record<Scope, string>;

const SCOPE_EXTRAS = {
	front: [
		'pnpm format',
		'pnpm lint',
		'node packages/scripts-ts/src/lint-front.ts --quiet',
		'node packages/scripts-ts/src/check-no-floating-promises.ts',
		KNP,
		'just react-doctor',
	],
	api: [SPEC_DRIFT, MIGRATION_GUARD],
	tooling: ['pnpm format', 'pnpm lint', KNP],
	all: [],
} satisfies Record<Scope, readonly string[]>;

const fullPlan = (scope: Scope, reason: string, changed: string[]): Plan => {
	const gate = FULL_GATES[scope];
	const checks = [check('full', `FULL: ${gate}`, gate)];
	for (const line of SCOPE_EXTRAS[scope]) {
		checks.push(check(line, line, line));
	}
	if (scope !== 'all') {
		checks.push(check('ratchet', 'ratchet', RATCHET));
	}
	return { mode: 'full', scope, reason, changed, checks, skipped: [] };
};

const SKIP_REASONS = {
	format: 'no formattable file changed',
	lint: 'no lintable TypeScript changed',
	'tsc-front': 'no front/program TypeScript changed',
	'tsc-server': 'server.ts/trust-proxy.ts unchanged',
	'tsc-js-surfaces': 'js-surfaces inputs unchanged',
	'typecheck-coverage': 'typecheck-coverage inputs unchanged',
	'vitest-front': 'no changed test or depth-1 importer',
	'vitest-front-related': 'no source needs the related-test fallback',
	'build-api': 'no API file changed',
	'test-api': 'no API file changed',
	ratchet: 'no judged source file changed',
	'doc-links': 'no docs changed',
};

const forcedScope = (
	changed: readonly string[],
	deleted: readonly string[],
	sizedLines: number,
) => {
	for (const file of changed) {
		const hit = FULL_TRIGGERS.find((entry) => entry.pattern.test(file));
		if (hit) {
			return { scope: hit.scope, reason: `${hit.id}: ${file}` };
		}
	}
	const removed = deleted.find((entry) => !isDocs(entry));
	if (removed) {
		return {
			scope: 'all' as const,
			reason: `deleted or renamed path cannot be mapped: ${removed}`,
		};
	}
	if (changed.length > DIFF_LIMITS.maxFiles) {
		return {
			scope: 'all' as const,
			reason: `${changed.length} changed files > ${DIFF_LIMITS.maxFiles}`,
		};
	}
	if (sizedLines > DIFF_LIMITS.maxSizedLines) {
		return {
			scope: 'all' as const,
			reason: `${sizedLines} non-test changed lines > ${DIFF_LIMITS.maxSizedLines}`,
		};
	}
	return null;
};

export const buildPlan = (input: PlanInput): Plan => {
	const changed = [
		...new Set(input.changed.map((file) => file.replaceAll('\\', '/'))),
	].sort();
	const deleted = [...new Set(input.deleted ?? [])].sort();
	const deps: PlanDeps = {
		listDir: () => [],
		findImporters: () => [],
		...input.deps,
	};
	if (input.full) {
		return fullPlan('all', '--full requested', changed);
	}
	const forced = forcedScope(changed, deleted, input.sizedLines ?? 0);
	if (forced) {
		return fullPlan(forced.scope, forced.reason, changed);
	}
	const unknown = changed.find((file) => laneOf(file) === null);
	if (unknown) {
		return fullPlan('all', `unknown path: ${unknown}`, changed);
	}
	const checks = subsetPlan(changed, deleted, deps);
	const present = new Set(checks.map((entry) => entry.id));
	const skipped = Object.entries(SKIP_REASONS)
		.filter(([id]) => !present.has(id))
		.map(([id, why]) => ({ id, reason: why }));
	return {
		mode: 'subset',
		scope: null,
		reason: null,
		changed,
		checks,
		skipped,
	};
};

const countLines = (file: string, cwd = repoRoot): number => {
	try {
		const text = fs.readFileSync(path.resolve(cwd, file), 'utf8');
		return text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0;
	} catch {
		return 0;
	}
};

export const collectChanged = (base: string, cwd = repoRoot): PlanInput => {
	const mergeBase = git(['merge-base', 'HEAD', base], cwd).trim();
	const rows = git(
		['diff', '--name-status', '-M', '--diff-filter=ACMRD', mergeBase],
		cwd,
	)
		.split('\n')
		.filter(Boolean)
		.map((row) => row.split('\t'));
	const changed = rows
		.filter(([status]) => !status.startsWith('D'))
		.map((row) => row[row.length - 1]);
	const deleted = rows
		.filter(
			([status]) =>
				status.startsWith('D') ||
				status.startsWith('R') ||
				status.startsWith('C'),
		)
		.map((row) => row[1]);
	const untracked = git(['ls-files', '--others', '--exclude-standard'], cwd)
		.split('\n')
		.filter(Boolean);
	changed.push(...untracked);
	let sizedLines = countSizedLines(
		git(['diff', '--numstat', '-M', mergeBase], cwd),
	);
	for (const file of untracked.filter((entry) => !isSizeExempt(entry))) {
		sizedLines += countLines(file, cwd);
	}
	return { changed, deleted, sizedLines };
};

const importerPattern = (file: string) =>
	`[/'"]${sourceStem(file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\.(ts|tsx|js|jsx))?['"]`;

export const defaultDeps: PlanDeps = {
	listDir: (dir) => {
		try {
			return fs.readdirSync(path.resolve(repoRoot, dir));
		} catch {
			return [];
		}
	},
	findImporters: (file) => {
		try {
			return git([
				'grep',
				'-l',
				'-E',
				'-e',
				importerPattern(file),
				'--',
				'apps/front/src',
				'packages/shared-ts',
			])
				.split('\n')
				.filter((match) => TESTS.test(match))
				.sort();
		} catch {
			return [];
		}
	},
};

const describePlan = (plan: Plan, base: string, explain: boolean): void => {
	const head =
		plan.mode === 'full'
			? `verify: FULL(${plan.scope}) — ${plan.reason}`
			: `verify: ${plan.changed.length} file(s) changed vs ${base}`;
	console.log(
		`${head}\nverify: ${plan.checks.map((entry) => entry.short).join(' + ') || 'nothing'}`,
	);
	if (explain) {
		for (const skip of plan.skipped) {
			console.log(`verify: skipped ${skip.id}: ${skip.reason}`);
		}
	}
};

const runCheck = (entry: Check): boolean => {
	console.log(`\nverify: ${entry.short} — $ ${entry.command.join(' ')}`);
	const status = spawnSync(entry.command[0], entry.command.slice(1), {
		cwd: repoRoot,
		env: { ...process.env, ...entry.env },
		stdio: 'inherit',
	}).status;
	if (status === 0) {
		return true;
	}
	console.error(`\nverify: FAILED ${entry.id}\n  $ ${entry.command.join(' ')}`);
	return false;
};

const parseArgs = (args: readonly string[]) => {
	const parsed = { base: DEFAULT_BASE, full: false, explain: false };
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === '--base') {
			parsed.base = args[(index += 1)] ?? DEFAULT_BASE;
		} else if (arg === '--full') {
			parsed.full = true;
		} else if (arg === '--explain') {
			parsed.explain = true;
		} else {
			throw new Error(`unknown argument: ${arg}`);
		}
	}
	return parsed;
};

export const main = (args: readonly string[]): number => {
	const parsed = parseArgs(args);
	const plan = buildPlan({
		...(parsed.full
			? { changed: [], deleted: [], sizedLines: 0 }
			: collectChanged(parsed.base)),
		full: parsed.full,
		deps: defaultDeps,
	});
	describePlan(plan, parsed.base, parsed.explain);
	if (plan.checks.length === 0) {
		console.log('verify: no changes — nothing to check');
		return 0;
	}
	for (const entry of plan.checks) {
		if (!runCheck(entry)) {
			return 1;
		}
	}
	console.log(
		`\nverify: OK (${plan.checks.map((entry) => entry.short).join(' + ')})`,
	);
	return 0;
};

const isDirectRun =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	try {
		process.exit(main(process.argv.slice(2)));
	} catch (error) {
		console.error(
			`verify: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}
