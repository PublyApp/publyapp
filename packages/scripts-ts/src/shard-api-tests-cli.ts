import { spawnSync } from 'node:child_process';
import process from 'node:process';

import {
	SHARD_COUNT,
	ShardPartition,
	classFqnFromListLine,
	partitionFromListOutput,
} from './shard-api-tests.ts';

// CLI wrapper around partitionFromListOutput().
//
// Usage:
//   shard-api-tests-cli <shard>              # 1..SHARD_COUNT; print
//                                            #   ClassName=FQN1|ClassName=FQN2|...
//                                            #   for `dotnet test --filter`
//   shard-api-tests-cli --count <shard>      # print "shard <N> tests: K of T"
//                                            #   (K = entries in shard, T = total)
//   shard-api-tests-cli --manifest           # print JSON manifest with
//                                            #   per-shard counts and entries
//   shard-api-tests-cli --json               # print JSON of the partition
//                                            #   from a stdin list-tests blob
//
// Default mode (no flag) reads the `dotnet test --list-tests` output from
// stdin and prints the `--filter` predicate for the requested shard. The
// predicate is `ClassName="FQN"`, ORed across the shard's classes: xUnit's
// filter syntax treats `|` as OR when used between top-level expressions,
// and a `ClassName=` exact match is precise — it matches only the exact
// class FQN, not a substring of a longer FQN (unlike `FullyQualifiedName~`
// which is a substring match and could match unintended classes if names
// share prefixes).

const USAGE = `Usage:
  shard-api-tests-cli <shard>              Print --filter predicate for shard N (1..${SHARD_COUNT})
  shard-api-tests-cli --count <shard>      Print "shard <N> tests: K of T"
  shard-api-tests-cli --manifest           Print JSON manifest of the partition
  shard-api-tests-cli --run <shard> <args> Run \`dotnet test --list-tests\` against the
                                           project (defaults: apps/api/Tests/PublyApp.Api.Tests.csproj),
                                           partition, then exec \`dotnet test\` with the
                                           matching --filter predicate. <args> are passed through
                                           after the discovered filter.
  shard-api-tests-cli --help               This help
`;

const readStdin = async () => {
	const chunks = [];
	let total = 0;
	const MAX = 50 * 1024 * 1024;

	for await (const chunk of process.stdin) {
		total += chunk.length;

		if (total > MAX) {
			throw new Error(`stdin exceeds ${MAX} bytes; refusing to buffer more`);
		}

		chunks.push(chunk);
	}

	return Buffer.concat(chunks).toString('utf8');
};

const printFilter = (classNames: string[]) => {
	if (classNames.length === 0) {
		// Empty shard: emit a predicate that matches nothing rather
		// than letting xUnit interpret an empty --filter as "run
		// everything" (the historical default). xUnit's `ClassName=`
		// requires a non-empty value, and `ClassName=""` matches
		// classes with no namespace (which don't exist in this repo).
		process.stdout.write('ClassName="\u0000never-matches"\n');
		return;
	}

	process.stdout.write(
		classNames
			.map((name) => `ClassName="${name.replace(/"/g, '\\"')}"`)
			.join('|') + '\n',
	);
};

const printCount = (shardIndex: number, partition: ShardPartition) => {
	const s = partition.shards[shardIndex];
	process.stdout.write(
		`shard ${s.shard}: ${s.testCount} tests (${s.classCount} classes) of ${partition.totalTestCount} total\n`,
	);
};

const printJson = (partition: ShardPartition) => {
	process.stdout.write(JSON.stringify(partition, null, 2) + '\n');
};

const runDotnetTest = (
	shardIndex: number,
	project: string,
	dotnetArgs: string[],
) => {
	const listResult = spawnSync(
		'dotnet',
		['test', project, '--list-tests', '--no-build'],
		{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
	);

	if (listResult.status !== 0) {
		process.stderr.write(
			`dotnet test --list-tests failed (exit ${listResult.status}):\n${listResult.stderr}\n`,
		);
		process.exit(listResult.status ?? 1);
	}

	const partition = partitionFromListOutput(listResult.stdout);
	const shard = partition.shards[shardIndex];
	const classNames = Array.from(
		new Set(
			shard.entries
				.map((entry) => classFqnFromListLine(entry))
				.filter((name): name is string => name !== null),
		),
	);
	const filter = classNames
		.map((name) => `ClassName="${name.replace(/"/g, '\\"')}"`)
		.join('|');

	const args = ['test', project];

	if (shard.entries.length === 0) {
		// --filter with an unreachable value makes xUnit short-circuit
		// out of the test loop with zero discovered tests, which is what
		// we want for an empty shard: a fast green run, not an error.
		args.push('--filter', 'ClassName="\u0000never-matches"');
	} else {
		args.push('--filter', filter);
	}

	for (const a of dotnetArgs) {
		args.push(a);
	}

	const result = spawnSync('dotnet', args, { stdio: 'inherit' });
	process.exit(result.status ?? 1);
};

const main = async () => {
	const argv = process.argv.slice(2);

	if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
		process.stdout.write(USAGE);
		return;
	}

	if (argv[0] === '--manifest') {
		const stdin = await readStdin();
		const partition = partitionFromListOutput(stdin);
		printJson(partition);
		return;
	}

	if (argv[0] === '--run') {
		const shardArg = argv[1];

		if (shardArg === undefined) {
			process.stderr.write('error: --run requires a shard number\n');
			process.exit(2);
		}

		const shard = Number.parseInt(shardArg, 10);

		if (!Number.isInteger(shard) || shard < 1 || shard > SHARD_COUNT) {
			process.stderr.write(
				`error: --run shard must be 1..${SHARD_COUNT} (got: ${shardArg})\n`,
			);
			process.exit(2);
		}

		const project =
			argv[2] && !argv[2].startsWith('-')
				? argv[2]
				: 'apps/api/Tests/PublyApp.Api.Tests.csproj';
		const dotnetArgs =
			argv[2] && !argv[2].startsWith('-') ? argv.slice(3) : argv.slice(2);

		runDotnetTest(shard - 1, project, dotnetArgs);
		return;
	}

	if (argv[0] === '--count') {
		const shardArg = argv[1];

		if (shardArg === undefined) {
			process.stderr.write('error: --count requires a shard number\n');
			process.exit(2);
		}

		const shard = Number.parseInt(shardArg, 10);

		if (!Number.isInteger(shard) || shard < 1 || shard > SHARD_COUNT) {
			process.stderr.write(
				`error: --count shard must be 1..${SHARD_COUNT} (got: ${shardArg})\n`,
			);
			process.exit(2);
		}

		const stdin = await readStdin();
		const partition = partitionFromListOutput(stdin);
		printCount(shard - 1, partition);
		return;
	}

	const shard = Number.parseInt(argv[0], 10);

	if (!Number.isInteger(shard) || shard < 1 || shard > SHARD_COUNT) {
		process.stderr.write(
			`error: shard must be 1..${SHARD_COUNT} (got: ${argv[0]})\n`,
		);
		process.exit(2);
	}

	const stdin = await readStdin();
	const partition = partitionFromListOutput(stdin);
	const shardClasses = Array.from(
		new Set(
			partition.shards[shard - 1].entries
				.map((entry) => classFqnFromListLine(entry))
				.filter((name): name is string => name !== null),
		),
	);
	printFilter(shardClasses);
};

await main();
