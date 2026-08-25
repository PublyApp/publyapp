// Freshness guard for the committed routeTree.gen.ts (#1300).
//
// Regenerates the route tree through the SAME derived generator the dev/build
// plugin uses (see route-tree-generator.mts) and reports whether the result
// differs from what is on disk. The check runs against an explicit root, so
// tests can exercise real generation in isolated fixture roots.
//
// CLI usage:
//   node scripts/generate/check-route-tree-freshness.mts    # guard apps/front
//
// Exit codes: 0 = fresh, 1 = stale or broken. On staleness the generated
// file is restored to its pre-check content, so running the guard never
// leaves tracked-file churn behind.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { generateRouteTree } from './route-tree-generator.mts';

const GENERATED_RELATIVE_PATH = path.join('src', 'routeTree.gen.ts');

// During `vite build` and `vitest run`, @tanstack/start-plugin-core appends
// an ephemeral module-registration footer to routeTree.gen.ts (see its
// start-router-plugin/route-tree-footer.js) and never commits it — this repo
// declares the same `interface Register` in src/router.tsx. CI's "Build front"
// step runs BEFORE "Test front", so the on-disk file can legitimately carry
// this suffix whenever the guard executes; it is stripped from both sides
// before comparing so toolchain churn never reads as drift (and only exact
// suffix matches are stripped, so substantive edits stay detected).
const PLUGIN_FOOTER_PATTERN =
	/\n*import type \{ getRouter \} from '[^'\r\n]*'\r?\nimport type \{ createStart \} from '@tanstack\/[a-z]+-start'\r?\ndeclare module '@tanstack\/[a-z]+-start' \{\r?\n {2}interface Register \{\r?\n {4}ssr: true\r?\n {4}router: Awaited<ReturnType<typeof getRouter>>\r?\n {2}\}\r?\n\}\s*$/;

const stripPluginFooter = (content: string): string =>
	content.replace(PLUGIN_FOOTER_PATTERN, '');

const frontRootFromHere = (): string =>
	path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const checkFreshness = async ({
	frontRoot,
}: {
	frontRoot?: string;
} = {}): Promise<{
	stale: boolean;
	outputPath: string;
	contentBefore: string | null;
}> => {
	const root = frontRoot ?? frontRootFromHere();
	const outputPath = path.join(root, GENERATED_RELATIVE_PATH);

	let contentBefore;
	try {
		contentBefore = await readFile(outputPath, 'utf8');
	} catch {
		// A missing generated file IS drift (CI checks out it as a tracked
		// file); nothing to restore.
		return { stale: true, outputPath, contentBefore: null };
	}

	await generateRouteTree(root);

	let after;
	try {
		after = await readFile(outputPath, 'utf8');
	} catch {
		// The generator removed or failed to rewrite the file; treat any such
		// outcome as drift rather than quietly reporting fresh.
		return { stale: true, outputPath, contentBefore };
	}

	// The pattern consumes the leading blank line(s) it anchors on, so strip
	// then ignore trailing whitespace on BOTH sides: an end-of-file newline is
	// formatting, not route drift.
	const normalized = (content: string): string =>
		stripPluginFooter(content).trimEnd();
	return {
		stale: normalized(after) !== normalized(contentBefore),
		outputPath,
		contentBefore,
	};
};

const isCli = () =>
	Boolean(process.argv[1]) &&
	pathToFileURL(process.argv[1]).href === import.meta.url;

if (isCli()) {
	const { writeFile } = await import('node:fs/promises');

	const { stale, outputPath, contentBefore } = await checkFreshness();

	if (!stale) {
		console.log('routeTree.gen.ts is up to date');
	} else {
		// Restore the pre-check content so a CI run (or a local developer who
		// runs the guard out of curiosity) never sees working-tree churn from
		// the check itself. A missing file has nothing to restore. `git` is
		// deliberately NOT invoked here — restoring bytes we just read needs
		// no VCS, works from tarballs, and cannot clobber anything except the
		// file this guard owns.
		if (typeof contentBefore === 'string') {
			await writeFile(outputPath, contentBefore);
		}
		console.error(
			[
				'routeTree.gen.ts is STALE.',
				'Regenerate it with: pnpm --filter front generate:route-tree',
				'The committed file has been restored; fix the drift before committing.',
			].join('\n'),
		);
		process.exitCode = 1;
	}
}
