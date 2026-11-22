import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
	NON_VITEST_COMMANDS,
	validateNonVitestManifest,
	type NonVitestCommand,
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

export type SpawnResult = Omit<NonVitestRecord, 'id' | 'argv'> & {
	output?: string;
};

export type NonVitestRunnerOptions = {
	cwd: string;
	spawn?: (argv: string[], cwd: string) => Promise<SpawnResult>;
	outputPath?: string | null;
	/** Bounded pool size; defaults to the runner's available cores. */
	concurrency?: number;
	log?: (text: string) => void;
};

const spawnCommand = (argv: string[], cwd: string): Promise<SpawnResult> =>
	new Promise((resolve) => {
		const [file, ...args] = argv;
		const child = spawn(file, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
		let output = '';
		child.stdout?.on('data', (chunk: Buffer) => {
			output += chunk.toString();
		});
		child.stderr?.on('data', (chunk: Buffer) => {
			output += chunk.toString();
		});
		child.once('error', (error) =>
			resolve({
				execution: 'executed',
				outcome: 'failure',
				exit_code: 1,
				signal: error.name,
				output,
			}),
		);
		child.once('close', (exitCode, signal) => {
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
				output,
			});
		});
	});

const writeLog = (text: string): void => {
	process.stdout.write(text);
};

// `test:route-tree-guard` rewrites the tracked routeTree.gen.ts before restoring
// it, so overlapping it with the pool would expose a partial generated file to
// the other guards. Every other command only reads or writes its own temp
// directory, so it is safe to run concurrently.
const EXCLUSIVE_COMMAND_MARKERS = ['test:route-tree-guard'];

const isExclusive = (command: NonVitestCommand): boolean =>
	command.argv.some((argument) => EXCLUSIVE_COMMAND_MARKERS.includes(argument));

const runBounded = async <T, R>(
	items: readonly T[],
	concurrency: number,
	run: (item: T) => Promise<R>,
): Promise<R[]> => {
	const results = Array.from<R>({ length: items.length });
	let cursor = 0;
	const worker = async (): Promise<void> => {
		for (;;) {
			const index = cursor;
			cursor += 1;
			if (index >= items.length) {
				return;
			}
			const item = items[index];
			if (item !== undefined) {
				results[index] = await run(item);
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
	);
	return results;
};

const formatCommandLog = (
	record: NonVitestRecord,
	output: string,
	durationMs: number,
): string => {
	const status = record.outcome === 'success' ? 'ok' : record.outcome;
	const header =
		`\n[non-vitest ${record.id}/${NON_VITEST_COMMANDS.length} ${status} ${durationMs}ms] ` +
		`${record.argv.join(' ')}\n`;
	if (output.length === 0) {
		return header;
	}
	return `${header}${output}${output.endsWith('\n') ? '' : '\n'}`;
};

export const runNonVitestReportAll = async ({
	cwd,
	spawn: run = spawnCommand,
	outputPath = path.join(cwd, 'test-results', 'non-vitest-report.json'),
	concurrency = availableParallelism(),
	log = writeLog,
}: NonVitestRunnerOptions) => {
	validateNonVitestManifest(NON_VITEST_COMMANDS);
	const execute = async (item: NonVitestCommand) => {
		const startedAt = Date.now();
		const { output = '', ...result } = await run(item.argv, cwd);
		return {
			record: {
				id: item.id,
				argv: item.argv,
				...result,
			} satisfies NonVitestRecord,
			output,
			durationMs: Date.now() - startedAt,
		};
	};
	const exclusive = NON_VITEST_COMMANDS.filter(isExclusive);
	const shared = NON_VITEST_COMMANDS.filter((command) => !isExclusive(command));
	const outcomes = [
		...(await runBounded(exclusive, 1, execute)),
		...(await runBounded(
			shared,
			Math.max(1, Math.floor(concurrency)),
			execute,
		)),
	].sort((left, right) => left.record.id - right.record.id);
	for (const outcome of outcomes) {
		log(formatCommandLog(outcome.record, outcome.output, outcome.durationMs));
	}
	const records = outcomes.map((outcome) => outcome.record);
	const failed = records.filter((record) => record.outcome !== 'success');
	if (failed.length > 0) {
		log(
			`[non-vitest] ${records.length - failed.length}/${records.length} passed; ` +
				`failed: ${failed.map((record) => `${record.id} ${record.argv.join(' ')}`).join(', ')}\n`,
		);
	}
	const report = {
		front: {
			non_vitest: {
				commands: records,
				ok: failed.length === 0,
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
		.endsWith('scripts/ci/run-non-vitest-report-all.ts') ?? false;

if (isDirectRun) {
	const result = await runNonVitestReportAll({ cwd: process.cwd() });
	console.log(JSON.stringify(result.report));
	process.exitCode = result.exit_code;
}
