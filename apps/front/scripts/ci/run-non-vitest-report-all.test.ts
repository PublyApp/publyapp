import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import {
	isIsolated,
	NON_VITEST_COMMANDS,
	normaliseConcurrency,
	runNonVitestReportAll,
	spawnCommand,
	validateNonVitestManifest,
} from './run-non-vitest-report-all.ts';

test('keeps the exact ordered 33-command manifest', () => {
	const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
	const expected = [
		['pnpm', 'check:guard-coverage'],
		[
			'node',
			'scripts/run-guarded.ts',
			'--test',
			'scripts/ci/compose-startup.test.ts',
		],
		['pnpm', 'test:e2e-compose-env'],
		['pnpm', 'test:route-tree-guard'],
		['pnpm', 'test:design-guards'],
		['pnpm', 'test:request-counter'],
		['pnpm', 'test:search-cancel-css'],
		['pnpm', 'test:context-chunk-isolation'],
		['pnpm', 'test:simplebar-upstream-css'],
		['pnpm', 'test:design-system-guard'],
		['pnpm', 'test:zindex-guard'],
		['pnpm', 'test:react-compiler-guard'],
		['pnpm', 'test:shared-ts-import-paths'],
		['pnpm', 'test:e2e-shared-constants-guard'],
		['pnpm', 'test:column-type-imports-guard'],
		['pnpm', 'test:server-static-imports-guard'],
		['pnpm', 'test:utility-boundaries'],
		['pnpm', 'check:utility-boundaries'],
		['pnpm', 'test:font-bundle'],
		['pnpm', 'test:shared-ts-node-resolution'],
		['pnpm', 'check:design-system'],
		['pnpm', 'check:zindex'],
		['pnpm', 'check:react-compiler'],
		['pnpm', 'check:shared-ts-import-paths'],
		['pnpm', 'check:shared-ts-node-resolution'],
		['pnpm', 'check:e2e-shared-constants'],
		['pnpm', 'test:typecheck-coverage-guard'],
		['pnpm', 'test:guard-coverage-guard'],
		['pnpm', 'check:column-type-imports'],
		['pnpm', 'check:server-static-imports'],
		['pnpm', 'test:runtime-env-startup'],
		['pnpm', 'test:front-runtime-image-guard'],
		['pnpm', 'test:assert-pinned'],
	].map(([file, ...args]) => [file === 'pnpm' ? pnpm : file, ...args]);
	assert.deepEqual(
		NON_VITEST_COMMANDS.map((command) => command.argv),
		expected,
	);
});

test('rejects a removed command from the report-all manifest', () => {
	assert.throws(
		() => validateNonVitestManifest(NON_VITEST_COMMANDS.slice(0, -1)),
		/exactly 33/,
	);
});

test('reports every command after the first command fails', async () => {
	const calls: string[][] = [];
	const result = await runNonVitestReportAll({
		cwd: '/fixture/apps/front',
		outputPath: null,
		log: () => {},
		spawn: async (argv) => {
			calls.push(argv);
			if (argv.includes('check:guard-coverage')) {
				return { execution: 'executed', outcome: 'failure', exit_code: 7 };
			}
			return { execution: 'executed', outcome: 'success', exit_code: 0 };
		},
	});

	assert.equal(result.exit_code, 1);
	assert.equal(result.records.length, 33);
	assert.equal(calls.length, 33);
	assert.equal(result.records[0].exit_code, 7);
	assert.equal(result.records[1].outcome, 'success');
});

test('preserves signal diagnostics in the nested report', async () => {
	const result = await runNonVitestReportAll({
		cwd: '/fixture/apps/front',
		outputPath: null,
		log: () => {},
		spawn: async (argv) =>
			argv.includes('test:e2e-compose-env')
				? { execution: 'executed', outcome: 'cancelled', signal: 'SIGTERM' }
				: { execution: 'executed', outcome: 'success', exit_code: 0 },
	});

	assert.equal(result.exit_code, 1);
	assert.equal(result.records[2].signal, 'SIGTERM');
});

test('lists every failure with its captured output', async () => {
	const logs: string[] = [];
	const result = await runNonVitestReportAll({
		cwd: '/fixture/apps/front',
		outputPath: null,
		concurrency: 2,
		log: (text) => logs.push(text),
		spawn: async (argv) =>
			argv.includes('check:zindex')
				? {
						execution: 'executed',
						outcome: 'failure',
						exit_code: 3,
						output: 'zindex boom',
					}
				: { execution: 'executed', outcome: 'success', exit_code: 0 },
	});

	const output = logs.join('');
	assert.equal(result.exit_code, 1);
	assert.match(output, /\[non-vitest 22\/33 failure \d+ms\] pnpm check:zindex/);
	assert.match(output, /zindex boom/);
	assert.match(output, /failed: 22 pnpm check:zindex/);
});

test('bounds concurrency at the pool size and isolates route-tree writes', async () => {
	let inFlight = 0;
	let maxInFlight = 0;
	let routeTreeMaxInFlight = 0;
	const result = await runNonVitestReportAll({
		cwd: '/fixture/apps/front',
		outputPath: null,
		concurrency: 3,
		log: () => {},
		spawn: async (argv) => {
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			if (argv.includes('test:route-tree-guard')) {
				routeTreeMaxInFlight = Math.max(routeTreeMaxInFlight, inFlight);
			}
			await new Promise((resolve) => setTimeout(resolve, 5));
			inFlight -= 1;
			return { execution: 'executed', outcome: 'success', exit_code: 0 };
		},
	});

	assert.equal(result.records.length, 33);
	assert.ok(maxInFlight > 1);
	assert.ok(maxInFlight <= 3);
	assert.equal(routeTreeMaxInFlight, 1);
});

test('detects the isolated commands whatever the invocation shape', () => {
	const isolated = NON_VITEST_COMMANDS.filter(isIsolated).map(
		(command) => command.id,
	);
	assert.deepEqual(isolated, [4, 11, 22]);
	for (const argv of [
		['pnpm', 'test:zindex-guard'],
		['pnpm', 'run', 'test:zindex-guard'],
		['pnpm', 'run', 'check:zindex'],
		[
			'node',
			'scripts/run-guarded.ts',
			'--test',
			'scripts/guards/check-zindex-guard.test.ts',
		],
		['node', 'scripts/run-guarded.ts', 'scripts/guards/check-zindex-guard.ts'],
		['pnpm', 'run', 'test:route-tree-guard'],
	]) {
		assert.equal(isIsolated({ id: 0, argv }), true, argv.join(' '));
	}
	assert.equal(
		isIsolated({ id: 0, argv: ['pnpm', 'check:react-compiler'] }),
		false,
	);
});

test('serialises the two commands that share the zindex temp prefix', async () => {
	let inFlight = 0;
	let maxInFlight = 0;
	let zindexInFlight = 0;
	let maxZindexInFlight = 0;
	const result = await runNonVitestReportAll({
		cwd: '/fixture/apps/front',
		outputPath: null,
		concurrency: 4,
		log: () => {},
		spawn: async (argv) => {
			const isZindex =
				argv.includes('test:zindex-guard') || argv.includes('check:zindex');
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			if (isZindex) {
				zindexInFlight += 1;
				maxZindexInFlight = Math.max(maxZindexInFlight, zindexInFlight);
			}
			await new Promise((resolve) => setTimeout(resolve, 5));
			if (isZindex) {
				zindexInFlight -= 1;
			}
			inFlight -= 1;
			return { execution: 'executed', outcome: 'success', exit_code: 0 };
		},
	});

	assert.equal(result.records.length, 33);
	assert.ok(maxInFlight > 1);
	assert.equal(maxZindexInFlight, 1);
});

test('never strands commands on a NaN or zero concurrency', async () => {
	assert.equal(normaliseConcurrency(Number.NaN), 1);
	assert.equal(normaliseConcurrency(0), 1);
	assert.equal(normaliseConcurrency(-4), 1);
	assert.equal(normaliseConcurrency(2.9), 2);
	for (const concurrency of [Number.NaN, 0, -4]) {
		const result = await runNonVitestReportAll({
			cwd: '/fixture/apps/front',
			outputPath: null,
			concurrency,
			log: () => {},
			spawn: async () => ({
				execution: 'executed',
				outcome: 'success',
				exit_code: 0,
			}),
		});
		assert.equal(result.records.length, 33);
		assert.equal(result.records.filter(Boolean).length, 33);
	}
});

test('streams each command as it ends and persists one log file per command', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'non-vitest-runner-'));
	try {
		let releaseBlocked = (): void => {};
		const blocked = new Promise<void>((resolve) => {
			releaseBlocked = resolve;
		});
		const logs: string[] = [];
		const run = runNonVitestReportAll({
			cwd: root,
			outputPath: path.join(root, 'test-results', 'non-vitest-report.json'),
			concurrency: 2,
			log: (text) => logs.push(text),
			spawn: async (argv) => {
				if (argv.includes('check:guard-coverage')) {
					return {
						execution: 'executed',
						outcome: 'success',
						exit_code: 0,
						output: 'first command output\n',
					};
				}
				if (argv.includes('test:route-tree-guard')) {
					return { execution: 'executed', outcome: 'success', exit_code: 0 };
				}
				await blocked;
				return { execution: 'executed', outcome: 'success', exit_code: 0 };
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.match(
			logs.join(''),
			/\[non-vitest 1\/33 ok \d+ms\] pnpm check:guard-coverage/,
		);
		assert.doesNotMatch(logs.join(''), /\[non-vitest\] \d+\/33 passed/);
		releaseBlocked();
		const result = await run;
		assert.equal(result.exit_code, 0);
		const logDirectory = path.join(root, 'test-results', 'non-vitest-logs');
		const files = await readdir(logDirectory);
		assert.equal(files.length, 33);
		const first = await readFile(
			path.join(logDirectory, '01-check-guard-coverage.log'),
			'utf8',
		);
		assert.match(first, /first command output/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('resolves on exit when a leaked grandchild keeps the pipes open', async () => {
	const startedAt = Date.now();
	const result = await spawnCommand(
		[
			process.execPath,
			'-e',
			[
				"const { spawn } = require('node:child_process');",
				"spawn(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], { stdio: 'inherit' });",
				'setTimeout(() => process.exit(0), 50);',
			].join(' '),
		],
		process.cwd(),
	);
	const elapsedMs = Date.now() - startedAt;
	assert.equal(result.outcome, 'success');
	assert.ok(elapsedMs < 3000, `runner took ${elapsedMs}ms to resolve`);
});
