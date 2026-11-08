import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Rejects `Co-Authored-By:` trailers (owner rule, issue #2347).
//
// Two callers, one predicate:
//   - `.husky/commit-msg` runs `--message-file <path>` on the message git is
//     about to record (comment lines ignored, as git does).
//   - the PR check in `.github/workflows/ci.yml` runs `--range base..head`
//     over the PR's own commits, plus `--title` / `--body-file` for the PR
//     text a squash merge would carry into the squash body.
//
// Match is at the START of a trimmed line, case-insensitive: a prose mention
// ("we discussed Co-Authored-By:") is not a trailer, a leading-whitespace
// `  Co-Authored-By:` is.

/** A trailer line: `Co-Authored-By:` at the start of the trimmed line. */
const CO_AUTHOR_TRAILER = /^co-authored-by:/i;

/** One offending line, with its 1-based line number in the source text. */
interface TrailerOffense {
	line: number;
	text: string;
}

/** Offending lines of a message, in order. `#` comment lines are ignored. */
const findOffenses = (message: string): TrailerOffense[] => {
	const offenses: TrailerOffense[] = [];
	const lines = message.split(/\r?\n/);

	for (const [index, line] of lines.entries()) {
		const trimmed = line.trimStart();

		if (trimmed.startsWith('#')) {
			continue;
		}

		if (CO_AUTHOR_TRAILER.test(trimmed)) {
			offenses.push({ line: index + 1, text: line });
		}
	}

	return offenses;
};

/**
 * Offending lines of a commit message: any line whose trimmed start is
 * `Co-Authored-By:`, case-insensitive, ignoring `#` comment lines.
 */
export const findCoAuthorTrailers = (message: string): string[] =>
	findOffenses(message).map((offense) => offense.text);

/** One commit read from `git log`. */
interface CommitRecord {
	hash: string;
	message: string;
}

interface Options {
	messageFile: string | null;
	range: string | null;
	title: string | null;
	bodyFile: string | null;
}

const USAGE = `usage:
  check-no-coauthor-trailer.ts --message-file <path>
  check-no-coauthor-trailer.ts --range <base>..<head> [--title <text>] [--body-file <path>]`;

const usageError = (message: string): never => {
	console.error(`check-no-coauthor-trailer: ${message}\n${USAGE}`);
	process.exit(2);
};

const parseArgs = (argv: string[]): Options => {
	const options: Options = {
		messageFile: null,
		range: null,
		title: null,
		bodyFile: null,
	};
	const takesValue = new Set([
		'--message-file',
		'--range',
		'--title',
		'--body-file',
	]);

	for (let index = 0; index < argv.length; index++) {
		const flag = argv[index] ?? '';
		const value = argv[index + 1];

		if (!takesValue.has(flag)) {
			return usageError(`unknown argument "${flag}"`);
		}

		if (value === undefined) {
			return usageError(`"${flag}" needs a value`);
		}

		index++;

		switch (flag) {
			case '--message-file':
				options.messageFile = value;
				break;
			case '--range':
				options.range = value;
				break;
			case '--title':
				options.title = value;
				break;
			case '--body-file':
				options.bodyFile = value;
				break;
		}
	}

	if ((options.messageFile === null) === (options.range === null)) {
		return usageError('pass exactly one of --message-file or --range');
	}

	if (
		options.range === null &&
		(options.title !== null || options.bodyFile !== null)
	) {
		return usageError('--title and --body-file only apply to --range');
	}

	return options;
};

const readText = (path: string, label: string): string => {
	try {
		return readFileSync(path, 'utf8');
	} catch (error) {
		console.error(
			`check-no-coauthor-trailer: cannot read ${label} at ${path}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		process.exit(2);
	}
};

/** The base of a `base..head` range, used in the rebase fix command. */
const rangeBase = (range: string): string => range.split('..')[0] ?? range;

/**
 * Trailer found → exit 3, its own code (exit 1 is what a too-old Node or a
 * failing pnpm also produce; exit 2 is every internal/usage error here).
 * `.husky/commit-msg` rejects only on 3 and falls back to grep on anything
 * else, so a broken run can never refuse a clean commit.
 */
const fail = (lines: string[]): never => {
	console.error(`\n${lines.join('\n')}\n`);
	process.exit(3);
};

const runMessageFile = (path: string): void => {
	const offenses = findOffenses(readText(path, 'commit message file'));

	if (offenses.length === 0) {
		return;
	}

	fail([
		'❌ Co-Authored-By trailer rejected — this commit message contains:',
		...offenses.map(
			(offense) => `   ${path}:${offense.line}: ${offense.text.trim()}`,
		),
		'   Remove that line, then run: git commit --amend',
		'   (for an older commit: git rebase -i <base> and remove the line)',
	]);
};

const runRange = (options: Options): void => {
	const range = options.range ?? '';
	const base = rangeBase(range);

	if (!range.includes('..')) {
		usageError(`--range must look like <base>..<head>, got "${range}"`);
	}

	let output: string;

	try {
		output = execFileSync('git', ['log', '--format=%H%x00%B%x00', range], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
	} catch (error) {
		console.error(
			`check-no-coauthor-trailer: git log ${range} failed: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		process.exit(2);
	}

	// `--format=%H%x00%B%x00` yields `hash\0body\0` per commit, with a newline
	// between records. Bodies cannot contain NUL, so the split is exact.
	const fields = output.split('\x00');
	const commits: CommitRecord[] = [];

	for (let index = 0; index + 1 < fields.length; index += 2) {
		const hash = (fields[index] ?? '').trim();

		if (!/^[0-9a-f]{7,64}$/.test(hash)) {
			break;
		}

		commits.push({ hash, message: fields[index + 1] ?? '' });
	}

	if (output.trim() !== '' && commits.length === 0) {
		console.error(
			`check-no-coauthor-trailer: could not parse "git log ${range}" output.`,
		);
		process.exit(2);
	}

	const problems: string[] = [];

	for (const commit of commits) {
		for (const offense of findOffenses(commit.message)) {
			problems.push(
				`   commit ${commit.hash.slice(0, 7)} line ${offense.line}: ${offense.text.trim()}`,
			);
		}
	}

	if (options.title !== null) {
		for (const offense of findOffenses(options.title)) {
			problems.push(`   PR title: ${offense.text.trim()}`);
		}
	}

	if (options.bodyFile !== null) {
		const body = readText(options.bodyFile, 'PR body file');

		for (const offense of findOffenses(body)) {
			problems.push(`   PR body line ${offense.line}: ${offense.text.trim()}`);
		}
	}

	if (problems.length === 0) {
		return;
	}

	fail([
		'❌ Co-Authored-By trailer rejected — the pull request carries:',
		...problems,
		`   Fix a commit: git rebase -i ${base} and remove the line (git commit --amend for the tip).`,
		'   Fix the PR title/body: edit the pull request on GitHub and remove the line.',
		`::error::Co-Authored-By trailer found in ${range}; remove it and push again.`,
	]);
};

const run = (): void => {
	const options = parseArgs(process.argv.slice(2));

	if (options.messageFile !== null) {
		runMessageFile(options.messageFile);
		return;
	}

	runRange(options);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		run();
	} catch (error) {
		console.error(
			`check-no-coauthor-trailer: internal error: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(2);
	}
}
