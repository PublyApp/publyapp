import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import type { Readable } from 'node:stream';

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
	/** Bounded pool size; defaults to `NON_VITEST_CONCURRENCY` or 4 cores. */
	concurrency?: number;
	log?: (text: string) => void;
};

const NON_VITEST_CONCURRENCY_ENV = 'NON_VITEST_CONCURRENCY';

/**
 * Four workers is the measured sweet spot. Every manifest command spawns its
 * own Vite/Vitest/`node --test` worker pool, so a pool sized to a 12- or
 * 32-core runner multiplies oversubscription instead of adding throughput:
 * on a 12-core box the same suite measured 136 s at 4 workers and 581 s at 12
 * (per-test timeouts fired), while 4 workers on a 4-core runner stay fastest.
 */
const DEFAULT_CONCURRENCY_CAP = 4;

/**
 * How long the parent waits for its stdout/stderr pipes to drain after the
 * child exits. A leaked grandchild can hold those pipes open indefinitely;
 * waiting only on `close` would hang the whole suite, so the pipes are
 * destroyed after this bounded grace.
 */
const OUTPUT_DRAIN_GRACE_MS = 1000;

export type IsolationGroup = {
	key: string;
	/** Runs alone, before the shared pool: other commands read its target. */
	exclusive: boolean;
	/** `package.json` script names that belong to the group. */
	scripts: readonly string[];
	/** Script file stems, for commands invoked as `node … <file>.ts`. */
	files: readonly string[];
};

/**
 * Commands that share state and therefore must never overlap. Everything else
 * only reads the tree or writes its own `mkdtemp` directory, so it is safe to
 * run in the shared pool.
 *
 * - `route-tree`: rewrites the tracked `src/routeTree.gen.ts` before restoring
 *   it, so it runs alone before any other command can read a partial file.
 * - `zindex-temp`: the guard test sweeps every `/tmp/publy-zindex-guard-*`
 *   directory, so it stays keyed while any other z-index command is added
 *   back; today it is the only command in the manifest that uses that prefix.
 */
const ISOLATION_GROUPS: readonly IsolationGroup[] = [
	{
		key: 'route-tree',
		exclusive: true,
		scripts: ['test:route-tree-guard'],
		files: ['check-route-tree-freshness', 'route-tree-generator'],
	},
	{
		key: 'zindex-temp',
		exclusive: false,
		scripts: ['test:zindex-guard'],
		files: ['check-zindex-guard'],
	},
];

const scriptNameOf = (argv: readonly string[]): string | null => {
	const binary = path.basename(argv[0] ?? '').replace(/\.cmd$/i, '');
	if (binary !== 'pnpm') {
		return null;
	}
	const index = argv[1] === 'run' ? 2 : 1;
	return argv[index] ?? null;
};

const fileStemOf = (argument: string): string =>
	path
		.basename(argument.replaceAll('\\', '/'))
		.replace(/\.(?:[cm]?[jt]sx?)$/, '');

/** Every token an isolation group can key on, whatever the invocation shape. */
const commandIdentifiers = (argv: readonly string[]): Set<string> => {
	const identifiers = new Set<string>();
	const script = scriptNameOf(argv);
	if (script !== null) {
		identifiers.add(script);
	}
	for (const argument of argv) {
		if (argument.startsWith('-')) {
			continue;
		}
		identifiers.add(fileStemOf(argument));
	}
	return identifiers;
};

const matchesFile = (identifiers: Set<string>, file: string): boolean => {
	for (const identifier of identifiers) {
		if (identifier === file || identifier.startsWith(`${file}.`)) {
			return true;
		}
	}
	return false;
};

const isolationGroupFor = (
	command: NonVitestCommand,
): IsolationGroup | null => {
	const identifiers = commandIdentifiers(command.argv);
	return (
		ISOLATION_GROUPS.find(
			(group) =>
				group.scripts.some((script) => identifiers.has(script)) ||
				group.files.some((file) => matchesFile(identifiers, file)),
		) ?? null
	);
};

export const isIsolated = (command: NonVitestCommand): boolean =>
	isolationGroupFor(command) !== null;

export const normaliseConcurrency = (value: number): number => {
	if (!Number.isFinite(value)) {
		return 1;
	}
	return Math.max(1, Math.floor(value));
};

const concurrencyOverride = (): number | undefined => {
	const raw = process.env[NON_VITEST_CONCURRENCY_ENV];
	if (raw === undefined || raw === '') {
		return undefined;
	}
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error(
			`${NON_VITEST_CONCURRENCY_ENV} must be a positive integer, received ${JSON.stringify(raw)}`,
		);
	}
	return parsed;
};

const defaultConcurrency = (): number =>
	Math.min(DEFAULT_CONCURRENCY_CAP, availableParallelism());

export const spawnCommand = (
	argv: string[],
	cwd: string,
): Promise<SpawnResult> =>
	new Promise((resolve) => {
		const [file, ...args] = argv;
		const child = spawn(file ?? '', args, {
			cwd,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let output = '';
		let settled = false;
		const append = (chunk: Buffer) => {
			output += chunk.toString();
		};
		child.stdout?.on('data', append);
		child.stderr?.on('data', append);
		const finish = (result: SpawnResult) => {
			if (settled) {
				return;
			}
			settled = true;
			resolve({ ...result, output });
		};
		child.once('error', (error) =>
			finish({
				execution: 'executed',
				outcome: 'failure',
				exit_code: 1,
				signal: error.name,
			}),
		);
		child.once('exit', (exitCode, signal) => {
			const drain = (stream: Readable | null): Promise<void> => {
				if (stream === null || stream.closed) {
					return Promise.resolve();
				}
				return new Promise<void>((drainedStream) => {
					stream.once('close', () => drainedStream());
				});
			};
			const drained = Promise.all([drain(child.stdout), drain(child.stderr)]);
			let graceTimer: ReturnType<typeof setTimeout> | undefined;
			const grace = new Promise<void>((resolveGrace) => {
				graceTimer = setTimeout(resolveGrace, OUTPUT_DRAIN_GRACE_MS);
			});
			void Promise.race([drained, grace]).then(() => {
				if (graceTimer !== undefined) {
					clearTimeout(graceTimer);
				}
				child.stdout?.destroy();
				child.stderr?.destroy();
				let outcome: SpawnResult['outcome'];
				if (signal !== null) {
					outcome = 'cancelled';
				} else if (exitCode === 0) {
					outcome = 'success';
				} else {
					outcome = 'failure';
				}
				finish({
					execution: 'executed',
					outcome,
					exit_code: exitCode ?? undefined,
					signal: signal ?? undefined,
				});
			});
		});
	});

const writeLog = (text: string): void => {
	process.stdout.write(text);
};

const createKeyedMutex = () => {
	const tails = new Map<string, Promise<void>>();
	return async (key: string | null): Promise<() => void> => {
		if (key === null) {
			return () => {};
		}
		const previous = tails.get(key) ?? Promise.resolve();
		let release = (): void => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		tails.set(
			key,
			previous.then(() => held),
		);
		await previous;
		return release;
	};
};

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

const logFileFor = (directory: string, record: NonVitestRecord): string => {
	const script = record.argv[1] === 'run' ? record.argv[2] : record.argv[1];
	const stem = (script ?? 'command').replace(/[^A-Za-z0-9._-]+/g, '-');
	return path.join(
		directory,
		`${String(record.id).padStart(2, '0')}-${stem}.log`,
	);
};

export const runNonVitestReportAll = async ({
	cwd,
	spawn: run = spawnCommand,
	outputPath = path.join(cwd, 'test-results', 'non-vitest-report.json'),
	concurrency,
	log = writeLog,
}: NonVitestRunnerOptions) => {
	validateNonVitestManifest(NON_VITEST_COMMANDS);
	const poolSize = normaliseConcurrency(
		concurrency ?? concurrencyOverride() ?? defaultConcurrency(),
	);
	const logDirectory =
		outputPath === null
			? null
			: path.join(path.dirname(outputPath), 'non-vitest-logs');
	if (logDirectory !== null) {
		await mkdir(logDirectory, { recursive: true });
	}
	const acquire = createKeyedMutex();
	const execute = async (item: NonVitestCommand) => {
		const release = await acquire(isolationGroupFor(item)?.key ?? null);
		try {
			const startedAt = Date.now();
			const { output = '', ...result } = await run(item.argv, cwd);
			const outcome = {
				record: {
					id: item.id,
					argv: item.argv,
					...result,
				} satisfies NonVitestRecord,
				output,
				durationMs: Date.now() - startedAt,
			};
			const text = formatCommandLog(
				outcome.record,
				outcome.output,
				outcome.durationMs,
			);
			log(text);
			if (logDirectory !== null) {
				await writeFile(logFileFor(logDirectory, outcome.record), text);
			}
			return outcome;
		} finally {
			release();
		}
	};
	const exclusive = NON_VITEST_COMMANDS.filter(
		(command) => isolationGroupFor(command)?.exclusive === true,
	);
	const shared = NON_VITEST_COMMANDS.filter(
		(command) => isolationGroupFor(command)?.exclusive !== true,
	);
	const outcomes = [
		...(await runBounded(exclusive, 1, execute)),
		...(await runBounded(shared, poolSize, execute)),
	].sort((left, right) => left.record.id - right.record.id);
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
