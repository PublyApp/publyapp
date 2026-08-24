import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
// Standalone route-tree regeneration + freshness guard, mirroring what
// tanstackStart's router plugin does at dev/build time
// (virtualRouteConfig: ./src/routes.ts).
//
// CLI usage:
//   node scripts/route-tree-generator.mjs            # regenerate routeTree.gen.ts
//   node scripts/route-tree-generator.mjs --check    # guard mode (CI): exit 1 if stale
//
// Library usage (tests):
//   generateRouteTree(root)                          # regenerate into any root
//   checkRouteTreeFreshness()                        # guard as a boolean result
//   resolveGeneratorEntryUrl()                       # the derived generator entry
//
// #1300 — the generator used to be pinned by exact version and store path.
// It is now DERIVED through normal Node module resolution along the chain
// front actually declares:
//
//   @tanstack/react-start  (direct dependency)
//     └─ @tanstack/start-plugin-core  (its dependency — owns the router Vite plugin)
//          └─ @tanstack/router-generator  (the plugin's generator)
//
// A lockfile bump of @tanstack/react-start therefore automatically moves this
// script to the matching start-plugin-core and its matching generator — no
// hardcoded version left to drift or break.
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let cachedGeneratorUrl;

/**
 * Resolves @tanstack/router-generator through normal module resolution,
 * starting from the @tanstack/react-start package front already depends on.
 * Each hop uses a require scoped to the resolved package, so pnpm's isolated
 * node_modules are honoured exactly like at dev/build time.
 *
 * @returns {string} file:// URL of the installed generator's ESM entry.
 */
export const resolveGeneratorEntryUrl = () => {
	if (cachedGeneratorUrl) {
		return cachedGeneratorUrl;
	}

	const reactStartUrl = import.meta.resolve('@tanstack/react-start');
	const requireFromReactStart = createRequire(reactStartUrl);

	let startPluginCorePackageUrl;
	try {
		startPluginCorePackageUrl = requireFromReactStart.resolve(
			'@tanstack/start-plugin-core/package.json',
		);
	} catch {
		// Older plugin layouts may not expose ./package.json; resolving the
		// package root still anchors createRequire inside the right tree.
		startPluginCorePackageUrl = requireFromReactStart.resolve(
			'@tanstack/start-plugin-core',
		);
	}

	const requireFromStartPluginCore = createRequire(startPluginCorePackageUrl);
	const generatorEntry = requireFromStartPluginCore.resolve(
		'@tanstack/router-generator',
	);

	cachedGeneratorUrl = generatorEntry.startsWith('file:')
		? generatorEntry
		: pathToFileURL(generatorEntry).toString();

	return cachedGeneratorUrl;
};

/**
 * Loads { Generator, getConfig } from the derived generator entry.
 */
export const loadRouteTreeGenerator = async () =>
	import(resolveGeneratorEntryUrl());

const GENERATOR_CONFIG_OVERRIDES = {
	virtualRouteConfig: './src/routes.ts',
	routeFileIgnorePrefix: '-',
};

const ROUTE_TREE_OUTPUT_PATH = 'src/routeTree.gen.ts';

const isCli = () =>
	Boolean(process.argv[1]) &&
	pathToFileURL(process.argv[1]).href === import.meta.url;

/**
 * Regenerates src/routeTree.gen.ts for the given front root (defaults to the
 * real apps/front tree this script lives in).
 *
 * @param {string} [root] absolute path of the front root whose routes are generated.
 * @returns {Promise<string>} absolute path of the written routeTree.gen.ts.
 */
export const generateRouteTree = async (root) => {
	const { Generator, getConfig } = await loadRouteTreeGenerator();

	const effectiveRoot = root ?? new URL('..', import.meta.url).pathname;

	const config = await getConfig(
		{ ...GENERATOR_CONFIG_OVERRIDES },
		effectiveRoot,
	);

	const generator = new Generator({
		config,
		root: effectiveRoot,
	});
	await generator.run();

	return `${effectiveRoot}/${ROUTE_TREE_OUTPUT_PATH}`;
};

/**
 * Freshness guard: regenerates the committed route tree in place and reports
 * whether the working-tree copy changed. `git checkout -- <file>` afterwards
 * restores the committed content either way, so running the guard never
 * mutates tracked state.
 *
 * @returns {Promise<{stale: boolean, outputPath: string}>}
 */
export const checkRouteTreeFreshness = async () => {
	const root = new URL('..', import.meta.url).pathname;
	const outputPath = `${root}${ROUTE_TREE_OUTPUT_PATH}`;

	const before = await readFile(outputPath, 'utf8');

	await generateRouteTree(root);

	let after;
	try {
		after = await readFile(outputPath, 'utf8');
	} catch (error) {
		return { stale: true, outputPath };
	}

	return { stale: before !== after, outputPath };
};

if (isCli()) {
	if (process.argv.includes('--check')) {
		const { stale, outputPath } = await checkRouteTreeFreshness();

		if (!stale) {
			console.log('routeTree.gen.ts is up to date');
			process.exit(0);
		}

		const repoRelative = path.relative(process.cwd(), outputPath) || outputPath;
		spawnSync('git', ['checkout', '--', repoRelative], {
			cwd: process.cwd(),
			stdio: 'inherit',
		});
		console.error(
			[
				'routeTree.gen.ts is STALE.',
				'Regenerate it with: just db-route-tree  (or: pnpm --filter front generate:route-tree)',
				'The committed file was restored; fix the drift before committing.',
			].join('\n'),
		);
		process.exit(1);
	}

	await generateRouteTree();
	console.log('routeTree.gen.ts regenerated');
}
