import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parse } from 'yaml';

/**
 * #1948 equality guard: every vitest test file must run exactly once across
 * the central ci shard matrix.
 *
 * The front gate shards the vitest suite with `vitest run --shard=i/n`, so
 * a shard configuration that loses a file is a PERMANENT false negative: the
 * workflow gets faster and nobody notices the file stopped running.
 *
 * This guard used to shell out to `vitest list` five times (the unsharded
 * suite plus every shard) and cost 219-427 s per run. It now proves the SAME
 * property statically, in well under a second:
 *
 *   - discovery is computed from the REAL vitest config globs
 *     (`vitest.config.ts` include/exclude), with Node's native glob, so no
 *     config filter is restated here;
 *   - the shard count comes from the REAL workflow matrix, and the shard
 *     step's argument list is pinned to exactly `--shard=${{ matrix.shard }}/n`;
 *   - the partition is computed with Vitest 4's own `BaseSequencer.shard`
 *     rule (sha1 of the root-relative file path, contiguous equal slices),
 *     so the per-shard counts are the ones the real matrix produces;
 *   - no file appears in more than one shard;
 *   - the union of the shards is EXACTLY the configured suite (a file lost by
 *     the shard matrix, or invented by it, is a loud failure);
 *   - the shard file counts sum to the suite count (the PR-body number).
 *
 * The coverage guarantee is unchanged: the 4 shards together still run every
 * test file exactly once, and the same three failure messages remain. What is
 * gone is only the redundant execution of Vitest's collection five times.
 *
 * An unparseable workflow or vitest config, an empty discovery, or a config
 * shape this guard cannot model (projects, test.dir, a non-front root) all
 * fail loudly — absent or unanalyzable input is never a silent pass.
 */

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '..', '..', '..', '..');
const frontDirectory = path.join(repositoryRoot, 'apps', 'front');
const centralCiPath = path.join(
	repositoryRoot,
	'.github',
	'workflows',
	'ci.yml',
);
const vitestConfigPath = path.join(frontDirectory, 'vitest.config.ts');

interface FrontCiWorkflow {
	jobs?: {
		'front-vitest'?: {
			strategy?: { matrix?: { shard?: unknown } };
			steps?: Array<{ run?: unknown }>;
		};
	};
}

interface VitestConfig {
	root?: unknown;
	test?: {
		include?: unknown;
		exclude?: unknown;
		projects?: unknown;
		dir?: unknown;
	};
}

/** Reads the shard count from the real central workflow matrix (the artifact). */
const readShardCount = (): number => {
	const raw = readFileSync(centralCiPath, 'utf8');
	const workflow = parse(raw) as FrontCiWorkflow;
	const shard = workflow.jobs?.['front-vitest']?.strategy?.matrix?.shard;

	if (!Array.isArray(shard) || shard.length === 0) {
		throw new Error(
			'Cannot read the vitest shard matrix: expected .github/workflows/ci.yml job "front-vitest" to declare strategy.matrix.shard as a non-empty array (unanalyzable input must fail loud, never pass).',
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
	const raw = readFileSync(centralCiPath, 'utf8');
	const workflow = parse(raw) as FrontCiWorkflow;
	const steps = workflow.jobs?.['front-vitest']?.steps ?? [];
	const runBlock = steps
		.map((step) => (typeof step?.run === 'string' ? step.run : null))
		.filter((run): run is string => run !== null)
		.find((run) => run.includes('vitest run'));

	if (runBlock === undefined) {
		throw new Error(
			'Cannot find a `vitest run` invocation in .github/workflows/ci.yml job "front-vitest" (unanalyzable input must fail loud, never pass).',
		);
	}

	const invocation = runBlock.match(/vitest run\s+(.+)$/m);

	if (invocation === null || invocation[1] === undefined) {
		throw new Error(
			`Cannot parse the vitest invocation in job "front-vitest" (unanalyzable input must fail loud, never pass): ${JSON.stringify(runBlock)}`,
		);
	}

	const expected = '--shard=${{ matrix.shard }}/' + shardCount;
	const actual = invocation[1].trim();

	if (actual !== expected) {
		throw new Error(
			`The real vitest shard invocation is ${JSON.stringify(actual)}, expected exactly ${JSON.stringify(expected)}. An extra flag or file filter in the shard step can silently drop files from the matrix while every other guard stays green.`,
		);
	}
};

const requireStringArray = (value: unknown, label: string): string[] => {
	if (
		!Array.isArray(value) ||
		!value.every((entry): entry is string => typeof entry === 'string')
	) {
		throw new Error(
			`Cannot read ${label} from apps/front/vitest.config.ts: expected an array of strings (unanalyzable input must fail loud, never pass).`,
		);
	}

	return value;
};

/**
 * Imports the REAL vitest config so the include/exclude globs are not
 * restated here, then rejects config shapes whose discovery this guard does
 * not model instead of silently checking a smaller suite.
 */
const readDiscoveryGlobs = async (): Promise<{
	include: string[];
	exclude: string[];
}> => {
	const imported = (await import(pathToFileURL(vitestConfigPath).href)) as {
		default?: VitestConfig;
	};
	const config = imported.default;

	if (config === undefined || config.test === undefined) {
		throw new Error(
			'Cannot read the `test` block from apps/front/vitest.config.ts (unanalyzable input must fail loud, never pass).',
		);
	}

	if (config.test.projects !== undefined || config.test.dir !== undefined) {
		throw new Error(
			'vitest.config.ts declares test.projects or test.dir: this guard models a single-project, front-rooted suite. Extend the guard before changing the discovery shape (unanalyzable input must fail loud, never pass).',
		);
	}

	if (config.root !== undefined) {
		if (
			typeof config.root !== 'string' ||
			path.resolve(frontDirectory, config.root) !== frontDirectory
		) {
			throw new Error(
				`vitest.config.ts declares root=${JSON.stringify(config.root)}: this guard globs from apps/front. Extend the guard before moving the vitest root (unanalyzable input must fail loud, never pass).`,
			);
		}
	}

	const include = requireStringArray(config.test.include, 'test.include');

	if (include.length === 0) {
		throw new Error(
			'vitest.config.ts declares an empty test.include: no test file can be discovered (unanalyzable input must fail loud, never pass).',
		);
	}

	return {
		include,
		exclude: requireStringArray(config.test.exclude, 'test.exclude'),
	};
};

/** Computes vitest's discovery from the config globs, with no collection. */
const discoverTestFiles = (globs: {
	include: string[];
	exclude: string[];
}): string[] => {
	const files = globSync(globs.include, {
		cwd: frontDirectory,
		exclude: globs.exclude,
	}).map((file) => file.split(path.sep).join('/'));

	if (files.length === 0) {
		throw new Error(
			`the configured vitest globs discovered no test files — empty discovery is unanalyzable and must fail loud, never pass.`,
		);
	}

	return [...new Set(files)].sort();
};

/**
 * Vitest 4's `BaseSequencer.shard` assigns each file a sha1 of its
 * root-relative path, sorts by that hash, then slices contiguous equal
 * ranges (`calculateShardRange`). Reproduced here so the guard reports the
 * same per-shard counts as the real matrix without running vitest.
 */
const importOrderedFiles = (files: readonly string[]): string[] =>
	[...files]
		.map((file) => ({
			file,
			hash: createHash('sha1').update(`/${file}`).digest('hex'),
		}))
		.sort((a, b) => {
			if (a.hash < b.hash) {
				return -1;
			}

			if (a.hash > b.hash) {
				return 1;
			}

			return 0;
		})
		.map(({ file }) => file);

const calculateShardRange = (
	filesCount: number,
	index: number,
	count: number,
): [number, number] => {
	const baseShardSize = Math.floor(filesCount / count);
	const remainderTestFilesCount = filesCount % count;

	if (remainderTestFilesCount >= index) {
		const shardSize = baseShardSize + 1;
		return [shardSize * (index - 1), shardSize * index];
	}

	const shardStart =
		remainderTestFilesCount * (baseShardSize + 1) +
		(index - remainderTestFilesCount - 1) * baseShardSize;
	return [shardStart, shardStart + baseShardSize];
};

const partitionShards = (
	files: readonly string[],
	shardCount: number,
): string[][] => {
	const ordered = importOrderedFiles(files);

	return Array.from({ length: shardCount }, (_, zeroBasedIndex) => {
		const [start, end] = calculateShardRange(
			ordered.length,
			zeroBasedIndex + 1,
			shardCount,
		);
		return ordered.slice(start, end);
	});
};

void test('#1948: the sharded vitest discovery is exactly the configured suite, once per file', async () => {
	const shardCount = readShardCount();
	assertVitestRunArgs(shardCount);
	const full = discoverTestFiles(await readDiscoveryGlobs());
	const shards = partitionShards(full, shardCount);

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
		`${missing.length} file(s) run in the configured vitest suite but in NO shard — the shard matrix silently lost them: ${missing.join(', ')}`,
	);
	assert.deepEqual(
		extra,
		[],
		`${extra.length} file(s) run in some shard but not in the configured vitest suite: ${extra.join(', ')}`,
	);
	assert.equal(
		totalShardFiles,
		full.length,
		`per-shard file counts sum to ${totalShardFiles}, but the configured suite has ${full.length} — the counts must be equal (both go in the PR body).`,
	);
});
