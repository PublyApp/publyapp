import { opendir, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Guard: forbid a `.dockerignore` file in a subdirectory of the repository
// root (#1891, follow-up of #1849 / #1873).
//
// WHAT THIS PROVES
// ----------------
// The shadow-detection guard (`check-dockerignore-shadow`) forbids every file
// whose basename ends with `.dockerignore` case-insensitively but is not
// exactly `.dockerignore` — `<Dockerfile>.dockerignore`, `Dockerfile.prod.
// dockerignore`, `Dockerfile.DockerIgnore`, `DockerIgnore` (dotfile case
// variant), and any nested case variant of those. It explicitly ALLOWS
// `.dockerignore` (the canonical root file) and a subdirectory `.dockerignore`
// (BuildKit's additive sub-context feature).
//
// The subdirectory `.dockerignore` IS in the same family as the shadow file.
// It creates a divergence between two build contexts of the same source:
//   * `docker build .` (root context) — Docker ignores `sub/.dockerignore`
//     entirely. It is just a stray file in the build context (verified by
//     probe: with `sub/.dockerignore = node_modules`, a `COPY .` from the
//     root copies the file but does not exclude anything from inside `sub/`).
//   * `docker build sub/` (sub context) — BuildKit reads `sub/.dockerignore`
//     and applies its patterns additively on top of any parent `.dockerignore`
//     it might find (verified by probe: with `sub/.dockerignore = node_modules`,
//     a `COPY .` from `sub/` excludes `sub/node_modules/secret/index.js`).
//
// Two different exclusion sets for the same source = silent context
// divergence, the exact defect #1849 names.
//
// The defect differs from the shadow file in mechanism, not in nature:
//   * shadow file    — REPLACES the root .dockerignore for its build.
//   * subdirectory   — ADDS to the root file for its build, INERT otherwise.
// Same effect from the user's perspective (silent context divergence).
//
// WHY THIS GUARD EXISTS AS A SEPARATE SCRIPT
// ------------------------------------------
// `check-dockerignore-shadow` deliberately exempts the canonical
// `sub/.dockerignore` — flipping its behaviour to flag the file would change
// the existing guard's contract and break legitimate BuildKit uses (e.g.,
// `apps/front/.dockerignore` narrowing the front build context). A separate
// guard gives the team a single place to look when the divergence is
// unacceptable without invalidating the shadow-detection contract.
//
// WIRED BY
// --------
// quality-gate.yml::no-subdir-dockerignore  (run unconditionally on every PR;
//       mirrors `just ci-no-subdir-dockerignore`).
//
// See issue #1891.

// Directories the daemon can never read dockerignore files from, at any
// depth: `.git` is tool metadata outside any build context, and
// `node_modules` is excluded from every build context by the root
// `.dockerignore`. Skipping both removes false-positive sources while losing
// zero protection.
const SKIP_DIRS = new Set(['.git', 'node_modules']);

export const findSubdirDockerignores = async (
	options: { rootDir?: string } = {},
): Promise<string[]> => {
	const { rootDir = process.cwd() } = options;
	const realRoot = await realpath(path.resolve(rootDir));

	const findings: string[] = [];

	const walk = async (
		currentDir: string,
		lexicalParent: string | undefined,
	) => {
		const directory = await opendir(currentDir);

		for await (const entry of directory) {
			if (SKIP_DIRS.has(entry.name)) {
				continue;
			}

			const entryAbsolute = path.join(currentDir, entry.name);

			if (entry.isDirectory()) {
				const childLexical = lexicalParent
					? `${lexicalParent}/${entry.name}`
					: entry.name;
				await walk(entryAbsolute, childLexical);
				continue;
			}

			if (entry.isSymbolicLink()) {
				continue;
			}

			// Exact basename only — case variants are NOT in scope here:
			// case-insensitive acquisition is `check-dockerignore-shadow`'s
			// job. If `.DockerIgnore` lives in `apps/api/`, that guard flags
			// it. This guard flags only `apps/api/.dockerignore` exactly.
			if (entry.name === '.dockerignore' && lexicalParent !== undefined) {
				findings.push(
					lexicalParent ? `${lexicalParent}/${entry.name}` : entry.name,
				);
			}
		}
	};

	await walk(realRoot, undefined);
	findings.sort();
	return findings;
};

const run = async () => {
	let findings: string[];

	try {
		findings = await findSubdirDockerignores({ rootDir: process.cwd() });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			'[no-subdir-dockerignore] could not scan the repository tree — failing loud instead of reporting "nothing to flag".',
		);
		console.error(`  Cause: ${message}`);
		console.error(
			'  Action: run from the repository root and check the tree is readable.',
		);
		process.exit(1);
	}

	if (findings.length > 0) {
		console.error(
			'Found .dockerignore file(s) outside the repository root (#1891):',
		);

		for (const file of findings) {
			console.error(`  - ${file}`);
		}

		console.error(
			'\nDocker treats a subdirectory `.dockerignore` as INERT when the build context is',
		);
		console.error(
			'the repository root, but ACTIVE when the build context is that subdirectory',
		);
		console.error(
			'(BuildKit additive sub-context feature). Two different contexts of the same source',
		);
		console.error(
			'therefore build with two different exclusion sets — the same context divergence',
		);
		console.error(
			'as `<Dockerfile>.dockerignore` shadows. Delete the file (the simplest fix) or move',
		);
		console.error(
			'the patterns into the root `.dockerignore` so every context excludes the same paths.',
		);
		process.exit(1);
	}

	console.log(
		'No .dockerignore file outside the repository root: every build context excludes the same paths. [OK]',
	);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	await run();
}
