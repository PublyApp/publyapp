import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Runs one CI shard of the API integration suite (#1947) and proves it executed
// exactly the tests it was assigned.
//
//   node packages/scripts-ts/src/test-api-shard.ts <shard> <total>
//
// Formerly the shebang body of `just test-api-shard`: `just` recipes are shell
// glue only (docs/guides/languages.md), and this one extracted a plan with two
// `sed` invocations, teed the run to a temp file, scraped the executed total
// back out and compared it. Same commands, same order, same output, same exit
// codes — now checkable without a 20-minute dotnet run.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

const testProject = 'Tests/PublyApp.Api.Tests.csproj';
const apiDirectory = path.join(repoRoot, 'apps/api');

export type ShardPlan = { assigned: number; filter: string };

/** Parses the two `tests=` / `filter=` lines `shard-api-tests.ts` prints. */
export const parseShardPlan = (output: string): ShardPlan => {
	const assigned = /^tests=(.*)$/m.exec(output)?.[1];
	const filter = /^filter=(.*)$/m.exec(output)?.[1];

	if (assigned === undefined || filter === undefined) {
		throw new Error(
			`shard plan is missing its tests=/filter= lines:\n${output}`,
		);
	}

	return { assigned: Number(assigned), filter };
};

/**
 * Reads the executed test count from `dotnet test` output. `Total tests: N` is
 * the summary line; the LAST match wins because a failed run can print more
 * than one summary. `null` when no summary was printed at all (a build error).
 */
export const findExecutedTotal = (output: string): number | null => {
	const matches = [...output.matchAll(/^ *Total tests: +([0-9]+).*/gm)];
	const last = matches.at(-1)?.[1];

	return last === undefined ? null : Number(last);
};

/** The `::error::` annotation the workflow surfaces, or null when the shard matched. */
export const mismatchMessage = (
	assigned: number,
	executed: number | null,
	shard: number,
	total: number,
): string | null =>
	executed === assigned
		? null
		: `::error::API shard ${shard}/${total} executed ${executed ?? 'no'} tests but was assigned ${assigned}`;

const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

/** Runs a command, streaming its output to this process while keeping a copy. */
const teeCommand = (command: string, args: string[], cwd: string) =>
	new Promise<{ code: number; output: string }>((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			// `findExecutedTotal` parses the English summary line.
			env: { ...process.env, DOTNET_CLI_UI_LANGUAGE: 'en' },
			stdio: ['inherit', 'pipe', 'pipe'],
		});
		let output = '';

		for (const stream of [child.stdout, child.stderr]) {
			stream.on('data', (chunk: Buffer) => {
				output += chunk.toString();
				process.stdout.write(chunk);
			});
		}

		child.on('error', reject);
		child.on('close', (code) => {
			resolve({ code: code ?? 1, output });
		});
	});

const run = async () => {
	const shard = Number(process.argv[2]);
	const total = Number(process.argv[3]);

	if (
		!Number.isInteger(shard) ||
		!Number.isInteger(total) ||
		shard < 1 ||
		shard > total
	) {
		fail('usage: test-api-shard.ts <shard> <total>  (1 <= shard <= total)');
	}

	const restore = spawnSync(
		'dotnet',
		['restore', path.join(apiDirectory, testProject)],
		{ cwd: repoRoot, stdio: 'inherit' },
	);

	if (restore.status !== 0) {
		process.exit(restore.status ?? 1);
	}

	const plan = spawnSync(
		process.execPath,
		[
			path.join(repoRoot, 'packages/scripts-ts/src/shard-api-tests.ts'),
			String(shard),
			String(total),
		],
		{ cwd: repoRoot, encoding: 'utf8' },
	);

	if (plan.status !== 0) {
		fail(plan.stderr.trimEnd() || 'shard plan failed');
	}

	const { assigned, filter } = parseShardPlan(plan.stdout);
	const { code, output } = await teeCommand(
		'dotnet',
		[
			'test',
			testProject,
			'-c',
			'Test',
			'--no-build',
			'--nologo',
			'--verbosity',
			'minimal',
			'--logger',
			'console;verbosity=normal',
			'--filter',
			filter,
		],
		apiDirectory,
	);

	const message = mismatchMessage(
		assigned,
		findExecutedTotal(output),
		shard,
		total,
	);

	if (message !== null) {
		fail(message);
	}

	process.exit(code);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await run();
}
