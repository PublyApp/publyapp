import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { BaseSequencer, type TestSpecification } from 'vitest/node';
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
 *     (`vitest.config.ts` include/exclude) with the same library and options
 *     Vitest's own `globFiles` uses (tinyglobby, `dot: true`, `ignore`,
 *     `expandDirectories: false`), resolved from the installed vitest package,
 *     so dotfiles, node_modules and `!` negations behave as they do in the
 *     real run instead of being restated here;
 *   - the shard count comes from the REAL workflow matrix, and the shard
 *     step's argument list is pinned to exactly `--shard=${{ matrix.shard }}/n`;
 *   - the partition is computed by Vitest's own `BaseSequencer.shard`,
 *     imported from `vitest/node` and given the real root and shard, so a
 *     vitest bump cannot leave a private copy of the rule drifting;
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
 * shape this guard cannot model (projects, test.dir, includeSource, a custom
 * sequence.sequencer, a non-front root) all fail loudly — absent or
 * unanalyzable input is never a silent pass.
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
		includeSource?: unknown;
		sequence?: { sequencer?: unknown };
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

	if (config.test.includeSource !== undefined) {
		throw new Error(
			'vitest.config.ts declares test.includeSource: those files run in the shards but are not part of test.include, so this guard cannot prove they survive the partition. Extend the guard before enabling in-source tests (unanalyzable input must fail loud, never pass).',
		);
	}

	if (config.test.sequence?.sequencer !== undefined) {
		throw new Error(
			'vitest.config.ts declares test.sequence.sequencer: a custom sequencer can shard differently from BaseSequencer, which this guard calls. Extend the guard before changing the sequencer (unanalyzable input must fail loud, never pass).',
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

interface TinyGlobbyOptions {
	dot: boolean;
	cwd: string;
	ignore: string[];
	expandDirectories: boolean;
}

interface TinyGlobby {
	glob: (patterns: string[], options: TinyGlobbyOptions) => Promise<string[]>;
}

/**
 * Resolves tinyglobby through Vitest's own dependency tree, then imports it
 * with the exact options Vitest's `globFiles` passes. No private glob copy:
 * a Vitest bump that moves or replaces the library makes this import fail
 * loudly instead of leaving the guard on stale semantics.
 */
const importVitestGlob = async (): Promise<TinyGlobby['glob']> => {
	const require = createRequire(import.meta.url);
	const vitestRequire = createRequire(require.resolve('vitest/package.json'));
	const tinyGlobby: TinyGlobby = await import(
		pathToFileURL(vitestRequire.resolve('tinyglobby')).href
	);

	return tinyGlobby.glob;
};

/** Computes vitest's discovery from the config globs, with no collection. */
const discoverTestFiles = async (globs: {
	include: string[];
	exclude: string[];
}): Promise<string[]> => {
	const glob = await importVitestGlob();
	const files = (
		await glob(globs.include, {
			dot: true,
			cwd: frontDirectory,
			ignore: globs.exclude,
			expandDirectories: false,
		})
	).map((file) => file.replaceAll('\\', '/').replace(/^\.\//, ''));

	if (files.length === 0) {
		throw new Error(
			'the configured vitest globs discovered no test files — empty discovery is unanalyzable and must fail loud, never pass.',
		);
	}

	return [...new Set(files)].sort();
};

/**
 * Partitions the suite with Vitest's own `BaseSequencer.shard` — the exact
 * method the real `--shard=i/n` run uses, including its sha1 ordering and
 * contiguous range slicing. Importing it (instead of copying the rule) means
 * a vitest bump cannot leave this guard silently modelling an old version.
 */
const partitionShards = async (
	files: readonly string[],
	shardCount: number,
): Promise<string[][]> => {
	const specs: TestSpecification[] = files.map((file) =>
		Object.assign(Object.create(null), {
			moduleId: path.join(frontDirectory, file),
		}),
	);

	return Promise.all(
		Array.from({ length: shardCount }, async (_, zeroBasedIndex) => {
			const context: ConstructorParameters<typeof BaseSequencer>[0] =
				Object.assign(Object.create(null), {
					config: {
						root: frontDirectory,
						shard: {
							index: zeroBasedIndex + 1,
							count: shardCount,
						},
					},
				});
			const sequencer = new BaseSequencer(context);
			const shard = await sequencer.shard(specs);

			return shard.map((spec) =>
				path.relative(frontDirectory, spec.moduleId).split(path.sep).join('/'),
			);
		}),
	);
};

void test('#1948: the sharded vitest discovery is exactly the configured suite, once per file', async () => {
	const shardCount = readShardCount();
	assertVitestRunArgs(shardCount);
	const full = await discoverTestFiles(await readDiscoveryGlobs());
	const shards = await partitionShards(full, shardCount);

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
