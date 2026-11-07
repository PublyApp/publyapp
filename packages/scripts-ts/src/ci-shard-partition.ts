import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Runs the API shard-partition proof on ONE shard of the matrix, never on the
// other three.
//
// Formerly the `run:` block of ci.yml::api::Verify API shard partition:
// `if [ "${{ matrix.shard }}" = 1 ]; then just ci-api-shard-partition; fi`
// (docs/guides/languages.md: a condition is logic, so it is a script).

/** The shard that owns the partition proof (shard 1 of the CI matrix). */
export const PARTITION_SHARD = '1';

export const isPartitionShard = (shard: string | undefined): boolean =>
	shard === PARTITION_SHARD;

const run = () => {
	const shard = process.argv[2] ?? process.env.MATRIX_SHARD;

	if (!isPartitionShard(shard)) {
		return;
	}

	const result = spawnSync('just', ['ci-api-shard-partition'], {
		stdio: 'inherit',
	});

	process.exit(result.status ?? 1);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	run();
}
