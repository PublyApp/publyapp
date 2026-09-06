import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
	NON_VITEST_COMMANDS,
	runNonVitestReportAll,
} from './run-non-vitest-report-all.mts';

test('keeps the exact ordered 30-command manifest', () => {
	assert.equal(NON_VITEST_COMMANDS.length, 30);
	assert.deepEqual(
		NON_VITEST_COMMANDS.map((command) => command.id),
		Array.from({ length: 30 }, (_, index) => index + 1),
	);
	assert.equal(
		NON_VITEST_COMMANDS[0].argv.join(' '),
		'pnpm check:guard-coverage',
	);
	assert.equal(
		NON_VITEST_COMMANDS.at(-1)?.argv.join(' '),
		'pnpm test:front-runtime-image-guard',
	);
});

test('reports every command after the first command fails', async () => {
	const calls: string[][] = [];
	const result = await runNonVitestReportAll({
		cwd: '/fixture/apps/front',
		outputPath: null,
		spawn: async (argv) => {
			calls.push(argv);
			if (argv.includes('check:guard-coverage')) {
				return { execution: 'executed', outcome: 'failure', exit_code: 7 };
			}
			return { execution: 'executed', outcome: 'success', exit_code: 0 };
		},
	});

	assert.equal(result.exit_code, 1);
	assert.equal(result.records.length, 30);
	assert.equal(calls.length, 30);
	assert.equal(result.records[0].exit_code, 7);
	assert.equal(result.records[1].outcome, 'success');
});

test('preserves signal diagnostics in the nested report', async () => {
	const result = await runNonVitestReportAll({
		cwd: '/fixture/apps/front',
		outputPath: null,
		spawn: async (argv) =>
			argv.includes('test:e2e-compose-env')
				? { execution: 'executed', outcome: 'cancelled', signal: 'SIGTERM' }
				: { execution: 'executed', outcome: 'success', exit_code: 0 },
	});

	assert.equal(result.exit_code, 1);
	assert.equal(result.records[2].signal, 'SIGTERM');
});
