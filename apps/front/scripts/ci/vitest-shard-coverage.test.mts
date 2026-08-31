import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { parse } from 'yaml';

const execFileAsync = promisify(execFile);

/**
 * #1948 equality guard: every vitest test file must run exactly once across
 * the front-ci shard matrix.
 *
 * The front gate shards the vitest suite with `vitest run --shard=i/n`, so
 * a shard configuration that loses a file is a PERMANENT false negative: the
 * workflow gets faster and nobody notices the file stopped running. This
 * guard reads the REAL discovery of every shard (`vitest list --shard=i/n`
 * resolves the same file partition `vitest run --shard=i/n` executes) and of
 * the unsharded suite (`vitest list`, the one-machine baseline), then pins:
 *
 *   - each shard's discovery set is the real partition, not a model of it;
 *   - no file appears in more than one shard;
 *   - the union of the shards is EXACTLY the unsharded suite (a file lost by
 *     the shard matrix, or invented by it, is a loud failure);
 *   - the shard file counts sum to the unsharded count (the PR-body number).
 *
 * The shard count itself is read from the REAL workflow file
 * (.github/workflows/front-ci.yml): the matrix is the artifact being pinned,
 * so the guard follows it instead of restating it. An unparseable workflow,
 * a missing vitest install, a non-zero `vitest list` exit, or an output line
 * that cannot be attributed to a file all fail loudly — absent or
 * unanalyzable input is never a silent pass.
 */

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '..', '..', '..', '..');
const frontDirectory = path.join(repositoryRoot, 'apps', 'front');
const frontCiPath = path.join(
	repositoryRoot,
	'.github',
	'workflows',
	'front-ci.yml',
);

const vitestBin = path.join(frontDirectory, 'node_modules', '.bin', 'vitest');

const listTimeoutMs = 10 * 60 * 1000;

// No pool flag is passed to vitest list: vitest 4 removed --poolTimeout, and
// a collection worker that hangs or dies surfaces as a non-zero exit, which
// execFile rejects and this guard turns into a loud failure — never a pass.

interface FrontCiWorkflow {
	jobs?: {
		'test-vitest'?: {
			strategy?: { matrix?: { shard?: unknown } };
			steps?: Array<{ run?: unknown }>;
		};
	};
}

/** Reads the shard count from the real front-ci.yml matrix (the artifact). */
const readShardCount = (): number => {
	const raw = readFileSync(frontCiPath, 'utf8');
	const workflow = parse(raw) as FrontCiWorkflow;
	const shard = workflow.jobs?.['test-vitest']?.strategy?.matrix?.shard;

	if (!Array.isArray(shard) || shard.length === 0) {
		throw new Error(
			'Cannot read the vitest shard matrix: expected .github/workflows/front-ci.yml job "test-vitest" to declare strategy.matrix.shard as a non-empty array (unanalyzable input must fail loud, never pass).',
		);
	}

	return shard.length;
};

/**
 * Reads the REAL vitest invocation the shard job runs and asserts its only
 * argument is the shard flag against the SAME denominator as the matrix.
 *
 * This is the mutation chosen against the guard: a file-loss defect can hide
 * in the workflow without touching the matrix — someone adds a filter flag
 * (`--dir`, `--exclude`, `--changed`, `-t`) to the shard step, the shards
 * silently drop files, and a guard that only models vitest's own `--shard`
 * partition stays green. Pinning the exact argument list closes that hole:
 * no extra flag or file filter can enter the real invocation without this
 * guard going red.
 */
const assertVitestRunArgs = (shardCount: number): void => {
	const raw = readFileSync(frontCiPath, 'utf8');
	const workflow = parse(raw) as FrontCiWorkflow;
	const steps = workflow.jobs?.['test-vitest']?.steps ?? [];
	const runBlock = steps
		.map((step) => (typeof step?.run === 'string' ? step.run : null))
		.filter((run): run is string => run !== null)
		.find((run) => run.includes('vitest run'));

	if (runBlock === undefined) {
		throw new Error(
			'Cannot find a `vitest run` invocation in .github/workflows/front-ci.yml job "test-vitest" (unanalyzable input must fail loud, never pass).',
		);
	}

	const invocation = runBlock.match(/vitest run\s+(.+)$/m);

	if (invocation === null || invocation[1] === undefined) {
		throw new Error(
			`Cannot parse the vitest invocation in job "test-vitest" (unanalyzable input must fail loud, never pass): ${JSON.stringify(runBlock)}`,
		);
	}

	const expected = `--shard=\$\{{ matrix.shard }}/${shardCount}`;
	const actual = invocation[1].trim();

	if (actual !== expected) {
		throw new Error(
			`The real vitest shard invocation is ${JSON.stringify(actual)}, expected exactly ${JSON.stringify(expected)}. An extra flag or file filter in the shard step can silently drop files from the matrix while every other guard stays green.`,
		);
	}
};

/** Parses `vitest list` output into the set of file paths it discovered. */
const parseListOutput = (stdout: string): string[] => {
	const files = new Set<string>();
	const lines = stdout.split('\n').filter((line) => line.trim().length > 0);

	for (const line of lines) {
		const separator = line.indexOf(' > ');

		if (separator === -1) {
			throw new Error(
				`Cannot attribute a "vitest list" line to a file (expected "path > suite > test", no " > " found): ${JSON.stringify(line.slice(0, 200))}`,
			);
		}

		files.add(line.slice(0, separator));
	}

	if (files.size === 0) {
		throw new Error(
			`vitest list discovered no test files — empty discovery is unanalyzable and must fail loud, never pass.`,
		);
	}

	return [...files];
};

/** Runs `vitest list` for one shard (or the whole suite) and parses file paths. */
const listFiles = async (args: string[]): Promise<string[]> => {
	if (!existsSync(vitestBin)) {
		throw new Error(
			`vitest binary not found at ${vitestBin}. Run "pnpm install" first (a missing install must fail loud, never pass).`,
		);
	}

	const { stdout, stderr } = await execFileAsync(vitestBin, args, {
		cwd: frontDirectory,
		env: {
			...process.env,
			CI: '1',
			// force-disable colour: the list output is parsed by string, so
			// ANSI codes would corrupt the file names. FORCE_COLOR=0 wins
			// over an inherited FORCE_COLOR=3; NO_COLOR is ignored when
			// FORCE_COLOR is set.
			FORCE_COLOR: '0',
			NO_COLOR: '1',
		},
		maxBuffer: 64 * 1024 * 1024,
		timeout: listTimeoutMs,
	});

	// Fail on a non-zero exit with the captured stderr for diagnosis — never
	// on stderr alone: vitest writes harmless warnings there under load (a
	// pool-termination warning, a NO_COLOR note), while the exit code and the
	// parsed output decide whether the discovery is real.
	void stderr;

	return parseListOutput(stdout);
};

void test('#1948: the sharded vitest discovery is exactly the unsharded suite, once per file', async () => {
	const shardCount = readShardCount();
	assertVitestRunArgs(shardCount);
	const full = await listFiles(['list']);
	const shards: string[][] = [];

	for (let index = 1; index <= shardCount; index += 1) {
		shards.push(await listFiles(['list', `--shard=${index}/${shardCount}`]));
	}

	const fullSet = new Set(full);
	const seen = new Set<string>();
	const union = new Set<string>();

	for (const shard of shards) {
		for (const file of shard) {
			if (seen.has(file)) {
				assert.fail(
					`${file} is discovered by more than one shard (shards must partition the suite: every file runs exactly once).`,
				);
			}

			seen.add(file);
			union.add(file);
		}
	}

	const missing = [...fullSet].filter((file) => !union.has(file));
	const extra = [...union].filter((file) => !fullSet.has(file));
	let totalShardFiles = 0;
	for (const shard of shards) {
		totalShardFiles += shard.length;
	}

	// The PR-body numbers, printed by the real run.
	process.stdout.write(
		`vitest shard coverage: full=${full.length} shards=[${shards.map((shard) => shard.length).join(', ')}] sum=${totalShardFiles}\n`,
	);

	assert.deepEqual(
		missing,
		[],
		`${missing.length} file(s) run in the unsharded suite but in NO shard — the shard matrix silently lost them: ${missing.join(', ')}`,
	);
	assert.deepEqual(
		extra,
		[],
		`${extra.length} file(s) run in some shard but not in the unsharded suite: ${extra.join(', ')}`,
	);
	assert.equal(
		totalShardFiles,
		full.length,
		`per-shard file counts sum to ${totalShardFiles}, but the unsharded suite has ${full.length} — the counts must be equal (both go in the PR body).`,
	);
});
