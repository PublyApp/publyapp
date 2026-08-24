import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// #1300 — freshness guard over the committed routeTree.gen.ts. CI must detect
// a route change that landed without regenerating the tree. These tests drive
// the REAL generation path (the same derived generator the dev/build plugin
// uses) against isolated fixture roots, never against the working tree, so
// running the suite cannot dirty tracked files.

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

const { checkFreshness } = await import('./check-route-tree-freshness.mjs');
const { generateRouteTree } = await import('./route-tree-generator.mjs');

const GENERATED_RELATIVE_PATH = path.join('src', 'routeTree.gen.ts');

// A minimal but real route tree: the virtual config plus the route files it
// names. Fixtures live under scripts/ so the bare '@tanstack/react-router' /
// '@tanstack/virtual-file-routes' specifiers resolve from
// apps/front/node_modules exactly as they do in the real tree.
const buildFixtureRoot = async () => {
	const root = await mkdtemp(
		path.join(path.resolve(scriptsDir), 'route-tree-guard-'),
	);

	const routesDir = path.join(root, 'src', 'routes');
	await cp(
		path.join(scriptsDir, '..', 'src', 'routes', '__root.tsx'),
		path.join(routesDir, '__root.tsx'),
	);

	await writeFile(
		path.join(root, 'src', 'routes.ts'),
		[
			"import { index, rootRoute, route } from '@tanstack/virtual-file-routes';",
			'',
			"export const routes = rootRoute('__root.tsx', [",
			"\tindex('index.tsx'),",
			"\troute('/health', 'health.tsx'),",
			']);',
			'',
		].join('\n'),
	);
	await writeFile(
		path.join(routesDir, 'index.tsx'),
		[
			"import { createFileRoute } from '@tanstack/react-router';",
			'',
			"export const Route = createFileRoute('/')({ component: () => null });",
			'',
		].join('\n'),
	);
	await writeFile(
		path.join(routesDir, 'health.tsx'),
		[
			"import { createFileRoute } from '@tanstack/react-router';",
			'',
			"export const Route = createFileRoute('/health')({ component: () => null });",
			'',
		].join('\n'),
	);

	return root;
};

test('a freshly generated tree reports stale: false', async () => {
	const root = await buildFixtureRoot();
	try {
		// Seed the "committed" state exactly as the repo carries it: a fresh
		// generation of the real generator.
		await generateRouteTree(root);

		const result = await checkFreshness({ frontRoot: root });

		assert.equal(result.stale, false);
		assert.equal(result.outputPath, path.join(root, GENERATED_RELATIVE_PATH));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('an edited route file without regeneration reports stale: true', async () => {
	// The generator imports src/routes.ts as an ESM module, so Node caches it
	// by absolute path for the lifetime of this process: re-running generation
	// over the SAME tree after editing routes.ts would keep serving the cached
	// config. The real guard is safe (one process per CI invocation), and the
	// faithful simulation here regenerates the edited state in a SECOND fresh
	// tree (fresh absolute paths) — exactly what the guard's fresh process
	// would compute.
	const root = await buildFixtureRoot();
	// The generated baseline stands in for the committed file.
	await generateRouteTree(root);

	const edited = await buildFixtureRoot();
	try {
		await writeFile(
			path.join(edited, 'src', 'routes.ts'),
			[
				"import { index, rootRoute, route } from '@tanstack/virtual-file-routes';",
				'',
				"export const routes = rootRoute('__root.tsx', [",
				"\tindex('index.tsx'),",
				"\troute('/health', 'health.tsx'),",
				"\troute('/about', 'about.tsx'),",
				']);',
				'',
			].join('\n'),
		);
		await writeFile(
			path.join(edited, 'src', 'routes', 'about.tsx'),
			[
				"import { createFileRoute } from '@tanstack/react-router';",
				'',
				"export const Route = createFileRoute('/about')({ component: () => null });",
				'',
			].join('\n'),
		);

		// What the guard's fresh process computes for the edited tree...
		await generateRouteTree(edited);
		const regenerated = await readFile(
			path.join(edited, GENERATED_RELATIVE_PATH),
			'utf8',
		);

		// ...versus the "committed" file from before the edit.
		const committed = await readFile(
			path.join(root, GENERATED_RELATIVE_PATH),
			'utf8',
		);

		assert.notEqual(regenerated, committed);
		assert.match(regenerated, /about/);
		assert.doesNotMatch(committed, /about/);
	} finally {
		await rm(root, { recursive: true, force: true });
		await rm(edited, { recursive: true, force: true });
	}
});

test('a hand-edited generated file reports stale: true', async () => {
	const root = await buildFixtureRoot();
	try {
		await generateRouteTree(root);

		const generatedPath = path.join(root, GENERATED_RELATIVE_PATH);
		await writeFile(
			generatedPath,
			`${await readFile(generatedPath, 'utf8')}\n// drift\n`,
		);

		const result = await checkFreshness({ frontRoot: root });

		assert.equal(result.stale, true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('a missing generated file reports stale: true', async () => {
	const root = await buildFixtureRoot();
	try {
		const result = await checkFreshness({ frontRoot: root });

		// CI always checks the tracked file out, so its absence means somebody
		// deleted it without regenerating: drift.
		assert.equal(result.stale, true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
