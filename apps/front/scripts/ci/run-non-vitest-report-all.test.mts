import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { test } from 'vitest';

import {
	NON_VITEST_COMMANDS,
	validateNonVitestManifest,
	runNonVitestReportAll,
} from './run-non-vitest-report-all.mts';

test('keeps the exact ordered 32-command manifest', () => {
	const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
	const packageJson = JSON.parse(
		readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
	) as { ciNonVitestCommandInventory: string[][] };
	const expected = packageJson.ciNonVitestCommandInventory.map((argv) => [
		argv[0] === 'pnpm' ? pnpm : argv[0],
		...argv.slice(1),
	]);
	assert.deepEqual(
		NON_VITEST_COMMANDS.map((command) => command.argv),
		expected,
	);
});

test('rejects a removed command from the report-all manifest', () => {
	assert.throws(
		() => validateNonVitestManifest(NON_VITEST_COMMANDS.slice(0, -1)),
		/exactly 32/,
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
	assert.equal(result.records.length, 32);
	assert.equal(calls.length, 32);
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
