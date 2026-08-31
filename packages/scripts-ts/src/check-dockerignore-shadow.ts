import { opendir, readFile, realpath, stat as statFn } from 'node:fs/promises';
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
// `.dockerignore`, so a third-party package can never shadow it).
//
// GITIGNORE / DOCKERIGNORE PARALLELISM
// -----------------------------------
// A file that git ignores AND that the root `.dockerignore` also mirrors is
// dead to BOTH engines and must not be reported: Docker will not package it
// (root `.dockerignore` blocks it), and git will not stage it (`.gitignore`
// blocks it). Reporting it would be a false positive against a parallel
// worktree (issue #1909 class: `.worktrees/`, `.dump/`, `.claude/`,
// `.agents/`, `.ai/`, `.aidesigner/`, `.superpowers/` are all in both files
// for exactly this reason). The contract here is therefore:
//
//   * A path that is git-ignored AND mirrored by the root `.dockerignore`
//     is dropped before reporting (parallels, no flag).
//   * A path that is git-ignored but NOT mirrored by the root `.dockerignore`
//     is visible to Docker and IS reported (parallelism broken, flag stays).
//     The repo's `.gitignore` and root `.dockerignore` are curated to overlap
//     on every surface where a future drift would be confusing, but the
//     guard does not ASSUME that — it asks git on every candidate.
//   * A path that is NOT git-ignored is always reported if it is a shadow
//     (no parallelism applies, it is just a normal file in the build context).
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

// Maximum depth of the recursive descent through external symlinks. Deeper
// than this, the guard records an overflow finding rather than continuing
// to walk an unbounded filesystem (see SYMLINKS).
const EXTERNAL_MAX_DEPTH = 32;

// Sentinel suffixed on the lexical path of a finding that triggered the
// external-depth overflow. The shape is intentionally human-readable so the
// CLI output names the chain in plain words.
const DEPTH_OVERFLOW_MARKER = '«depth-overflow»';

// A finding from the filesystem walk: the lexical path (how BuildKit resolves
// the file) and the real path (deduplication key). The real path is
// the deduplication key — the same real file can be reached via multiple
// lexical paths (e.g., a real directory and a symlink pointing to it).
type WalkFinding = {
	lexical: string;
	real: string;
};

const toPosixPath = (value: string) => value.split(path.sep).join('/');

const isShadowFile = (name: string): boolean =>
	name !== '.dockerignore' && name.toLowerCase().endsWith('.dockerignore');

// Pattern characters Docker uses whose semantics the guard does not
// implement: globs (`*`, `?`), globstar (`**`), character classes (`[`, `]`),
// brace expansion (`{`, `}`), negation (`!`), and leading anchors (`/`,
// `\`). A line that contains any of these is treated as "undecidable" —
// the guard cannot prove the path is mirrored, and the round-5 captain
// pinned silent swallowing of such lines as the exact false negative
// #1849 exists to close. The trailing `/` is stripped (it is the
// directory-or-file disambiguator in Docker's grammar, not a glob), and
// inner `/` separators are kept: the canonical "exclude this dir"
// pattern `leaked/` is exactly `leaked` after trailing-`/` strip, which
// the guard matches segment-by-segment.
const hasUndecidableCharacters = (pattern: string): boolean => {
	if (pattern.length === 0) {
		return true;
	}
	for (const char of pattern) {
		if (
			char === '*' ||
			char === '?' ||
			char === '[' ||
			char === ']' ||
			char === '{' ||
			char === '}' ||
			char === '!'
		) {
			return true;
		}
	}
	return false;
};

const normalizeDockerignorePattern = (pattern: string): string[] => {
	// Strip leading `/` (root-anchored) and trailing `/` (file/dir
	// disambiguator); what remains is a sequence of segments joined by
	// `/`. The guard treats each segment independently because Docker's
	// path semantics (a leading `path/foo` matches `path/foo` anywhere
	// in the tree, not only at the root) are out of scope for this
	// fix: the round-5 captain pinned silent swallowing of negation
	// and globs, not partial-segment matching.
	const trimmed = pattern.replace(/^\/+/, '').replace(/\/+$/, '');
	if (trimmed.length === 0) {
		return [];
	}
	return trimmed.split('/');
};

const parseDockerignoreLine = (line: string) => {
	const trimmed = line.trim();
	if (trimmed.length === 0 || trimmed.startsWith('#')) {
		return { kind: 'undecidable' as const, raw: line };
	}
	const unquoted =
		trimmed.startsWith('"') && trimmed.endsWith('"')
			? trimmed.slice(1, -1)
			: trimmed;
	if (hasUndecidableCharacters(unquoted)) {
		return { kind: 'undecidable' as const, raw: line };
	}
	const segments = normalizeDockerignorePattern(unquoted);
	if (segments.length === 0) {
		return { kind: 'undecidable' as const, raw: line };
	}
	return { kind: 'exact' as const, segments };
};

const parseDockerignore = (contents: string) =>
	contents
		.split(/\r?\n/)
		.map((line) => line.replace(/^\\#/, '#'))
		.map(parseDockerignoreLine);

// True when ANY contiguous slice of `lexicalPath` segments equals one of
// the parsed `exact` segment sequences (or the pattern is a single
// segment that matches anywhere from the root downward). The function
// returns `false` on any path that crosses an `undecidable` line: silent
// treatment of such a line is the false negative the guard is built to
// prevent.
const isMirroredByDockerignore = (
	lexicalPath: string,
	parsed: ReturnType<typeof parseDockerignoreLine>[],
): boolean => {
	const segments = lexicalPath.split('/');
	for (let index = 0; index < segments.length; index += 1) {
		for (const line of parsed) {
			if (line.kind === 'undecidable') {
				return false;
			}
			if (line.segments.length === 1) {
				if (segments[index] === line.segments[0]) {
					return true;
				}
				continue;
			}
			const tail = segments
				.slice(index, index + line.segments.length)
				.join('/');
			if (tail === line.segments.join('/')) {
				return true;
			}
		}
	}
	return false;
};

const readRootDockerignore = async (
	rootDir: string,
): Promise<ReturnType<typeof parseDockerignoreLine>[]> => {
	try {
		const contents = await readFile(
			path.join(rootDir, '.dockerignore'),
			'utf8',
		);
		return parseDockerignore(contents);
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			(error as { code?: string }).code === 'ENOENT'
		) {
			// No root `.dockerignore`: nothing can be mirrored, every
			// git-ignored finding is visible to Docker.
			return [];
		}
		throw error;
	}
};

const isRealInsideRoot = (realPath: string, realRoot: string): boolean => {
	const relative = path.relative(realRoot, realPath);
	return (
		!relative.startsWith('..') && !path.isAbsolute(relative) && relative !== ''
	);
};

// Walk the tree for shadow files. Returns findings with both the lexical path
// (how BuildKit resolves the file) and the real path (deduplication key).
//
// `lexicalParent` is the BUILD-KIT LEXICAL path of the directory being walked.
// For the root walk it is undefined (no prefix). When the walk descends into a
// subdirectory `foo/`, the recursive call receives `lexicalParent = 'foo'` and
// a file `bar.dockerignore` inside it is reported as `foo/bar.dockerignore`.
// This is the critical fix for external symlinks: when a symlink `linked/ ->
// /tmp/external/` is encountered, the escape branch computes `linked/` as its
// BUILD-KIT lexical path and passes it as `lexicalParent` to the recursive call.
// From there, `linked/subdir/Dockerfile.dockerignore` is built by appending
// entry names to `lexicalParent` — exactly how BuildKit would resolve it. The
// approach of computing `path.relative(rootDir, realTarget)` cannot work here
// because the real target may have no path relationship to the repo root at all.
const walkForShadows = async (
	rootDir: string,
	currentDir: string,
	findings: WalkFinding[],
	visitedRealPaths: Set<string>,
	realRoot: string,
	remainingDepth: number,
	lexicalParent: string | undefined,
): Promise<WalkFinding[]> => {
	const directory = await opendir(currentDir);

	for await (const entry of directory) {
		const entryAbsolute = path.join(currentDir, entry.name);

		// Dirent reports isDirectory() === false for a symlink whose target
		// IS a directory, so the symlink branch must be handled before the
		// plain-directory branch.
		if (entry.isSymbolicLink()) {
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
				// BuildKit would dereference inside the build context.
				if (isShadowFile(entry.name)) {
					const lexical = lexicalParent
						? `${lexicalParent}/${entry.name}`
						: entry.name;
					findings.push({ lexical, real: realTarget });
				}
				continue;
			}

			if (visitedRealPaths.has(realTarget)) {
				continue;
			}

			if (!isRealInsideRoot(realTarget, realRoot)) {
				// This symlink's real target sits outside the repository root.
				// The guard descends recursively, recording what it finds under
				// the BUILD-KIT lexical path of the symlink itself. This is
				// the exact shape BuildKit would resolve: `linked/subdir/...`.
				// Cycle protection and bounded depth prevent unbounded scans.
				visitedRealPaths.add(realTarget);

				// The BUILD-KIT lexical path of this symlink: `linked/` for
				// `repo/linked -> /tmp/external/`. We derive it from
				// `lexicalParent` (the BuildKit path of the directory we're
				// currently in), which is the ONLY reliable source: when this
				// symlink sits inside an external target, `entryAbsolute` is
				// a path outside the repo and `path.relative(rootDir, ...)` is
				// meaningless (produces `../tmp/...`). Using `lexicalParent`
				// gives `linked/subdir/` for the sub-symlink case.
				const symlinkLexical = lexicalParent
					? `${lexicalParent}/${entry.name}`
					: entry.name;

				if (remainingDepth <= 0) {
					findings.push({
						lexical: `${symlinkLexical}/${DEPTH_OVERFLOW_MARKER}`,
						real: realTarget,
					});
					continue;
				}

				try {
					await walkForShadows(
						rootDir,
						realTarget,
						findings,
						visitedRealPaths,
						realRoot,
						remainingDepth - 1,
						symlinkLexical,
					);
				} catch {
					// Unreadable external directory: recursion unwinds.
				}
				continue;
			}

			visitedRealPaths.add(realTarget);

			// Internal symlink to a directory: descend using the same lexical
			// parent as the current walk level.
			await walkForShadows(
				rootDir,
				entryAbsolute,
				findings,
				visitedRealPaths,
				realRoot,
				remainingDepth,
				lexicalParent,
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

			// Build the BUILD-KIT lexical path for this subdirectory:
			// `lexicalParent/foo/` — undefined parent means root-level `foo/`.
			const childLexical = lexicalParent
				? `${lexicalParent}/${entry.name}`
				: entry.name;

			await walkForShadows(
				rootDir,
				entryAbsolute,
				findings,
				visitedRealPaths,
				realRoot,
				remainingDepth,
				childLexical,
			);
			continue;
		}

		// Plain file.
		if (isShadowFile(entry.name)) {
			const lexical = lexicalParent
				? `${lexicalParent}/${entry.name}`
				: entry.name;
			findings.push({ lexical, real: entryAbsolute });
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

	const rawFindings = await walkForShadows(
		rootDir,
		rootDir,
		[],
		visitedRealPaths,
		realRoot,
		EXTERNAL_MAX_DEPTH,
		undefined, // no lexical prefix at the repo root level
	);

	// Deduplicate by real path, keeping the first lexical occurrence for each
	// real file. The same file can be reached via multiple lexical paths
	// (e.g., a real directory and a symlink pointing to it both expose the
	// same shadow). Keeping the first prevents duplicates while preserving
	// the canonical path BuildKit would see.
	const seenReal = new Set<string>();
	const uniqueFindings: WalkFinding[] = [];
	for (const f of rawFindings) {
		if (!seenReal.has(f.real)) {
			seenReal.add(f.real);
			uniqueFindings.push(f);
		}
	}

	const checkIgnore = createGitIgnoreChecker(rootDir);
	const dockerignoreMirror = await readRootDockerignore(rootDir);

	let visible: string[];

	if (checkIgnore === null) {
		visible = uniqueFindings.map((f) => f.lexical);
	} else {
		const askable: WalkFinding[] = [];
		const unanswerable: WalkFinding[] = [];
		for (const f of uniqueFindings) {
			if (f.lexical.endsWith(`/${DEPTH_OVERFLOW_MARKER}`)) {
				unanswerable.push(f);
				continue;
			}
			if (isRealInsideRoot(f.real, realRoot)) {
				askable.push(f);
			} else {
				unanswerable.push(f);
			}
		}
		const ignoredReal = checkIgnore(askable.map((f) => f.real));
		const visibleInRepo = askable
			.filter((f) => {
				if (!ignoredReal.has(f.real)) {
					return true;
				}
				// Git ignores this path. The root `.dockerignore` must
				// also mirror it for the parallelism contract to drop it.
				// A path git-ignored but NOT mirrored by `.dockerignore`
				// is visible to Docker and must be reported — that is the
				// silent false negative the round-5 captain pinned.
				return !isMirroredByDockerignore(f.lexical, dockerignoreMirror);
			})
			.map((f) => f.lexical);
		visible = [...visibleInRepo, ...unanswerable.map((f) => f.lexical)];
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
		console.error(
			'\nAt least one of these paths is git-ignored but NOT mirrored by the root .dockerignore —',
		);
		console.error(
			'Docker still ships it in the build context. Either delete the file or add the path to',
		);
		console.error(
			'the root .dockerignore so the parallelism contract holds (`.worktrees/`, `.dump/`,',
		);
		console.error(
			'`.claude/`, `.agents/`, `.ai/`, `.aidesigner/`, `.superpowers/` are mirrored for this reason).',
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
