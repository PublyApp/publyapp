import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import { LANE_PATTERNS } from './ci-changed-paths.ts';
import {
	DIFF_LIMITS,
	FULL_TRIGGERS,
	buildPlan,
	collectChanged,
	defaultDeps,
	isFrontTest,
	repoRoot,
	selectTests,
} from './verify-local.ts';

// §4.5-A: the selector table. These are the standing proof that a diff maps
// to the plan it claims, that shared inputs fail closed, and that CI and
// local cannot drift apart (every FULL_TRIGGERS entry is either covered by
// the CI lane patterns or explicitly local-only).

const ids = (plan: ReturnType<typeof buildPlan>) =>
	plan.checks.map((check) => check.id);

const git = (cwd: string, args: string[]) => {
	const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
	assert.equal(result.status, 0, result.stderr);
	return result.stdout;
};

const commitAll = (cwd: string, message: string) => {
	git(cwd, ['add', '-A']);
	git(cwd, [
		'-c',
		'user.name=verify-local',
		'-c',
		'user.email=verify-local@example.invalid',
		'commit',
		'-q',
		'-m',
		message,
	]);
};

test('one front file -> format/lint/tsc/depth-1/ratchet + CI front guards', () => {
	const plan = buildPlan({
		changed: ['apps/front/src/components/ui/avatar.tsx'],
	});
	assert.equal(plan.mode, 'subset');
	for (const id of [
		'format',
		'lint',
		'tsc-front',
		'vitest-front-related',
		'ratchet',
	]) {
		assert.ok(ids(plan).includes(id), `missing ${id}: ${ids(plan).join(',')}`);
	}
	const commands = plan.checks.map((check) => check.command.join(' '));
	for (const command of [
		'pnpm --filter front build',
		'pnpm --filter front check:design-system',
		'just react-doctor',
		'pnpm exec knip',
	]) {
		assert.ok(commands.includes(command), `missing ${command}`);
	}
	assert.ok(!ids(plan).includes('build-api'));
});

test('one API module file -> build + that module filter, no front', () => {
	const plan = buildPlan({
		changed: ['apps/api/Modules/Posts/Handlers/CreatePost.cs'],
	});
	assert.equal(plan.mode, 'subset');
	assert.deepEqual(ids(plan).sort(), [
		'build-api',
		'ratchet',
		'spec-drift',
		'test-api',
	]);
	const buildApi = plan.checks.find((check) => check.id === 'build-api');
	assert.ok(
		buildApi?.command.includes('apps/api/Tests/PublyApp.Api.Tests.csproj'),
	);
	const testApi = plan.checks.find((check) => check.id === 'test-api');
	assert.ok(testApi?.command.includes('FullyQualifiedName~Modules.Posts'));
	assert.ok(testApi?.command.includes('--no-build'));
	assert.ok(!ids(plan).some((id) => id.startsWith('tsc-')));
});

test('API Lib change -> full API suite, still no front set', () => {
	const plan = buildPlan({ changed: ['apps/api/Lib/AppEnvironment.cs'] });
	assert.equal(plan.mode, 'full');
	assert.equal(plan.scope, 'api');
	const gate = plan.checks.find((check) => check.id === 'full');
	assert.ok(gate);
	assert.deepEqual(gate.command, ['just', 'test-api']);
	const commands = plan.checks.map((check) => check.command.join(' '));
	assert.ok(commands.includes('just ci-spec-drift'));
	assert.ok(commands.includes('just ci-migration-expand-contract'));
	assert.ok(!ids(plan).includes('tsc-front'));
});

test('FULL(tooling) runs the CI quality lane, not only the scripts suite', () => {
	const plan = buildPlan({ changed: ['packages/scripts-ts/src/foo.ts'] });
	assert.equal(plan.mode, 'full');
	assert.equal(plan.scope, 'tooling');
	const commands = plan.checks.map((check) => check.command.join(' '));
	for (const command of ['pnpm format', 'pnpm lint', 'pnpm exec knip']) {
		assert.ok(commands.includes(command), `missing ${command}`);
	}
	assert.ok(commands.includes('pnpm --filter scripts-ts exec vitest run'));
});

test('FULL(front) includes the front lint lane CI runs', () => {
	const plan = buildPlan({ changed: ['packages/shared-ts/src/lib/errors.ts'] });
	assert.equal(plan.mode, 'full');
	assert.equal(plan.scope, 'front');
	const commands = plan.checks.map((check) => check.command.join(' '));
	assert.ok(commands.includes('pnpm format'), commands.join(' | '));
	assert.ok(
		commands.includes('node packages/scripts-ts/src/lint-front.ts --quiet'),
	);
	assert.ok(
		commands.includes(
			'node packages/scripts-ts/src/check-no-floating-promises.ts',
		),
	);
});

test('lockfile -> FULL(all) with a one-line reason', () => {
	const plan = buildPlan({ changed: ['pnpm-lock.yaml'] });
	assert.equal(plan.mode, 'full');
	assert.equal(plan.scope, 'all');
	assert.match(plan.reason ?? '', /deps: pnpm-lock\.yaml/);
	const gate = plan.checks.find((check) => check.id === 'full');
	assert.ok(gate);
	assert.deepEqual(gate.command, ['just', 'ci']);
});

test('docs only -> the CI docs lane, not one link check', () => {
	const plan = buildPlan({ changed: ['docs/guides/local-ci-gate.md'] });
	assert.equal(plan.mode, 'subset');
	assert.deepEqual(ids(plan), ['doc-links']);
	assert.deepEqual(plan.checks[0].command, ['just', 'ci-doc-links']);
});

test('deleted workflow fails closed even though CI files are in the docs lane', () => {
	const plan = buildPlan({
		changed: [],
		deleted: ['.github/workflows/deploy-images.yml'],
	});
	assert.equal(plan.mode, 'full');
	assert.match(plan.reason ?? '', /deleted or renamed path/);
});

test('e2e specs and proofs are not handed to the front Vitest project', () => {
	for (const changed of [
		'apps/front/e2e/smoke/foo.spec.ts',
		'apps/front/tests/proofs/1234/regression.test.ts',
	]) {
		const plan = buildPlan({ changed: [changed] });
		assert.equal(plan.mode, 'subset', changed);
		assert.ok(!ids(plan).includes('vitest-front'), changed);
		assert.ok(!ids(plan).includes('vitest-front-related'), changed);
	}
});

test('front CSS assets stay in the front lane instead of FULL(all)', () => {
	const plan = buildPlan({
		changed: ['apps/front/src/styles/app.css'],
	});
	assert.equal(plan.mode, 'subset');
	assert.ok(ids(plan).includes('tsc-front'));
});

test('FULL(front) and FULL(api) keep the judgement ratchet CI runs', () => {
	for (const [changed, scope] of [
		['packages/shared-ts/src/lib/errors.ts', 'front'],
		['apps/api/Lib/AppEnvironment.cs', 'api'],
	] as const) {
		const plan = buildPlan({ changed: [changed] });
		assert.equal(plan.mode, 'full');
		assert.equal(plan.scope, scope);
		assert.ok(ids(plan).includes('ratchet'), `${scope}: ${ids(plan)}`);
	}
});

test('CSS and JSON changes are handed to oxfmt, as CI does', () => {
	const css = 'apps/front/src/styles/app.css';
	const json = 'apps/front/src/lib/text-counter/text-counter-fixtures.json';
	const plan = buildPlan({ changed: [css, json] });
	const format = plan.checks.find((entry) => entry.id === 'format');
	assert.ok(format);
	assert.deepEqual(
		format.command.filter((part) => part === css || part === json),
		[json, css],
	);
	assert.ok(!ids(plan).includes('lint'));
});

test('design guards excluded from front Vitest get the non-vitest lane', () => {
	for (const changed of [
		'apps/front/src/lib/i18n/key-coverage.test.ts',
		'apps/front/src/lib/mutation-feedback/mutation-feedback-architecture.test.ts',
		'apps/front/src/lib/query/route-loader-query-key-guard.test.ts',
	]) {
		const plan = buildPlan({ changed: [changed] });
		assert.equal(plan.mode, 'subset', changed);
		assert.ok(!ids(plan).includes('vitest-front'), `${changed}: ${ids(plan)}`);
		const lane = plan.checks.find((entry) => entry.id === 'non-vitest');
		assert.ok(lane, `${changed}: ${ids(plan)}`);
		assert.deepEqual(lane.command, [
			'pnpm',
			'--filter',
			'front',
			'test:ci-non-vitest',
		]);
	}
});

test('node:test files under scripts/ci widen to the lane that runs them', () => {
	for (const changed of [
		'apps/front/scripts/ci/validate-runtime-env-startup.test.ts',
		'apps/front/scripts/ci/vitest-shard-coverage.test.ts',
		'apps/front/scripts/ci/__fixtures__/probe.test.ts',
	]) {
		const plan = buildPlan({ changed: [changed] });
		assert.equal(plan.mode, 'full', changed);
		assert.equal(plan.scope, 'front', changed);
		assert.ok(!ids(plan).includes('vitest-front'), `${changed}: ${ids(plan)}`);
	}
});

test('--explain can say why the related fallback was skipped', () => {
	const plan = buildPlan({
		changed: ['apps/front/src/components/ui/avatar.test.tsx'],
	});
	const skipped = plan.skipped.map((entry) => entry.id);
	assert.ok(skipped.includes('vitest-front-related'));
});

test('unknown extension -> FULL(all) naming the path', () => {
	const plan = buildPlan({ changed: ['mystery/blob.xyz'] });
	assert.equal(plan.mode, 'full');
	assert.equal(plan.scope, 'all');
	assert.match(plan.reason ?? '', /unknown path: mystery\/blob\.xyz/);
});

test('51 files -> FULL(all) by the shape rule', () => {
	const changed = Array.from(
		{ length: DIFF_LIMITS.maxFiles + 1 },
		(_, index) => `apps/front/src/lib/probe-${index}.ts`,
	);
	const plan = buildPlan({ changed });
	assert.equal(plan.mode, 'full');
	assert.match(plan.reason ?? '', /> 50/);
});

test('sized line budget exceeded -> FULL(all)', () => {
	const plan = buildPlan({
		changed: ['apps/front/src/components/ui/avatar.tsx'],
		sizedLines: DIFF_LIMITS.maxSizedLines + 1,
	});
	assert.equal(plan.mode, 'full');
	assert.match(plan.reason ?? '', /non-test changed lines > 600/);
});

test('shared component with 41 direct test importers -> full front vitest', () => {
	const importers = Array.from(
		{ length: 41 },
		(_, index) => `apps/front/src/routes/probe-${index}.test.tsx`,
	);
	const plan = buildPlan({
		changed: ['apps/front/src/components/ui/probe.tsx'],
		deps: { findImporters: () => importers, listDir: () => [] },
	});
	assert.equal(plan.mode, 'subset');
	const vitest = plan.checks.find((check) => check.id === 'vitest-front');
	assert.ok(vitest, ids(plan).join(','));
	assert.match(vitest.short, /> 40/);
	assert.deepEqual(vitest.command.slice(-1), ['run']);
});

test('deleted file -> FULL(all)', () => {
	const plan = buildPlan({
		changed: [],
		deleted: ['apps/front/src/components/ui/avatar.tsx'],
	});
	assert.equal(plan.mode, 'full');
	assert.match(plan.reason ?? '', /deleted or renamed path/);
});

test('rename -> FULL(all); plan is deterministic and sorted', () => {
	const input = {
		changed: [
			'apps/api/Modules/Posts/Handlers/CreatePost.cs',
			'apps/front/src/components/ui/avatar.tsx',
		],
		deleted: ['apps/front/src/components/ui/old-avatar.tsx'],
	};
	const plan = buildPlan(input);
	assert.equal(plan.mode, 'full');
	assert.deepEqual(plan.changed, [...plan.changed].sort());
	const again = buildPlan({
		changed: [...input.changed].reverse(),
		deleted: input.deleted,
	});
	assert.deepEqual(again, plan);
});

test('deleted docs stay in the docs lane', () => {
	const plan = buildPlan({
		changed: [],
		deleted: ['docs/guides/obsolete.md'],
	});
	assert.equal(plan.mode, 'subset');
	assert.deepEqual(ids(plan), ['doc-links']);
});

test('a source with no co-located test resolves through git grep importers', () => {
	const source = 'apps/front/src/lib/testing/suppression-reason.ts';
	const importer =
		'apps/front/src/routes/authed/staff/no-fabricated-placeholder.test.ts';
	assert.ok(defaultDeps.findImporters(source).includes(importer));
	const selection = selectTests([source], [], defaultDeps, isFrontTest);
	assert.deepEqual(selection.tests, [importer]);
	assert.deepEqual(selection.related, []);
});

test('modified, renamed and untracked paths are all collected', () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-local-git-'));
	try {
		fs.writeFileSync(path.join(cwd, 'a.ts'), 'export const a = 1;\n');
		fs.writeFileSync(path.join(cwd, 'b.ts'), 'export const b = 1;\n');
		git(cwd, ['init', '-q']);
		commitAll(cwd, 'initial');
		fs.writeFileSync(path.join(cwd, 'a.ts'), 'export const a = 2;\n');
		fs.writeFileSync(path.join(cwd, 'c.ts'), 'export const c = 1;\n');
		git(cwd, ['mv', 'b.ts', 'd.ts']);
		const collected = collectChanged('HEAD', cwd);
		assert.deepEqual([...collected.changed].sort(), ['a.ts', 'c.ts', 'd.ts']);
		assert.deepEqual(collected.deleted, ['b.ts']);
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

test('every FULL_TRIGGERS entry is covered by LANE_PATTERNS or local-only', () => {
	for (const trigger of FULL_TRIGGERS) {
		assert.match(trigger.example, trigger.pattern, trigger.id);
		const covered = Object.values(LANE_PATTERNS).some((pattern) =>
			new RegExp(pattern).test(trigger.example),
		);
		assert.ok(
			covered || trigger.localOnly === true,
			`${trigger.id} (${trigger.example}) is neither lane-covered nor local-only`,
		);
	}
});

// §4.5-B: the red/green proof harness. It runs from a scratch worktree of
// the current commit, one intentional break at a time, and never commits.
// Skipped in ordinary suite runs; enable it with VERIFY_SELF_TEST=1 and
// `pnpm --filter scripts-ts exec vitest run src/verify-local.test.ts -t red/green`.

interface SelfTestCase {
	name: string;
	expect: string;
	setup?: (tree: string) => void;
	planOnly?: readonly string[];
}

const appendTo = (file: string, text: string) => (tree: string) => {
	fs.appendFileSync(path.join(tree, file), `\n${text}\n`);
};

const replaceIn =
	(file: string, from: string, to: string) => (tree: string) => {
		const target = path.join(tree, file);
		const before = fs.readFileSync(target, 'utf8');
		assert.ok(before.includes(from), `self-test: ${from} not found in ${file}`);
		fs.writeFileSync(target, before.replace(from, to));
	};

const SELF_TEST_CASES: readonly SelfTestCase[] = [
	{
		name: 'type error in the changed .tsx',
		expect: 'FAILED tsc-front',
		setup: appendTo(
			'apps/front/src/components/ui/avatar.tsx',
			"export const verifyProbe: number = Math.max('x');",
		),
	},
	{
		name: 'lint error (debugger) in the changed file',
		expect: 'FAILED lint',
		setup: appendTo('apps/front/src/components/ui/avatar.tsx', 'debugger;'),
	},
	{
		name: 'format drift in the changed file',
		expect: 'FAILED format',
		setup: appendTo(
			'apps/front/src/components/ui/avatar.tsx',
			'export const verifyProbe = [1,2].map((x)=>{return x+1})',
		),
	},
	{
		name: 'failing co-located test',
		expect: 'FAILED vitest-front',
		setup: appendTo(
			'apps/front/src/components/ui/avatar.test.tsx',
			`test('verify probe', () => {
	expect(1).toBe(2);
});`,
		),
	},
	{
		name: 'failing direct-importer test',
		expect: 'FAILED vitest-front',
		setup: appendTo(
			'apps/front/src/lib/testing/suppression-reason.ts',
			"throw new Error('verify probe');",
		),
	},
	{
		name: 'shared helper (>40 importers) widens to full front',
		expect: 'FAILED vitest-front',
		setup: appendTo(
			'apps/front/src/components/ui/button.tsx',
			"throw new Error('verify probe');",
		),
	},
	{
		name: 'failing API spec in the changed module',
		expect: 'FAILED test-api',
		setup: replaceIn(
			'apps/api/Modules/Health/Health.Spec.cs',
			'.Be(HttpStatusCode.OK);',
			'.Be(HttpStatusCode.InternalServerError);',
		),
	},
	{
		name: 'judged file -> ratchet is in the plan',
		expect: 'ratchet',
		planOnly: ['apps/front/src/lib/utils.ts'],
	},
	{
		name: 'lockfile -> FULL',
		expect: 'FULL(all)',
		planOnly: ['pnpm-lock.yaml'],
	},
	{
		name: 'ci.yml / Directory.Build.props -> FULL',
		expect: 'FULL(all)',
		planOnly: ['.github/workflows/ci.yml', 'Directory.Build.props'],
	},
	{ name: 'no changes', expect: 'no changes' },
];

const runIn = (
	program: string,
	args: readonly string[],
	cwd: string,
	timeout = 900_000,
) =>
	spawnSync(program, args, {
		cwd,
		encoding: 'utf8',
		timeout,
		maxBuffer: 64 * 1024 * 1024,
	});

// Share the clone's installed dependencies instead of paying a second
// 1.3 GB install inside /tmp. Sources still come from the scratch worktree;
// only node_modules (read-only to this harness) is borrowed.
const linkScratchDeps = (root: string, tree: string): string | null => {
	const workspaces = [
		'',
		'apps/front',
		'apps/mobile',
		...fs
			.readdirSync(path.join(root, 'packages'))
			.map((name) => `packages/${name}`),
	];
	for (const workspace of workspaces) {
		const source = path.join(root, workspace, 'node_modules');
		const target = path.join(tree, workspace, 'node_modules');
		if (!fs.existsSync(source)) {
			continue;
		}
		try {
			fs.symlinkSync(source, target, 'dir');
		} catch (error) {
			return `cannot link ${target}:\n${String(error)}`;
		}
	}
	// dotnet --no-restore needs each project's obj/ assets in the scratch tree.
	for (const project of git(root, ['ls-files', '*.csproj'])
		.split('\n')
		.filter(Boolean)) {
		for (const artifact of ['obj', 'bin', '.artifacts']) {
			const source = path.join(root, path.dirname(project), artifact);
			if (fs.existsSync(source)) {
				fs.symlinkSync(
					source,
					path.join(tree, path.dirname(project), artifact),
					'dir',
				);
			}
		}
	}
	return null;
};

const planOutcome = (paths: readonly string[]): string => {
	const plan = buildPlan({ changed: paths });
	const ratchet = plan.checks.some((entry) => entry.id === 'ratchet');
	const mode = plan.mode === 'full' ? 'FULL' : 'subset';
	return `${mode}${plan.scope ? `(${plan.scope})` : ''} ${plan.checks.length} checks ${ratchet ? 'ratchet' : ''}`;
};

interface Observed {
	ok: boolean;
	observed: string;
}

const observe = (testCase: SelfTestCase, tree: string): Observed => {
	if (testCase.planOnly) {
		const observed = planOutcome(testCase.planOnly);
		return { ok: observed.includes(testCase.expect), observed };
	}
	testCase.setup?.(tree);
	const started = Date.now();
	const result = runIn(
		process.execPath,
		[
			path.join(tree, 'packages/scripts-ts/src/verify-local.ts'),
			'--base',
			'HEAD',
		],
		tree,
	);
	const output = `${result.stdout}${result.stderr}`;
	const failed = output.match(/verify: FAILED (\S+)/)?.[1];
	const observed =
		`exit ${result.status}, ${failed ? `FAILED ${failed}` : 'no failure'}` +
		` (${((Date.now() - started) / 1000).toFixed(1)}s)`;
	return { ok: output.includes(testCase.expect), observed };
};

const runSelfTest = (root: string): boolean => {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'publyapp-verify-'));
	const tree = path.join(temp, 'tree');
	const added = runIn(
		'git',
		['worktree', 'add', '--detach', tree, 'HEAD'],
		root,
	);
	if (added.status !== 0) {
		console.error(
			`self-test: cannot create scratch worktree:\n${added.stderr}`,
		);
		return false;
	}
	const rows: string[] = [];
	let ok = true;
	try {
		fs.copyFileSync(
			path.join(root, '.env.example'),
			path.join(tree, '.env.development'),
		);
		const linkError = linkScratchDeps(root, tree);
		if (linkError) {
			console.error(linkError);
			return false;
		}
		for (const testCase of SELF_TEST_CASES) {
			const outcome = observe(testCase, tree);
			ok &&= outcome.ok;
			rows.push(
				`| ${testCase.name} | ${testCase.expect} | ${outcome.observed} | ${outcome.ok ? 'PASS' : 'FAIL'} |`,
			);
			if (!testCase.planOnly) {
				runIn('git', ['checkout', '--', '.'], tree);
			}
		}
	} finally {
		runIn('git', ['worktree', 'remove', '--force', tree], root);
		fs.rmSync(temp, { recursive: true, force: true });
	}
	const table = [
		'| case | expected | observed | |',
		'|---|---|---|---|',
		...rows,
	].join('\n');
	console.log(`\n${table}`);
	fs.writeFileSync(
		process.env.VERIFY_SELF_TEST_OUT ??
			path.join(os.tmpdir(), 'verify-self-test.md'),
		`${table}\n`,
	);
	return ok;
};

test.skipIf(process.env.VERIFY_SELF_TEST !== '1')(
	'red/green self-test replays every selector lane',
	{ timeout: 40 * 60_000 },
	() => {
		assert.ok(runSelfTest(repoRoot));
	},
);
