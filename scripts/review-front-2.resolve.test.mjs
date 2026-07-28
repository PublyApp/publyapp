import assert from 'node:assert/strict';
import test from 'node:test';

import {
	BASE_PORT,
	ENVIRONMENT_GENERATION_MARKER,
	FRONTEND_ENV_KEYS,
	GH_AUTH_FAILURE,
	GH_NETWORK_FAILURE,
	buildFrontendEnvLines,
	buildFrontendHost,
	buildFrontendToken,
	generateFrontendUrl,
	choosePort,
	derivePreferredPort,
	generateFrontendTokenForTarget,
	getBranchPathByMap,
	getIssueBranchPattern,
	isGhAuthFailure,
	isGhMissingReference,
	parseAddressForFrontend,
	parseFrontendTokenFromPath,
	parseTrackedChangesFromStatus,
	parseWorktrees,
	resolveByNumber,
	resolveByPull,
	resolveFrontendToken,
	resolveInteractivePicker,
	resolvePrForIssueWorktree,
	resolveTarget,
	runGhJson,
	runPrsByHeadBranch,
} from './review-front-2.resolve.mjs';

const runResult = (status = 0, stdout = '', stderr = '') => ({
	status,
	stdout,
	stderr,
});

test('parseWorktrees parses porcelain output and detached HEAD worktrees', () => {
	const input = [
		'worktree /tmp/pr1000',
		'HEAD deadbeef',
		'branch refs/heads/fix/989-ui',
		'',
		'worktree /tmp/space name/path with spaces',
		'HEAD faceb00c',
		'',
		'worktree /tmp/issue-pr',
		'HEAD caffeined',
		'branch refs/heads/fix/1245-a',
	].join('\n');

	assert.deepEqual(parseWorktrees(input), [
		{ path: '/tmp/pr1000', head: 'deadbeef', branch: 'fix/989-ui' },
		{ path: '/tmp/space name/path with spaces', head: 'faceb00c', branch: null },
		{ path: '/tmp/issue-pr', head: 'caffeined', branch: 'fix/1245-a' },
	]);
});

test('parseTrackedChangesFromStatus slices file path at index 3 and keeps renames', () => {
	const status = [
		' M apps/front-2/src/routeTree.gen.ts',
		'R  apps/front-2/old.ts -> apps/front-2/new.ts',
	].join('\n');

	const changes = parseTrackedChangesFromStatus(status);
	assert.ok(changes.has('apps/front-2/src/routeTree.gen.ts'));
	assert.ok(changes.has('apps/front-2/old.ts -> apps/front-2/new.ts'));
});

for (const [branch, expected] of [
	['fix/989-ui', true],
	['fix/1989-ui', false],
	['1989-fix', false],
	['feature/989', true],
	['feature/18990', false],
]) {
	test(`issue branch pattern for ${branch}`, () => {
		assert.equal(getIssueBranchPattern(989).test(branch), expected);
	});
}

test('gh classifiers are pinned to message semantics', () => {
	assert.equal(
		isGhMissingReference('Could not resolve to a pull request with that number'),
		true,
	);
	assert.equal(isGhAuthFailure('not authenticated with github'), true);
	assert.equal(isGhMissingReference('network error'), false);
});

for (const scenario of [
	{
		name: 'runGhJson maps missing gh refs to null',
		status: 1,
		stderr: 'Could not find pull request with that number',
		expectsNull: true,
	},
	{
		name: 'runGhJson classifies auth failures',
		status: 1,
		stderr: 'You are not authenticated',
		expectedCode: GH_AUTH_FAILURE,
	},
	{
		name: 'runGhJson classifies network failures',
		status: 1,
		stderr: 'Network unreachable',
		expectedCode: GH_NETWORK_FAILURE,
	},
	{
		name: 'runGhJson maps empty success output to null',
		status: 0,
		stdout: '',
		expectsNull: true,
	},
	{
		name: 'runGhJson parses valid JSON',
		status: 0,
		stdout: '{"number":11,"title":"hello"}',
		expectsJson: { number: 11, title: 'hello' },
	},
	{
		name: 'runGhJson flags invalid JSON as network failures',
		status: 0,
		stdout: 'not-json',
		expectedCode: GH_NETWORK_FAILURE,
	},
]) {
	test(scenario.name, async () => {
		const argsSeen = [];
		const args = ['issue', 'view', '11', '--json', 'title'];
		const run = async (runArgs) => {
			argsSeen.push(...runArgs);
			return {
				status: scenario.status,
				stdout: scenario.stdout ?? '',
				stderr: scenario.stderr ?? '',
			};
		};

		if (scenario.expectedCode) {
			await assert.rejects(
				() => runGhJson(args, { runGh: run }),
				(error) => error.code === scenario.expectedCode,
			);
			assert.deepEqual(argsSeen, args);
			return;
		}

		const result = await runGhJson(args, { runGh: run });
		if (scenario.expectsNull) {
			assert.equal(result, null);
		}
		if (scenario.expectsJson) {
			assert.deepEqual(result, scenario.expectsJson);
		}
		assert.deepEqual(argsSeen, args);
	});
}

test('resolveByPull prefers branch over head OID fallback', () => {
	const worktrees = [
		{ path: '/tmp/renamed', head: 'renamed-head', branch: 'renamed-branch' },
		{ path: '/tmp/fork', head: 'fork-head', branch: 'other' },
	];

	assert.deepEqual(
		resolveByPull(
			{ headRefName: 'renamed-branch', headRefOid: 'fork-head' },
			worktrees,
		),
		{ path: '/tmp/renamed', head: 'renamed-head', branch: 'renamed-branch' },
	);
	assert.deepEqual(
		resolveByPull({ headRefName: 'none', headRefOid: 'fork-head' }, worktrees),
		{ path: '/tmp/fork', head: 'fork-head', branch: 'other' },
	);
});

for (const scenario of [
	{
		name: 'PR matched by branch',
		number: 991,
		worktrees: [{ path: '/tmp/991', branch: 'feature/991', head: 'h1' }],
		runPr: async () => ({
			number: 991,
			state: 'OPEN',
			headRefName: 'feature/991',
			headRefOid: 'h1',
		}),
		expectedKind: 'pr',
		expectedPath: '/tmp/991',
	},
	{
		name: 'PR unmatched after branch/head fallback',
		number: 992,
		worktrees: [{ path: '/tmp/other', branch: 'feature/x', head: 'renamed-head' }],
		runPr: async () => ({
			number: 992,
			state: 'CLOSED',
			headRefName: 'missing',
			headRefOid: 'no-match',
		}),
		expectedKind: 'pr-unmatched',
		expectedRequested: 992,
	},
	{
		name: 'Issue with one branch match',
		number: 993,
		worktrees: [{ path: '/tmp/issue', branch: 'fix/993-auth', head: 'h993' }],
		runPr: async () => null,
		runIssue: async () => ({ number: 993 }),
		expectedKind: 'issue',
		expectedPath: '/tmp/issue',
	},
	{
		name: 'Issue with multiple branch matches',
		number: 994,
		worktrees: [
			{ path: '/tmp/a', branch: 'fix/994-auth', head: 'h1' },
			{ path: '/tmp/b', branch: 'hotfix/994', head: 'h2' },
		],
		runPr: async () => null,
		runIssue: async () => ({ number: 994 }),
		expectedKind: 'issue-ambiguous',
	},
	{
		name: 'Issue with no branch match',
		number: 995,
		worktrees: [{ path: '/tmp/other', branch: 'feature/issue-only', head: 'h1' }],
		runPr: async () => null,
		runIssue: async () => ({ number: 995 }),
		expectedKind: 'not-found',
	},
	{
		name: 'No PR and no issue',
		number: 996,
		worktrees: [{ path: '/tmp/other', branch: 'feature/996', head: 'h1' }],
		runPr: async () => null,
		runIssue: async () => null,
		expectedKind: 'not-found',
	},
]) {
	test(`resolveByNumber: ${scenario.name}`, async () => {
		let prCalls = 0;
		let issueCalls = 0;

		const result = await resolveByNumber(scenario.number, scenario.worktrees, {
			runPrByNumber: async (requested) => {
				prCalls += 1;
				assert.equal(requested, scenario.number);
				return scenario.runPr(requested);
			},
			runIssueByNumber: scenario.runIssue
				? async (requested) => {
					issueCalls += 1;
					assert.equal(requested, scenario.number);
					return scenario.runIssue(requested);
				}
				: undefined,
		});

		assert.equal(prCalls, 1);
		if (scenario.expectedKind === 'pr' || scenario.expectedKind === 'pr-unmatched') {
			assert.equal(issueCalls, 0);
		} else {
			assert.equal(issueCalls, 1);
		}
		assert.equal(result.kind, scenario.expectedKind);
		if (scenario.expectedPath) {
			assert.equal(result.worktree?.path, scenario.expectedPath);
		}
		if (scenario.expectedKind === 'pr-unmatched') {
			assert.equal(result.requested, scenario.expectedRequested);
		}
		if (scenario.expectedKind === 'issue-ambiguous') {
			assert.equal(result.worktrees.length, 2);
		}
	});
}

test('resolveByNumber gives PR precedence over issue when both can match', async () => {
	const result = await resolveByNumber(994, [
		{ path: '/tmp/issue', branch: 'fix/994', head: 'h' },
	], {
		runPrByNumber: async () => ({
			number: 994,
			headRefName: 'feature/issue-994',
			headRefOid: 'h',
			state: 'OPEN',
		}),
		runIssueByNumber: async () => ({ number: 994 }),
	});

	assert.equal(result.kind, 'pr');
	assert.equal(result.source.number, 994);
});

test('resolvePrForIssueWorktree passes worktree object and favors open PR', async () => {
	const worktree = { path: '/tmp/issue', branch: 'feature/issue-901', head: 'x' };
	let observed = null;
	const result = await resolvePrForIssueWorktree(worktree, {
		runPrsByHeadBranch: async (value) => {
			observed = value;
			return [
				{ number: 555, state: 'CLOSED', headRefName: 'feature/issue-901' },
				{ number: 1010, state: 'OPEN', headRefName: 'feature/issue-901' },
			];
		},
	});

	assert.equal(observed, worktree);
	assert.equal(result?.number, 1010);
});

test('runPrsByHeadBranch builds gh args from worktree branch', async () => {
	let capturedArgs = [];
	await runPrsByHeadBranch(
		{ path: '/tmp/issue', branch: 'feature/xyz' },
		{
			runGh: async (args) => {
				capturedArgs = args;
				return runResult(0, '[]', '');
			},
		},
	);

	assert.equal(capturedArgs[0], 'pr');
	assert.equal(capturedArgs.includes('--head'), true);
	assert.equal(capturedArgs[capturedArgs.length - 1], 'feature/xyz');
});

for (const scenario of [
	{
		name: 'Issue token resolves from gh PR even when path token differs',
		resolved: {
			kind: 'issue',
			worktree: {
				path: '/tmp/pr994',
				branch: 'feature/issue-994',
				head: 'x',
			},
		},
		resolvePrByBranch: async () => ({ number: 1010, state: 'OPEN' }),
		expected: 'pr1010',
	},
	{
		name: 'Issue token falls back to path when issue PR cannot be resolved',
		resolved: {
			kind: 'issue',
			worktree: {
				path: '/tmp/pr994',
				branch: 'feature/issue-994',
				head: 'x',
			},
		},
		resolvePrByBranch: async () => ({ state: 'CLOSED' }),
		expected: 'pr994',
	},
	{
		name: 'Issue token cannot be derived when neither branch PR nor path token exists',
		resolved: { kind: 'issue', worktree: { path: '/tmp/feature', branch: null } },
		resolvePrByBranch: async () => ({ state: 'CLOSED' }),
		expected: null,
	},
	{
		name: 'PR kind is direct',
		resolved: { kind: 'pr', source: { number: 123 } },
		expected: 'pr123',
	},
]) {
	test(`resolveFrontendToken: ${scenario.name}`, async () => {
		const token = await resolveFrontendToken(scenario.resolved, {
			resolvePrByBranch: scenario.resolvePrByBranch,
		});
		assert.equal(token, scenario.expected);

		if (scenario.expected === null) {
			await assert.rejects(
				() => generateFrontendTokenForTarget(scenario.resolved),
				/Could not derive a PR token from/,
			);
		}
	});
}

test('resolveInteractivePicker sends selected PR number to injected resolve', async () => {
	const byBranch = getBranchPathByMap([
		{ path: '/tmp/pr900', branch: 'feature/900', head: 'h900' },
		{ path: '/tmp/pr901', branch: 'feature/901', head: 'h901' },
	]);
	let selectedNumber = null;

	const selected = await resolveInteractivePicker(
		[
			{ path: '/tmp/pr900', branch: 'feature/900', head: 'h900' },
			{ path: '/tmp/pr901', branch: 'feature/901', head: 'h901' },
		],
		byBranch,
		{
			runOpenPrs: async () => [
				{ number: 900, title: 'First', headRefName: 'feature/900' },
				{ number: 901, title: 'Second', headRefName: 'feature/901' },
			],
			askChoice: async () => 1,
			runByNumber: async (number) => {
				selectedNumber = number;
				return { kind: 'picked', number };
			},
		},
	);

	assert.equal(selectedNumber, 901);
	assert.deepEqual(selected, { kind: 'picked', number: 901 });
});

test('resolveTarget has no module-scope state and validates runtime input', async () => {
	await assert.rejects(
		() =>
			resolveTarget([], null, {
				hasInteractiveTerminal: false,
				requestedRef: '',
			}),
		/No PR\/issue ref provided in a non-interactive terminal\./,
	);

	const picked = await resolveTarget([], null, {
		hasInteractiveTerminal: true,
		requestedRef: '',
		resolveInteractivePicker: async () => ({ kind: 'picked', source: { number: 7 } }),
	});
	assert.deepEqual(picked, { kind: 'picked', source: { number: 7 } });

	await assert.rejects(
		() =>
			resolveTarget([], null, {
				hasInteractiveTerminal: true,
				requestedRef: 'issue-abc',
			}),
		/Expected a PR or issue number, got issue-abc\./,
	);

	const pickedByNumber = await resolveTarget([
		{ path: '/tmp/target', branch: 'branch', head: 'oid' },
	], null, {
		requestedRef: '123',
		hasInteractiveTerminal: true,
		runPrByNumber: async (number) => ({
			number,
			state: 'OPEN',
			headRefName: 'branch',
			headRefOid: 'oid',
		}),
	});
	assert.equal(pickedByNumber.kind, 'pr');
	assert.equal(pickedByNumber.source.number, 123);
	assert.equal(pickedByNumber.worktree?.path, '/tmp/target');
});

for (const scenario of [
	{
		name: 'choosePort uses preferred candidate and skips busy one',
		number: 0,
		probe: (candidate) => candidate !== 5001,
		expected: 5002,
	},
	{
		name: 'choosePort advances forward while preserving reserved ports',
		number: 1,
		probe: (candidate) => candidate !== 5001,
		expected: 5002,
	},
]) {
	test(scenario.name, async () => {
		const checks = [];
		const port = await choosePort(scenario.number, {
			host: '127.0.0.1',
			probePortAvailable: async (_host, candidate) => {
				checks.push(candidate);
				return scenario.probe(candidate);
			},
		});

		assert.equal(port, scenario.expected);
		assert.equal(checks[0], derivePreferredPort(scenario.number));
		assert.equal(checks[1], scenario.expected);
	});
}

test('parseAddressForFrontend targets single-address lookup result', async () => {
	const seenOptions = [];
	const resolved = await parseAddressForFrontend('pr994.localhost', {
		dnsLookup: async (_host, options) => {
			seenOptions.push(options);
			return { address: '::1', family: 6 };
		},
	});

	assert.equal(resolved.address, '::1');
	assert.equal(resolved.family, 6);
	assert.deepEqual(seenOptions, [{ all: false }]);
});

for (const scenario of [
	{
		name: 'posthog token included when present',
		posthog: '  token-123  ',
		count: 5,
		posthogExpected: 'token-123',
	},
	{
		name: 'posthog token dropped when blank',
		posthog: '   ',
		count: 4,
		posthogExpected: null,
	},
	{
		name: 'posthog token dropped when missing',
		posthog: undefined,
		count: 4,
		posthogExpected: null,
	},
]) {
	test(scenario.name, () => {
		const lines = buildFrontendEnvLines({
			frontendToken: 'pr994',
			frontendPort: 5994,
			publicValues: {
				PUBLIC_POSTHOG_PROJECT_TOKEN: scenario.posthog,
				IGNORED: 'ignore',
			},
		});

		assert.equal(lines[0], ENVIRONMENT_GENERATION_MARKER);
		const values = new Map(
			lines
				.slice(1)
				.map((line) => {
					const [key, value = ''] = line.split('=', 2);
					return [key, value];
				}),
		);

		assert.equal(values.size, scenario.count);
		assert.equal(values.get('FRONT_URL'), 'http://pr994.localhost:5994');
		assert.equal(values.get('PUBLIC_API_BASE_URL'), 'http://localhost:5000');
		assert.equal(values.get('SERVER_API_BASE_URL'), 'http://localhost:5000');
		assert.equal(values.get('VITE_ASP_SERVER_URL'), 'http://localhost:5000');

		for (const [key, value] of values) {
			assert.ok(FRONTEND_ENV_KEYS.includes(key));
			assert.equal(value.includes('undefined'), false);
		}

		if (scenario.posthogExpected === null) {
			assert.equal(values.has('PUBLIC_POSTHOG_PROJECT_TOKEN'), false);
		} else {
			assert.equal(values.get('PUBLIC_POSTHOG_PROJECT_TOKEN'), scenario.posthogExpected);
		}
	});
}

test('frontend host/url helpers are deterministic', () => {
	for (const value of [1, 10, 500, 999]) {
		assert.equal(buildFrontendToken(value), `pr${value}`);
		assert.equal(buildFrontendHost(`pr${value}`), `pr${value}.localhost`);
		assert.equal(generateFrontendUrl(`pr${value}`, BASE_PORT), `http://pr${value}.localhost:${BASE_PORT}`);
	}
});

test('parseFrontendTokenFromPath reads only basename token', () => {
	assert.equal(parseFrontendTokenFromPath('/tmp/.worktrees/pr994'), 'pr994');
	assert.equal(parseFrontendTokenFromPath('C:/tmp/pr995'), 'pr995');
	assert.equal(parseFrontendTokenFromPath('/tmp/issue-995'), null);
});
