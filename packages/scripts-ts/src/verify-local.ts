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

// §4.4 fail-closed inputs; the test asserts each is lane-covered or local-only.
const TRIGGER_ROWS = [
	String.raw`deps;;^(pnpm-lock\.yaml|package-lock\.json|packages\.lock\.json|pnpm-workspace\.yaml|\.npmrc|turbo\.json)$|(^|\/)package\.json$;;pnpm-lock.yaml;;all`,
	String.raw`config;;^(packages\/_tsconfig\/|\.oxlintrc\.json$|\.oxfmtrc\.json$|knip\.ts$)|(^|\/)(tsconfig[^/]*\.json|vitest[^/]*\.config\.ts|vitest\.setup\.ts)$;;tsconfig.json;;all;;1`,
	String.raw`ci;;^(\.github\/(workflows|actions)\/|\.github\/CODEOWNERS$|justfile$|\.gitignore$|\.dockerignore$|dokploy\.yml$)|(^|\/)(docker-)?compose[^/]*\.ya?ml$;;justfile;;all`,
	String.raw`dotnet;;^(Directory\.Build\.(props|targets)|Directory\.Packages\.props|global\.json|PublyApp\.slnx|\.config\/dotnet-tools\.json)$|(^|\/)[^/]+\.csproj$;;Directory.Build.props;;all`,
	String.raw`api-lib;;^apps\/api\/Lib\/;;apps/api/Lib/AppEnvironment.cs;;api`,
	String.raw`api-shared;;^apps\/api\/(Data|Infrastructure|Migrations|Tests)\/|^apps\/apphost\/;;apps/api/Tests/Foo.cs;;api`,
	String.raw`api-openapi;;^apps\/api\/openapi\.json$;;apps/api/openapi.json;;all`,
	String.raw`shared-ts;;^packages\/shared-ts\/;;packages/shared-ts/src/lib/logger/iso-logger.ts;;front`,
	String.raw`client-ts;;^packages\/client-ts\/;;packages/client-ts/src/index.ts;;all`,
	String.raw`lint-ts;;^packages\/lint-ts\/;;packages/lint-ts/src/index.ts;;all`,
	String.raw`lint-cs;;^packages\/lint-cs\/;;packages/lint-cs/Analyzers/NullCheck.cs;;all`,
	String.raw`scripts-ts;;^packages\/scripts-ts\/;;packages/scripts-ts/src/ci-changed-paths.ts;;tooling`,
	String.raw`front-ci;;^apps\/front\/scripts\/ci\/;;apps/front/scripts/ci/run-proofs.ts;;front`,
	String.raw`route-tree;;^apps\/front\/src\/routeTree\.gen\.ts$;;apps/front/src/routeTree.gen.ts;;front`,
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
const TESTS = /\.(test|spec)\.[cm]?[tj]sx?$/;
const LINTABLE = /\.(ts|tsx|js|jsx|mjs|mts|cts|cjs)$/;
const FORMATTABLE = /\.(ts|tsx|js|jsx|mjs|mts|cts|cjs|json|css)$/;
const FRONT_PROGRAM =
	/^(apps\/front\/(src|scripts|tools|deploy)\/|packages\/shared-ts\/src\/)/;
const FRONT_JS_SURFACES =
	/^apps\/front\/(deploy\/request-counter\/(control-routes|server)\.ts|src\/components\/ui\/drawer-guard-tmp-dir\.ts)$/;
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
const DOC_LINKS = 'node packages/scripts-ts/src/check-doc-links.ts';
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
	if (env) {
		return { id, short, command, env };
	}
	return { id, short, command };
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
	if (/^apps\/(api|apphost)\//.test(file)) {
		return 'api';
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
) => {
	const tests = new Set(changedTests);
	const related: string[] = [];
	for (const source of sources) {
		const dir = path.posix.dirname(source);
		const found = [
			...deps.listDir(dir).map((name) => `${dir}/${name}`),
			...deps.findImporters(source),
		].filter((file) => TESTS.test(file));
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
	if (program) {
		add('tsc-front', 'tsc(front, incremental)', TSC_FRONT);
		add('tsc-server', 'tsc(server)', TSC_SERVER);
	}
	if (program || changed.some((file) => FRONT_JS_SURFACES.test(file))) {
		add('tsc-js-surfaces', 'tsc(js-surfaces)', TSC_JS);
	}
	if (changed.some((file) => file.startsWith('apps/front/scripts/'))) {
		add('typecheck-coverage', 'typecheck-coverage', COVERAGE);
	}
	const front = changed.filter((file) => file.startsWith('apps/front/'));
	const selection = selectTests(
		front.filter((file) => !TESTS.test(file)),
		front.filter((file) => TESTS.test(file)),
		deps,
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
	const code = changed.filter((file) => LINTABLE.test(file));
	if (code.length > 0 && (lanes.has('front') || lanes.has('tooling'))) {
		const formattable = code.filter((file) => FORMATTABLE.test(file));
		if (formattable.length > 0) {
			add(
				'format',
				`format(${formattable.length})`,
				withFiles(OXFMT, formattable),
			);
		}
		add('lint', `lint(${code.length})`, withFiles(OXLINT, code));
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
	if ([...changed, ...deleted].some((file) => DOCS.test(file))) {
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

const fullPlan = (scope: Scope, reason: string, changed: string[]): Plan => {
	const gate = FULL_GATES[scope];
	const checks = [check('full', `FULL: ${gate}`, gate)];
	if (scope === 'tooling') {
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
	'build-api': 'no API file changed',
	'test-api': 'no API file changed',
	'test-scripts': 'no scripts-ts file changed',
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
	const removed = deleted.find((entry) => !DOCS.test(entry));
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
		if (text === '') {
			return 0;
		}
		return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
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

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const importerPattern = (file: string) =>
	`[/'"]${escapeRegExp(sourceStem(file))}(\\.(ts|tsx|js|jsx))?['"]`;

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

const summary = (plan: Plan): string =>
	plan.checks.map((entry) => entry.short).join(' + ') || 'nothing';

const describePlan = (plan: Plan, base: string): void => {
	const head =
		plan.mode === 'full'
			? `verify: FULL(${plan.scope}) — ${plan.reason}`
			: `verify: ${plan.changed.length} file(s) changed vs ${base}`;
	console.log(`${head}\nverify: ${summary(plan)}`);
};

const explain = (plan: Plan): void => {
	for (const skip of plan.skipped) {
		console.log(`verify: skipped ${skip.id}: ${skip.reason}`);
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
	const parsed = {
		base: DEFAULT_BASE,
		full: false,
		explain: false,
		selfTest: false,
	};
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === '--base') {
			index += 1;
			parsed.base = args[index] ?? DEFAULT_BASE;
		} else if (arg === '--full') {
			parsed.full = true;
		} else if (arg === '--explain') {
			parsed.explain = true;
		} else if (arg === '--self-test') {
			parsed.selfTest = true;
		} else {
			throw new Error(`unknown argument: ${arg}`);
		}
	}
	return parsed;
};

const SELF_TEST =
	'--filter scripts-ts exec vitest run src/verify-local.test.ts -t red/green';

const selfTest = (): number =>
	spawnSync('pnpm', argv(SELF_TEST), {
		cwd: repoRoot,
		stdio: 'inherit',
		env: { ...process.env, VERIFY_SELF_TEST: '1' },
	}).status ?? 1;

export const main = (args: readonly string[]): number => {
	const parsed = parseArgs(args);
	if (parsed.selfTest) {
		return selfTest();
	}
	const plan = buildPlan({
		...(parsed.full
			? { changed: [], deleted: [], sizedLines: 0 }
			: collectChanged(parsed.base)),
		full: parsed.full,
		deps: defaultDeps,
	});
	describePlan(plan, parsed.base);
	if (parsed.explain) {
		explain(plan);
	}
	if (plan.checks.length === 0) {
		console.log('verify: no changes — nothing to check');
		return 0;
	}
	for (const entry of plan.checks) {
		if (!runCheck(entry)) {
			return 1;
		}
	}
	console.log(`\nverify: OK (${summary(plan)})`);
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
