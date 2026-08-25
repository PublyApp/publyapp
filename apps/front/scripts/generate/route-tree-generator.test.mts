import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// #1300 — the standalone route-tree regeneration script used to pin
// `@tanstack/router-generator@1.167.17` straight out of the pnpm store. That
// path is correct until the next TanStack bump silently breaks or, worse,
// keeps regenerating with a stale copy. These tests pin the replacement
// contract: the generator is DERIVED through normal Node module resolution
// from the packages front actually declares (`@tanstack/react-start` → its
// `@tanstack/start-plugin-core` dependency → that plugin's
// `@tanstack/router-generator` dependency), so a lockfile bump automatically
// moves the script to the matching generator.

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

const { generateRouteTree, loadRouteTreeGenerator, resolveGeneratorEntryUrl } =
	await import('./route-tree-generator.mts');

test('resolveGeneratorEntryUrl derives the generator from @tanstack/react-start via normal module resolution', () => {
	const url = resolveGeneratorEntryUrl();

	assert.match(url, /^file:/, 'resolved entry must be a file:// URL');
	assert.match(
		url,
		/@tanstack[+]router-generator@[0-9][^/]*\/node_modules\/@tanstack\/router-generator\/dist\//,
		'resolved entry must live inside the installed @tanstack/router-generator package',
	);
});

test('the resolved generator is the exact copy start-plugin-core declares', async () => {
	// Independent re-derivation: walk the same dependency chain through
	// createRequire and compare. If the script ever resolves a stray second
	// copy of router-generator (version skew against the Vite plugin), the
	// dev/build-time generation and this script would disagree — that split
	// is precisely the bug class #1300 closes.
	const { createRequire } = await import('node:module');

	const reactStartUrl = import.meta.resolve('@tanstack/react-start');
	const reqStart = createRequire(reactStartUrl);
	const pluginCorePkgUrl = reqStart.resolve(
		'@tanstack/start-plugin-core/package.json',
	);
	const reqPlugin = createRequire(pluginCorePkgUrl);
	const expectedUrl = reqPlugin.resolve('@tanstack/router-generator');

	assert.equal(
		resolveGeneratorEntryUrl(),
		expectedUrl.startsWith('file:') ? expectedUrl : `file://${expectedUrl}`,
	);
});

test('the module source no longer hardcodes a store path or pinned generator version', async () => {
	const source = await readFile(
		path.join(scriptsDir, 'route-tree-generator.mts'),
		'utf8',
	);

	assert.doesNotMatch(
		source,
		/node_modules\/\.pnpm/,
		'script must not reference pnpm store internals',
	);
	assert.doesNotMatch(
		source,
		/router-generator@\d/,
		'script must not pin a generator version',
	);
});

test('loadRouteTreeGenerator exposes the Generator/getConfig API', async () => {
	const mod = await loadRouteTreeGenerator();

	assert.equal(typeof mod.Generator, 'function');
	assert.equal(typeof mod.getConfig, 'function');
});

test('resolveGeneratorEntryUrl is stable across calls', () => {
	assert.equal(resolveGeneratorEntryUrl(), resolveGeneratorEntryUrl());
});

test('generateRouteTree writes a non-empty routeTree.gen.ts into an isolated fixture root', async () => {
	const { cp, mkdtemp, rm } = await import('node:fs/promises');

	const scratch = await mkdtemp(
		path.join(path.resolve(scriptsDir), 'route-tree-fixture-'),
	);
	try {
		// A minimal but REAL route tree: the virtual config plus the two route
		// files it names. The fixture lives under scripts/ so the bare
		// '@tanstack/react-router' / '@tanstack/virtual-file-routes' specifiers
		// inside these files resolve from apps/front/node_modules exactly the
		// way the real tree does.
		await mkdirp(path.join(scratch, 'src/routes'));
		await cp(
			path.join(scriptsDir, '..', '..', 'src', 'routes', '__root.tsx'),
			path.join(scratch, 'src/routes/__root.tsx'),
		);
		await writeFile(
			path.join(scratch, 'src/routes.ts'),
			[
				"import { index, rootRoute, route } from '@tanstack/virtual-file-routes';",
				'',
				"export const routes = rootRoute('__root.tsx', [",
				"	index('index.tsx'),",
				"	route('/health', 'health.tsx'),",
				']);',
				'',
			].join('\n'),
		);
		await writeFile(
			path.join(scratch, 'src/routes/index.tsx'),
			[
				"import { createFileRoute } from '@tanstack/react-router';",
				'',
				"export const Route = createFileRoute('/')({ component: () => null });",
				'',
			].join('\n'),
		);
		await writeFile(
			path.join(scratch, 'src/routes/health.tsx'),
			[
				"import { createFileRoute } from '@tanstack/react-router';",
				'',
				"export const Route = createFileRoute('/health')({ component: () => null });",
				'',
			].join('\n'),
		);

		const generatedPath = await generateRouteTree(scratch);
		const generated = await readFile(generatedPath, 'utf8');

		assert.match(
			generated,
			/routeApi|createFileRoute|Route as healthRouteImport/,
		);
		assert.ok(generated.length > 0, 'generated file must not be empty');
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
});

async function mkdirp(dir: string): Promise<void> {
	const { mkdir } = await import('node:fs/promises');
	await mkdir(dir, { recursive: true });
}

async function writeFile(file: string, contents: string): Promise<void> {
	const fs = await import('node:fs/promises');
	await fs.writeFile(file, contents);
}
