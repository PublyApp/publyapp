import { opendir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

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
// The guard interrogates the REAL working tree (the same filesystem a build
// context is drawn from): it walks every directory and flags each file whose
// basename ends with `.dockerignore` but is not exactly `.dockerignore`. A
// `.dockerignore` whose basename is exactly that (root or in a subdirectory)
// is never a shadow file, so it stays green — subdirectory `.dockerignore`
// files are a separate, additive BuildKit feature and cannot replace the
// root file. Files inside `.git` and `node_modules` are out of scope
// (`node_modules` is always excluded from every build context by the root
// `.dockerignore`, so a third-party package can never shadow it).
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
	name !== '.dockerignore' && name.endsWith('.dockerignore');

const walkForShadows = async (
	rootDir: string,
	currentDir: string,
	findings: string[],
): Promise<string[]> => {
	const directory = await opendir(currentDir);

	for await (const entry of directory) {
		if (entry.isDirectory() && !entry.isSymbolicLink()) {
			if (SKIP_DIRS.has(entry.name)) {
				continue;
			}

			await walkForShadows(
				rootDir,
				path.join(currentDir, entry.name),
				findings,
			);
			continue;
		}

		if (isShadowFile(entry.name)) {
			findings.push(
				toPosixPath(path.relative(rootDir, path.join(currentDir, entry.name))),
			);
		}
	}

	return findings;
};

export const findDockerignoreShadows = async (
	options: { rootDir?: string } = {},
): Promise<string[]> => {
	const { rootDir = process.cwd() } = options;
	const findings = await walkForShadows(rootDir, rootDir, []);

	return findings.sort();
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
