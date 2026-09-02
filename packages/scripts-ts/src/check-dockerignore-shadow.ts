import { lstat, opendir, realpath, stat as statFn } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Guard: the repository must contain exactly one `.dockerignore`, at the
// root (#1849, #1891, #1977, #2061).
//
// INVARIANT
// ---------
// The only filesystem entry allowed to be named exactly `.dockerignore` is
// the repository-root file. Any other entry whose basename ends with
// `.dockerignore` case-insensitively — a `<Dockerfile>.dockerignore`
// shadow, a case variant, or an exact `.dockerignore` sitting in a
// subdirectory — is a finding. Docker does NOT add exclusion files
// together: whichever `.dockerignore` a given build context resolves
// REPLACES the root file's exclusions for that build entirely, silently
// re-including `node_modules`, `dist`, `.turbo`, `.worktrees`, `.dump` and
// `.claude`. That is exactly what happened with
// `apps/api/Dockerfile.dockerignore` in #1832 (the api build context
// ballooned from 15.9 MB to 21.2 MB); #1836 deleted the offending file and
// this guard exists so a shadow cannot silently reappear.
//
// The guard interrogates the REAL working tree (the same filesystem a build
// context is drawn from) and applies no git-ignore filtering: an untracked,
// git-ignored, or tracked shadow is equally visible to a Docker build and is
// therefore equally reported.
//
// TOOLING-DIRECTORY BOUNDARY
// ---------------------------
// The walk skips `.git`, `node_modules`, `.worktrees`, `.dump`, `.claude`,
// `.agents`, `.ai`, `.aidesigner`, and `.superpowers` by exact directory
// name at any depth: none of these can ever reach a Docker build context
// (`node_modules` is excluded from every context by the root
// `.dockerignore`; the rest are tool/worktree metadata, not build input).
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
//   vs. silently dropping it.
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

// Directories that can never reach a Docker build context, at any depth —
// see the TOOLING-DIRECTORY BOUNDARY note above. Exact names only, no
// substring matching.
const SKIP_DIRS = new Set([
	'.git',
	'node_modules',
	'.worktrees',
	'.dump',
	'.claude',
	'.agents',
	'.ai',
	'.aidesigner',
	'.superpowers',
]);

// Maximum depth of the recursive descent through external symlinks. Deeper
// than this, the guard records an overflow finding rather than continuing
// to walk an unbounded filesystem (see SYMLINKS).
const EXTERNAL_MAX_DEPTH = 32;

// Sentinel suffixed on the lexical path of a finding that triggered the
// external-depth overflow. The shape is intentionally human-readable so the
// CLI output names the chain in plain words.
const DEPTH_OVERFLOW_MARKER = '«depth-overflow»';

// A finding from the filesystem walk: the lexical path, i.e. how BuildKit
// resolves the file inside the build context.
type WalkFinding = {
	lexical: string;
};

// A shadow is any basename ending `.dockerignore` case-insensitively, other
// than the exact repository-root `.dockerignore` (`lexicalParent ===
// undefined` marks root level — see the INVARIANT note above).
const isShadowFile = (
	name: string,
	lexicalParent: string | undefined,
): boolean => {
	if (!name.toLowerCase().endsWith('.dockerignore')) {
		return false;
	}
	return !(lexicalParent === undefined && name === '.dockerignore');
};

const isRealInsideRoot = (realPath: string, realRoot: string): boolean => {
	const relative = path.relative(realRoot, realPath);
	return (
		!relative.startsWith('..') && !path.isAbsolute(relative) && relative !== ''
	);
};

// Walk the tree for shadow files. Returns findings named by their lexical
// path — how BuildKit resolves the file inside the build context.
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
//
// LEXICAL ALIAS WALKS (#2061)
// --------------------------
// An internal directory symlink exposes a real subtree through a distinct
// BuildKit-visible lexical path. Alias walks carry path-local realpath
// ancestry: copying it per child terminates cycles without collapsing sibling
// lexical routes to the same target. External traversal retains its separate
// global depth/dedup contract.
const walkForShadows = async (
	currentDir: string,
	findings: WalkFinding[],
	visitedRealPaths: Set<string>,
	realRoot: string,
	remainingDepth: number,
	lexicalParent: string | undefined,
	aliasVisited: Set<string> | null,
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
				if (isShadowFile(entry.name, lexicalParent)) {
					const lexical = lexicalParent
						? `${lexicalParent}/${entry.name}`
						: entry.name;
					findings.push({ lexical });
				}
				continue;
			}

			if (!isRealInsideRoot(realTarget, realRoot)) {
				// EXTERNAL symlink: depth-bound, global-visited. The existing
				// 63-level external-chain test must remain fast and green.
				if (visitedRealPaths.has(realTarget)) {
					continue;
				}
				visitedRealPaths.add(realTarget);

				const symlinkLexical = lexicalParent
					? `${lexicalParent}/${entry.name}`
					: entry.name;

				if (remainingDepth <= 0) {
					findings.push({
						lexical: `${symlinkLexical}/${DEPTH_OVERFLOW_MARKER}`,
					});
					continue;
				}

				try {
					await walkForShadows(
						realTarget,
						findings,
						visitedRealPaths,
						realRoot,
						remainingDepth - 1,
						symlinkLexical,
						aliasVisited,
					);
				} catch {
					// Unreadable external directory: recursion unwinds.
				}
				continue;
			}

			// Copy ancestry per internal alias route. Siblings remain distinct;
			// targets already on this route are cycles and stay skipped.
			const baseAncestry = aliasVisited ?? new Set<string>([realRoot]);
			if (baseAncestry.has(realTarget)) {
				continue;
			}
			const nextAliasVisited = new Set(baseAncestry);
			nextAliasVisited.add(realTarget);

			const symlinkLexical = lexicalParent
				? `${lexicalParent}/${entry.name}`
				: entry.name;
			await walkForShadows(
				entryAbsolute,
				findings,
				visitedRealPaths,
				realRoot,
				remainingDepth,
				symlinkLexical,
				nextAliasVisited,
			);
			continue;
		}

		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) {
				continue;
			}

			const realEntry = await realpath(entryAbsolute);

			// Build the BUILD-KIT lexical path for this subdirectory:
			// `lexicalParent/foo/` — undefined parent means root-level `foo/`.
			const childLexical = lexicalParent
				? `${lexicalParent}/${entry.name}`
				: entry.name;

			if (aliasVisited === null) {
				// Canonical (non-alias) walk: a real filesystem tree cannot
				// revisit the same real directory without a symlink, so the
				// global set only ever matters as a defensive backstop here.
				if (visitedRealPaths.has(realEntry)) {
					continue;
				}
				visitedRealPaths.add(realEntry);
				await walkForShadows(
					entryAbsolute,
					findings,
					visitedRealPaths,
					realRoot,
					remainingDepth,
					childLexical,
					null,
				);
				continue;
			}

			// Extend only this route's ancestry, never its siblings' ancestry.
			if (aliasVisited.has(realEntry)) {
				continue;
			}
			const childAliasVisited = new Set(aliasVisited);
			childAliasVisited.add(realEntry);

			await walkForShadows(
				entryAbsolute,
				findings,
				visitedRealPaths,
				realRoot,
				remainingDepth,
				childLexical,
				childAliasVisited,
			);
			continue;
		}

		// Plain file.
		if (isShadowFile(entry.name, lexicalParent)) {
			const lexical = lexicalParent
				? `${lexicalParent}/${entry.name}`
				: entry.name;
			findings.push({ lexical });
		}
	}

	return findings;
};

// Finding extras does not prove the canonical root file exists. Use `lstat`
// so a symlink or directory cannot masquerade as that regular file.
const assertCanonicalRootDockerignore = async (
	rootDir: string,
): Promise<void> => {
	const rootDockerignorePath = path.join(rootDir, '.dockerignore');
	const rootLstat = await lstat(rootDockerignorePath).catch(
		(error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			const code =
				error instanceof Error && 'code' in error ? error.code : undefined;
			if (code === 'ENOENT') {
				throw new Error(
					`missing canonical root .dockerignore at ${rootDockerignorePath} (ENOENT)`,
				);
			}
			throw new Error(
				`could not inspect canonical root .dockerignore at ${rootDockerignorePath}: ${message}`,
			);
		},
	);

	if (!rootLstat.isFile()) {
		let found = 'neither a regular file nor a directory';
		if (rootLstat.isDirectory()) {
			found = 'a directory';
		} else if (rootLstat.isSymbolicLink()) {
			found = 'a symlink';
		}
		throw new Error(
			`canonical root .dockerignore at ${rootDockerignorePath} must be a regular file, found ${found}`,
		);
	}
};

export const findDockerignoreShadows = async (
	options: { rootDir?: string } = {},
): Promise<string[]> => {
	const { rootDir = process.cwd() } = options;
	await assertCanonicalRootDockerignore(rootDir);
	const realRoot = await realpath(path.resolve(rootDir));
	const visitedRealPaths = new Set<string>([realRoot]);

	const rawFindings = await walkForShadows(
		rootDir,
		[],
		visitedRealPaths,
		realRoot,
		EXTERNAL_MAX_DEPTH,
		undefined, // no lexical prefix at the repo root level
		null, // alias walk starts inside the walk on internal symlink encounters
	);

	// Do NOT deduplicate findings by real path. The same physical file
	// reachable via distinct lexical routes emits distinct BuildKit-visible
	// paths, and the strict invariant applies to every lexical route
	// independently. The final dedupe uses lexical string, the only portable
	// identity here.
	const lexicalPaths = rawFindings.map((f) => f.lexical);
	return Array.from(new Set(lexicalPaths)).sort();
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

		const exactSubdirFindings = findings.filter(
			(file) =>
				!file.endsWith(`/${DEPTH_OVERFLOW_MARKER}`) &&
				file.endsWith('/.dockerignore'),
		);
		const overflowFindings = findings.filter((file) =>
			file.endsWith(`/${DEPTH_OVERFLOW_MARKER}`),
		);
		const replacementFindings = findings.filter(
			(file) =>
				!exactSubdirFindings.includes(file) && !overflowFindings.includes(file),
		);

		for (const file of findings) {
			console.error(`  - ${file}`);
		}

		if (replacementFindings.length > 0) {
			console.error(
				'\nDocker does NOT add exclusion files together: when a file named like <Dockerfile>.dockerignore',
			);
			console.error(
				'or a case variant of .dockerignore exists in the tree, it REPLACES the root .dockerignore for',
			);
			console.error(
				'that build entirely, silently re-introducing node_modules, dist, .turbo, .worktrees and other',
			);
			console.error(
				'excluded paths into the build context (see #1832/#1836: the api image context grew from',
			);
			console.error('15.9 MB to 21.2 MB).');
		}

		if (exactSubdirFindings.length > 0) {
			console.error(
				"\nAn exact subdirectory .dockerignore is authoritative for that subdirectory's own build",
			);
			console.error(
				'context (`docker build <subdir>` opens it instead of the root file) and re-includes',
			);
			console.error(
				'everything the root .dockerignore would have excluded. The repository contract is a single',
			);
			console.error('root .dockerignore only.');
		}

		if (overflowFindings.length > 0) {
			console.error(
				'\nAt least one symlink chain exceeded the scan depth bound: the walk could not fully resolve',
			);
			console.error(
				'it, so treat the named path as scan uncertainty, not a confirmed absence of shadows beyond it.',
			);
		}

		console.error(
			'\nDelete each file above: the repository contract allows only the root .dockerignore, so no',
		);
		console.error(
			'subdirectory .dockerignore is ever legitimate — it stays the single source of build-context',
		);
		console.error('exclusions.');
		process.exit(1);
	}

	console.log(
		'No .dockerignore shadow files: the root .dockerignore is the only one in the tree. [OK]',
	);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	await run();
}
