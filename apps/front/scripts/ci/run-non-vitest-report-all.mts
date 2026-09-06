import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
	NON_VITEST_COMMANDS,
	validateNonVitestManifest,
} from '../../../../packages/scripts-ts/src/ci-non-vitest-manifest.ts';

export { NON_VITEST_COMMANDS, validateNonVitestManifest };

export type NonVitestRecord = {
	id: number;
	argv: string[];
	execution: 'executed';
	outcome: 'success' | 'failure' | 'cancelled';
	exit_code?: number;
	signal?: string;
};

export type SpawnResult = Omit<NonVitestRecord, 'id' | 'argv'>;

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
	validateNonVitestManifest(NON_VITEST_COMMANDS);
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
