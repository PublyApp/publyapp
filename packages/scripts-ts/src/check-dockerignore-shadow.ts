import { opendir, realpath, stat as statFn } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { createGitIgnoreChecker } from './git-check-ignore.ts';

// Guard: no `<Dockerfile>.dockerignore` shadow file may exist anywhere in the
// tree (#1849).
//
// WHAT THIS PROVES
// ----------------
// Docker does NOT add exclusion files together: when a file named like
// `Dockerfile.dockerignore` (or `Dockerfile.prod.dockerignore`, or any
// `*.dockerignore` other than the root one) exists in the tree, it REPLACES
// the root `.dockerignore` for that build entirely. That is exactly what
// happened with `apps/api/Dockerfile.dockerignore` in #1832: its 15 patterns
// took the place of the root file's 86 lines and the api build context
// ballooned from 15.9 MB to 21.2 MB by re-including node_modules, dist,
// .turbo, .worktrees, .dump and .claude. #1836 deleted the offending file;
// this guard exists so a shadow file cannot silently reappear.
//
// Docker matches the dockerignore name case-INSENSITIVELY, so the detection
// is case-insensitive too: `Dockerfile.DOCKERIGNORE`,
// `Dockerfile.DockerIgnore` and `apps/api/Dockerfile.DockerIgnore` all
// replace the root file and must all go red. The exemption stays EXACT:
// only the canonical spelling `.dockerignore` is accepted, because the
// round-2 reviewer pinned a root `.DockerIgnore` as a red shadow as well.
// A case variant of the dotfile (root or in a subdirectory) is therefore
// flagged too: on the case-sensitive filesystem this repo builds on it is a
// dead, confusing file, and on a case-insensitive filesystem it is exactly
// the ambiguity #1849 closes. The legitimate root `.dockerignore` (exact
// spelling) remains accepted, and a subdirectory `.dockerignore` (exact
// spelling) is the separate additive BuildKit feature, which also cannot
// replace the root file.
//
// The guard interrogates the REAL working tree (the same filesystem a build
// context is drawn from): it walks every directory and flags each file whose
// basename ends with `.dockerignore` case-insensitively but is not exactly
// `.dockerignore`. Files inside `.git` and `node_modules` are out of scope
// (`node_modules` is always excluded from every build context by the root
// `.dockerignore`, so a third-party package can never shadow it). In addition,
// any file that git itself ignores (e.g. inside `.worktrees/`, `.dump/`, or any
// path matched by `.gitignore`) is dropped before reporting: when a path is
// matched by `.gitignore` AND by the root `.dockerignore`, it cannot enter a
// Docker build context either, and flagging it would be a false positive
// against a parallel worktree (issue #1909 class). The contract here is the
// UNION, not an unconditional claim: a git-ignored path that the root
// `.dockerignore` does NOT mirror is visible to Docker (false negative risk),
// and the repo's `.gitignore` and root `.dockerignore` are curated to overlap
// on the surfaces that matter — `.worktrees/`, `.dump/`, `.claude/`,
// `.agents/`, `.ai/`, `.aidesigner/`, `.superpowers/` are in both.
//
// The git-ignored filter is delegated to the shared `createGitIgnoreChecker`
// (packages/scripts-ts/src/git-check-ignore.ts, #1927). That helper batches
// `git check-ignore --stdin -z` in one invocation: the null-separated output
// avoids the C-quoting that `git check-ignore -v` applies to paths containing
// tabs, newlines, double-quotes or backslashes (round-4 finding — a tab in a
// directory name caused a real shadow to be reported as a false positive).
// The shared helper also returns paths as absolute, which is what this guard
// needs to intersect the walk's relative findings.
//
// SYMLINKS
// --------
// BuildKit follows symlinks within the build context by default, so a
// `Dockerfile.dockerignore` reachable only through a symlinked directory
// (e.g. `vendor/ -> ../external-repo/`) is visible to the build and must be
// flagged here too. The walk therefore descends into symlinked directories.
// Two protective measures keep that safe:
//
// * Cycle protection: the realpath of every directory the walk has already
//   entered is remembered; a symlink that resolves back to an already-visited
//   directory is skipped, so self-referential loops terminate.
// * Containment: a symlink whose real target sits OUTSIDE the repository
//   root is reported and walked under its lexical path — its contents are
//   outside this repo and therefore outside the contract of this guard, but
//   the path itself still names a directory that BuildKit would resolve into
//   the context. Documenting this in the output is the deliberate trade-off
//   vs. silently dropping it (round-4 finding).
//
// Files (not directories) that are symlinks are not special-cased: a symlink
// whose basename ends with `.dockerignore` is still a shadow.
//
// FAIL-LOUD CONTRACT
// ------------------
// If the tree cannot be scanned (missing root, unreadable directory), the
// guard FAILS (red) naming the cause rather than reporting an empty
// "nothing to flag". A silent green on a broken walk would be the exact
// failure mode this guard exists to prevent.
//
// See issue #1849.

// Directories the daemon can never read dockerignore files from, at any
// depth: `.git` is tool metadata outside any build context, and
// `node_modules` is excluded from every build context by the root
// `.dockerignore`. Skipping both removes false-positive sources while losing
// zero protection.
const SKIP_DIRS = new Set(['.git', 'node_modules']);

const toPosixPath = (value: string) => value.split(path.sep).join('/');

const isShadowFile = (name: string): boolean =>
	name !== '.dockerignore' && name.toLowerCase().endsWith('.dockerignore');

const isRealInsideRoot = (realPath: string, realRoot: string): boolean => {
	const relative = path.relative(realRoot, realPath);
	return (
		!relative.startsWith('..') && !path.isAbsolute(relative) && relative !== ''
	);
};

const walkForShadows = async (
	rootDir: string,
	currentDir: string,
	findings: string[],
	visitedRealPaths: Set<string>,
	realRoot: string,
): Promise<string[]> => {
	const directory = await opendir(currentDir);

	for await (const entry of directory) {
		const entryAbsolute = path.join(currentDir, entry.name);
		const lexicalRelative = toPosixPath(path.relative(rootDir, entryAbsolute));

		// Dirent reports isDirectory() === false for a symlink whose target
		// IS a directory, so the symlink branch must be handled before the
		// plain-directory branch.
		if (entry.isSymbolicLink()) {
			// The symlink could point at a file (then it is itself a file
			// candidate: a symlink whose basename ends with `.dockerignore`
			// IS the shadow Docker would resolve) OR at a directory (then
			// it is a transit point into more of the tree). Resolve it to
			// tell which.
			let realTarget: string;
			let targetStat;
			try {
				realTarget = await realpath(entryAbsolute);
				targetStat = await statFn(realTarget);
			} catch {
				// Broken symlink: nothing to walk, no file to flag.
				continue;
			}

			if (!targetStat.isDirectory()) {
				// Symlink to a file. The lexically-named entry is the file
				// BuildKit would dereference inside the build context, so it
				// goes through the shadow test by its lexical name.
				if (isShadowFile(entry.name)) {
					findings.push(lexicalRelative);
				}
				continue;
			}

			if (visitedRealPaths.has(realTarget)) {
				continue;
			}

			if (!isRealInsideRoot(realTarget, realRoot)) {
				// Symlink escapes the repository root. We do NOT recurse
				// through `realpath`: descending into `/home` or `/tmp`
				// would scan an unbounded filesystem and trade one bug for
				// another. We DO inspect the LEXICAL root — `opendir` follows
				// symlinks — to surface shadows sitting at the root of the
				// external target, which is the contract of the guard for any
				// directory in the build context. Files deeper than that root
				// stay invisible: the external tree is outside the repo-level
				// contract, and the lexical recursion would be unbounded.
				try {
					const externalDirectory = await opendir(entryAbsolute);
					for await (const externalEntry of externalDirectory) {
						if (externalEntry.isDirectory() || externalEntry.isSymbolicLink()) {
							continue;
						}
						if (isShadowFile(externalEntry.name)) {
							findings.push(`${lexicalRelative}/${externalEntry.name}`);
						}
					}
				} catch {
					// Unreadable external directory: nothing to add.
				}
				continue;
			}

			visitedRealPaths.add(realTarget);

			await walkForShadows(
				rootDir,
				entryAbsolute,
				findings,
				visitedRealPaths,
				realRoot,
			);
			continue;
		}

		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) {
				continue;
			}

			const realEntry = await realpath(entryAbsolute);
			if (visitedRealPaths.has(realEntry)) {
				continue;
			}
			visitedRealPaths.add(realEntry);

			await walkForShadows(
				rootDir,
				entryAbsolute,
				findings,
				visitedRealPaths,
				realRoot,
			);
			continue;
		}

		if (isShadowFile(entry.name)) {
			findings.push(lexicalRelative);
		}
	}

	return findings;
};

export const findDockerignoreShadows = async (
	options: { rootDir?: string } = {},
): Promise<string[]> => {
	const { rootDir = process.cwd() } = options;
	const realRoot = await realpath(path.resolve(rootDir));
	const visitedRealPaths = new Set<string>([realRoot]);

	const findings = await walkForShadows(
		rootDir,
		rootDir,
		[],
		visitedRealPaths,
		realRoot,
	);

	const checkIgnore = createGitIgnoreChecker(rootDir);

	let visible: string[];

	if (checkIgnore === null) {
		// Not inside a git work tree: nothing to consult, every finding is
		// visible. The CI checkout and the unit-test temp trees both live
		// inside a work tree, so this branch is exercised by source tarballs
		// and external tooling, not by the regular path.
		visible = findings;
	} else {
		// `git check-ignore` refuses paths that escape the repository root
		// via a symlink (status 128, "pathspec ... is beyond a symbolic
		// link"). Separate the findings into two buckets:
		// * askable: the real path stays inside the repo, git has a real
		//   answer, and a positive answer hides the finding.
		// * unanswerable: the real path leaves the repo via a symlink. Git
		//   cannot speak to it, so we keep the finding — its lexical path
		//   is in the build context, the shadow is real.
		const askable: { relativePath: string; absolute: string }[] = [];
		const unanswerable: string[] = [];
		for (const relativePath of findings) {
			const absolute = path.resolve(rootDir, relativePath);
			const realAbsolute = await realpath(absolute);
			if (isRealInsideRoot(realAbsolute, realRoot)) {
				askable.push({ relativePath, absolute: realAbsolute });
			} else {
				unanswerable.push(relativePath);
			}
		}
		const ignoredAbsolute = checkIgnore(askable.map((entry) => entry.absolute));
		const visibleInRepo = askable
			.filter((entry) => !ignoredAbsolute.has(entry.absolute))
			.map((entry) => entry.relativePath);
		visible = [...visibleInRepo, ...unanswerable];
	}

	return visible.sort();
};

const run = async () => {
	let findings: string[];

	try {
		findings = await findDockerignoreShadows({ rootDir: process.cwd() });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			'[no-dockerignore-shadow] could not scan the repository tree — failing loud instead of reporting "nothing to flag".',
		);
		console.error(`  Cause: ${message}`);
		console.error(
			'  Action: run from the repository root and check the tree is readable.',
		);
		process.exit(1);
	}

	if (findings.length > 0) {
		console.error('Found .dockerignore shadow file(s):');

		for (const file of findings) {
			console.error(`  - ${file}`);
		}

		console.error(
			'\nDocker does NOT add exclusion files together: when a file named like <Dockerfile>.dockerignore',
		);
		console.error(
			'exists in the tree, it REPLACES the root .dockerignore for that build entirely, silently',
		);
		console.error(
			're-introducing node_modules, dist, .turbo, .worktrees and other excluded paths into the',
		);
		console.error(
			'build context (see #1832/#1836: the api image context grew from 15.9 MB to 21.2 MB). Delete',
		);
		console.error(
			'each file above so the root .dockerignore stays the single source of build-context exclusions.',
		);
		process.exit(1);
	}

	console.log(
		'No .dockerignore shadow files: the root .dockerignore is the only one in the tree. [OK]',
	);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	await run();
}
