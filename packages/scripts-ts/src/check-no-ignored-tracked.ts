import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Guard: no tracked file may match a .gitignore rule.
//
// WHAT THIS PROVES
// ----------------
// `git ls-files --cached --ignored --exclude-standard` lists exactly the files
// that are tracked by git BUT would be excluded by .gitignore. An empty output
// means the repo is clean; any other output means someone force-added a
// gitignored file (e.g. `git add -f .dump/...`) and it slipped into the repo.
//
// The guard interrogates the REAL repository via git — it never hardcodes a
// list of paths or regexes a fixture file. A hand-maintained path list would
// rot the instant a new gitignored surface is added; this cannot, because it
// asks git itself.
//
// FAIL-LOUD CONTRACT
// ------------------
// If the git command itself fails or returns something unexpected, the guard
// FAILS (red) rather than assuming "nothing to report". A silent green on a
// broken git invocation would be the exact failure mode this guard exists to
// prevent.
//
// See issue #1513.

const runGit = (cwd: string): string => {
	try {
		return execFileSync(
			'git',
			['ls-files', '-z', '--cached', '--ignored', '--exclude-standard'],
			{
				cwd,
				encoding: 'utf8',
				maxBuffer: 1024 * 1024,
			},
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			'[no-ignored-tracked] git ls-files failed — cannot determine whether tracked files match .gitignore rules.',
		);
		console.error(`  Cause: ${message}`);
		console.error(
			'  Action: re-run from a git repository root, or investigate the git error above.',
		);
		process.exit(1);
	}
};

export const findIgnoredTrackedFiles = (
	options: { cwd?: string } = {},
): string[] => {
	const { cwd = process.cwd() } = options;
	const output = runGit(cwd);

	if (output.trim().length === 0) {
		return [];
	}

	// git -z emits NUL-terminated records. Split on NUL, not on \n: a filename
	// containing a newline byte would corrupt a \n split, but NUL is the
	// protocol boundary git guarantees.
	return output
		.split('\0')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
};

const run = () => {
	const findings = findIgnoredTrackedFiles();

	if (findings.length > 0) {
		console.error(
			`[no-ignored-tracked] ${findings.length} tracked file(s) match a .gitignore rule — they are tracked but should be excluded:`,
		);

		for (const file of findings) {
			console.error(`  - ${file}`);
		}

		console.error('');
		console.error(
			'These files were force-added (e.g. `git add -f`) despite being gitignored.',
		);
		console.error(
			'Action: untrack each path with `git rm --cached <path>`, then add the offending pattern to .gitignore if it is missing.',
		);
		console.error('Example: git rm --cached ' + findings[0]);
		process.exit(1);
	}

	console.log(
		'[no-ignored-tracked] no tracked file matches a .gitignore rule. [OK]',
	);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	run();
}
