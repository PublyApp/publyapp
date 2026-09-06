import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export type NonVitestCommand = {
	id: number;
	argv: string[];
};

export type NonVitestRecord = {
	id: number;
	argv: string[];
	execution: 'executed';
	outcome: 'success' | 'failure' | 'cancelled';
	exit_code?: number;
	signal?: string;
};

export type SpawnResult = Omit<NonVitestRecord, 'id' | 'argv'>;

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const command = (id: number, ...argv: string[]): NonVitestCommand => ({
	id,
	argv,
});

export const NON_VITEST_COMMANDS: NonVitestCommand[] = [
	command(1, pnpm, 'check:guard-coverage'),
	command(
		2,
		'node',
		'scripts/run-guarded.mts',
		'--test',
		'scripts/ci/compose-startup.test.mts',
	),
	command(3, pnpm, 'test:e2e-compose-env'),
	command(4, pnpm, 'test:route-tree-guard'),
	command(5, pnpm, 'test:design-guards'),
	command(6, pnpm, 'test:request-counter'),
	command(7, pnpm, 'test:search-cancel-css'),
	command(8, pnpm, 'test:context-chunk-isolation'),
	command(9, pnpm, 'test:simplebar-upstream-css'),
	command(10, pnpm, 'test:design-system-guard'),
	command(11, pnpm, 'test:zindex-guard'),
	command(12, pnpm, 'test:react-compiler-guard'),
	command(13, pnpm, 'test:shared-ts-import-paths'),
	command(14, pnpm, 'test:e2e-shared-constants-guard'),
	command(15, pnpm, 'test:column-type-imports-guard'),
	command(16, pnpm, 'test:server-static-imports-guard'),
	command(17, pnpm, 'test:font-bundle'),
	command(18, pnpm, 'test:shared-ts-node-resolution'),
	command(19, pnpm, 'check:design-system'),
	command(20, pnpm, 'check:zindex'),
	command(21, pnpm, 'check:react-compiler'),
	command(22, pnpm, 'check:shared-ts-import-paths'),
	command(23, pnpm, 'check:shared-ts-node-resolution'),
	command(24, pnpm, 'check:e2e-shared-constants'),
	command(25, pnpm, 'test:typecheck-coverage-guard'),
	command(26, pnpm, 'test:guard-coverage-guard'),
	command(27, pnpm, 'check:column-type-imports'),
	command(28, pnpm, 'check:server-static-imports'),
	command(29, pnpm, 'test:runtime-env-startup'),
	command(30, pnpm, 'test:front-runtime-image-guard'),
];

export type NonVitestRunnerOptions = {
	cwd: string;
	spawn?: (argv: string[], cwd: string) => Promise<SpawnResult>;
	outputPath?: string | null;
};

const spawnCommand = (argv: string[], cwd: string): Promise<SpawnResult> =>
	new Promise((resolve) => {
		const [file, ...args] = argv;
		const child = spawn(file, args, { cwd, stdio: 'inherit' });
		child.once('error', (error) =>
			resolve({
				execution: 'executed',
				outcome: 'failure',
				exit_code: 1,
				signal: error.name,
			}),
		);
		child.once('exit', (exitCode, signal) => {
			let outcome: SpawnResult['outcome'];
			if (signal !== null) {
				outcome = 'cancelled';
			} else if (exitCode === 0) {
				outcome = 'success';
			} else {
				outcome = 'failure';
			}
			resolve({
				execution: 'executed',
				outcome,
				exit_code: exitCode ?? undefined,
				signal: signal ?? undefined,
			});
		});
	});

export const runNonVitestReportAll = async ({
	cwd,
	spawn: run = spawnCommand,
	outputPath = path.join(cwd, 'test-results', 'non-vitest-report.json'),
}: NonVitestRunnerOptions) => {
	const records: NonVitestRecord[] = [];
	for (const item of NON_VITEST_COMMANDS) {
		const result = await run(item.argv, cwd);
		records.push({ id: item.id, argv: item.argv, ...result });
	}
	const report = {
		front: {
			non_vitest: {
				commands: records,
				ok: records.every((record) => record.outcome === 'success'),
			},
		},
	};
	if (outputPath !== null) {
		await mkdir(path.dirname(outputPath), { recursive: true });
		await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	}
	return { exit_code: report.front.non_vitest.ok ? 0 : 1, records, report };
};

const isDirectRun =
	process.argv[1]
		?.replaceAll('\\', '/')
		.endsWith('scripts/ci/run-non-vitest-report-all.mts') ?? false;

if (isDirectRun) {
	const result = await runNonVitestReportAll({ cwd: process.cwd() });
	console.log(JSON.stringify(result.report));
	process.exit(result.exit_code);
}
