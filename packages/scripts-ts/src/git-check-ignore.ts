/**
 * Git-ignore consultation for local static gates (issue #1909).
 *
 * The repo-wide gates each used to carry their own hand-maintained exclusion
 * list, and none consulted `.gitignore`, so directories git ignores
 * (`.worktrees/`, `apps/front/playwright-report/`, ...) were linted as production
 * source on developer machines. The authority is git itself - `git
 * check-ignore` - not another hardcoded list. The gates' own exclusion lists
 * stay active (they exclude paths git TRACKS, like `apps/api/Generated`), and
 * the union rule is: skip a path if git ignores it OR if it matches the
 * gate's own list.
 *
 * This helper batches paths through a single `git check-ignore --stdin -z`
 * call instead of spawning git once per file. It returns `null` when the root
 * is not inside a git work tree (CI fixture roots, source tarballs), so the
 * static lists remain the only authority there - the same behavior as before
 * the fix.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export type GitIgnoreChecker = (absolutePaths: string[]) => Set<string>;

const isInsideWorkTree = (repositoryRoot: string): boolean => {
	const probeResult = spawnSync(
		'git',
		['-C', repositoryRoot, 'rev-parse', '--is-inside-work-tree'],
		{ encoding: 'utf8' },
	);
	return probeResult.status === 0 && probeResult.stdout.trim() === 'true';
};

export const createGitIgnoreChecker = (
	repositoryRoot: string,
): GitIgnoreChecker | null => {
	if (!isInsideWorkTree(repositoryRoot)) {
		return null;
	}

	return (absolutePaths: string[]): Set<string> => {
		if (absolutePaths.length === 0) {
			return new Set();
		}

		const relativePaths = absolutePaths.map((absolutePath) =>
			path.relative(repositoryRoot, absolutePath).split(path.sep).join('/'),
		);
		const result = spawnSync('git', ['check-ignore', '--stdin', '-z'], {
			cwd: repositoryRoot,
			encoding: 'utf8',
			input: `${relativePaths.join('\0')}\0`,
		});

		if (result.error !== undefined) {
			throw new Error(
				`failed to run git check-ignore: ${result.error.message}`,
			);
		}
		if (result.status !== 0 && result.status !== 1) {
			throw new Error(
				`git check-ignore failed with status ${String(result.status)}: ${result.stderr}`,
			);
		}

		const ignored = new Set<string>();
		if (result.stdout.length > 0) {
			for (const relativePath of result.stdout.split('\0')) {
				if (relativePath.length > 0) {
					ignored.add(path.resolve(repositoryRoot, relativePath));
				}
			}
		}
		return ignored;
	};
};
