import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
	NON_VITEST_COMMANDS,
	validateNonVitestManifest,
	runNonVitestReportAll,
} from './run-non-vitest-report-all.mts';

test('keeps the exact ordered 30-command manifest', () => {
	const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
	const expected = [
		[pnpm, 'check:guard-coverage'],
		[
			'node',
			'scripts/run-guarded.mts',
			'--test',
			'scripts/ci/compose-startup.test.mts',
		],
		[pnpm, 'test:e2e-compose-env'],
		[pnpm, 'test:route-tree-guard'],
		[pnpm, 'test:design-guards'],
		[pnpm, 'test:request-counter'],
		[pnpm, 'test:search-cancel-css'],
		[pnpm, 'test:context-chunk-isolation'],
		[pnpm, 'test:simplebar-upstream-css'],
		[pnpm, 'test:design-system-guard'],
		[pnpm, 'test:zindex-guard'],
		[pnpm, 'test:react-compiler-guard'],
		[pnpm, 'test:shared-ts-import-paths'],
		[pnpm, 'test:e2e-shared-constants-guard'],
		[pnpm, 'test:column-type-imports-guard'],
		[pnpm, 'test:server-static-imports-guard'],
		[pnpm, 'test:font-bundle'],
		[pnpm, 'test:shared-ts-node-resolution'],
		[pnpm, 'check:design-system'],
		[pnpm, 'check:zindex'],
		[pnpm, 'check:react-compiler'],
		[pnpm, 'check:shared-ts-import-paths'],
		[pnpm, 'check:shared-ts-node-resolution'],
		[pnpm, 'check:e2e-shared-constants'],
		[pnpm, 'test:typecheck-coverage-guard'],
		[pnpm, 'test:guard-coverage-guard'],
		[pnpm, 'check:column-type-imports'],
		[pnpm, 'check:server-static-imports'],
		[pnpm, 'test:runtime-env-startup'],
		[pnpm, 'test:front-runtime-image-guard'],
	];
	assert.deepEqual(
		NON_VITEST_COMMANDS.map((command) => command.argv),
		expected,
	);
});

test('rejects a removed command from the report-all manifest', () => {
	assert.throws(
		() => validateNonVitestManifest(NON_VITEST_COMMANDS.slice(0, -1)),
		/exactly 30/,
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
