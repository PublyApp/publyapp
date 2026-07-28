import assert from 'node:assert/strict';
import test from 'node:test';

import {
	GH_AUTH_FAILURE,
	GH_INVOCATION_FAILURE,
	GH_NETWORK_FAILURE,
	getBranchPathByMap,
	getIssueBranchPattern,
	isGhAuthFailure,
	isGhMissingReference,
	parseTrackedChangesFromStatus,
	parseWorktrees,
	resolveByNumber,
	resolveInteractivePicker,
	resolveTarget,
	runGhJson,
	runIssueByNumber,
	runPrByNumber,
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
		{
			path: '/tmp/space name/path with spaces',
			head: 'faceb00c',
			branch: null,
		},
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
	['fix/9891-x', false],
]) {
	test(`issue branch pattern for ${branch}`, () => {
		assert.equal(getIssueBranchPattern(989).test(branch), expected);
	});
}

test('getBranchPathByMap keys the map by branch name, not by path', () => {
	const map = getBranchPathByMap([
		{ path: '/tmp/pr900', branch: 'feature/900', head: 'h900' },
	]);

	assert.equal(map.get('feature/900'), '/tmp/pr900');
	assert.equal(map.has('/tmp/pr900'), false);
});

test('gh classifiers are pinned to message semantics', () => {
	assert.equal(
		isGhMissingReference(
			'Could not resolve to a pull request with that number',
		),
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

test('runGhJson rejects rather than collapsing an empty non-zero gh result into "not found"', async () => {
	await assert.rejects(
		() =>
			runGhJson(['issue', 'view', '11', '--json', 'title'], {
				runGh: async () => runResult(1, '', ''),
			}),
		(error) => error.code === GH_INVOCATION_FAILURE,
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
		worktrees: [
			{ path: '/tmp/other', branch: 'feature/x', head: 'renamed-head' },
		],
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
		name: 'Issue never matches via a detached worktree path, only via branch',
		number: 994,
		worktrees: [{ path: '/x/.worktrees/994', branch: null, head: 'h994' }],
		runPr: async () => null,
		runIssue: async () => ({ number: 994 }),
		expectedKind: 'not-found',
	},
	{
		name: 'Issue with no branch match',
		number: 995,
		worktrees: [
			{ path: '/tmp/other', branch: 'feature/issue-only', head: 'h1' },
		],
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
		if (
			scenario.expectedKind === 'pr' ||
			scenario.expectedKind === 'pr-unmatched'
		) {
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
			assert.equal(result.requested, scenario.number);
		}
		if (scenario.expectedKind === 'not-found') {
			assert.equal(result.requested, scenario.number);
		}
	});
}

test('resolveByNumber gives PR precedence over issue when both can match', async () => {
	const result = await resolveByNumber(
		994,
		[{ path: '/tmp/issue', branch: 'fix/994', head: 'h' }],
		{
			runPrByNumber: async () => ({
				number: 994,
				headRefName: 'feature/issue-994',
				headRefOid: 'h',
				state: 'OPEN',
			}),
			runIssueByNumber: async () => ({ number: 994 }),
		},
	);

	assert.equal(result.kind, 'pr');
	assert.equal(result.source.number, 994);
	assert.equal(result.worktree?.path, '/tmp/issue');
});

test('runPrByNumber uses expected gh CLI args', async () => {
	let capturedArgs = [];
	await runPrByNumber(901, {
		runGh: async (args) => {
			capturedArgs = args;
			return runResult(0, '{"number":901,"state":"OPEN"}', '');
		},
	});

	assert.equal(capturedArgs[0], 'pr');
	assert.equal(capturedArgs[1], 'view');
	assert.equal(capturedArgs[2], '901');
	assert.deepEqual(capturedArgs.slice(3), [
		'--json',
		'number,state,title,headRefName,headRefOid',
	]);
});

test('runIssueByNumber uses expected gh CLI args', async () => {
	let capturedArgs = [];
	await runIssueByNumber(901, {
		runGh: async (args) => {
			capturedArgs = args;
			return runResult(0, '{"number":901}', '');
		},
	});

	assert.equal(capturedArgs[0], 'issue');
	assert.equal(capturedArgs[1], 'view');
	assert.equal(capturedArgs[2], '901');
	assert.deepEqual(capturedArgs.slice(3), ['--json', 'title,number']);
});

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

test('resolveInteractivePicker rows use byBranch to resolve each PR path', async () => {
	const byBranch = getBranchPathByMap([
		{ path: '/tmp/pr900', branch: 'feature/900', head: 'h900' },
	]);
	let seenLines = null;

	await resolveInteractivePicker(
		[{ path: '/tmp/pr900', branch: 'feature/900', head: 'h900' }],
		byBranch,
		{
			runOpenPrs: async () => [
				{ number: 900, title: 'First', headRefName: 'feature/900' },
				{ number: 901, title: 'Second', headRefName: 'feature/901' },
			],
			askChoice: async (title, lines) => {
				seenLines = lines;
				return 0;
			},
			runByNumber: async (number) => ({ kind: 'picked', number }),
		},
	);

	assert.equal(seenLines[0], '#900 | feature/900 | /tmp/pr900 | First');
	assert.equal(seenLines[1], '#901 | feature/901 | none | Second');
});

test('resolveInteractivePicker sorts PRs with a worktree ahead of PRs without one', async () => {
	const byBranch = getBranchPathByMap([
		{ path: '/tmp/pr901', branch: 'feature/901', head: 'h901' },
	]);
	let seenLines = null;

	await resolveInteractivePicker(
		[{ path: '/tmp/pr901', branch: 'feature/901', head: 'h901' }],
		byBranch,
		{
			runOpenPrs: async () => [
				{ number: 900, title: 'NoWorktree', headRefName: 'feature/900' },
				{ number: 901, title: 'HasWorktree', headRefName: 'feature/901' },
			],
			askChoice: async (title, lines) => {
				seenLines = lines;
				return 0;
			},
			runByNumber: async (number) => ({ kind: 'picked', number }),
		},
	);

	assert.equal(seenLines[0].startsWith('#901'), true);
	assert.equal(seenLines[1].startsWith('#900'), true);
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
		resolveInteractivePicker: async () => ({
			kind: 'picked',
			source: { number: 7 },
		}),
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

	const pickedByNumber = await resolveTarget(
		[{ path: '/tmp/target', branch: 'branch', head: 'oid' }],
		null,
		{
			requestedRef: '123',
			hasInteractiveTerminal: true,
			runPrByNumber: async (number) => ({
				number,
				state: 'OPEN',
				headRefName: 'branch',
				headRefOid: 'oid',
			}),
		},
	);
	assert.equal(pickedByNumber.kind, 'pr');
	assert.equal(pickedByNumber.source.number, 123);
	assert.equal(pickedByNumber.worktree?.path, '/tmp/target');
});
