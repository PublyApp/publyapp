// Standalone routeTree regeneration, mirroring what tanstackStart's router
// plugin does at dev/build time (virtualRouteConfig: ./src/routes.ts).
// Run: node scripts/generate-route-tree.mjs
import { pathToFileURL } from 'node:url';

// The generator is a transitive dep of @tanstack/react-start, not a direct
// dependency of front — resolve it from the pnpm store so this script does
// not add a package.json entry.
const generatorPath = pathToFileURL(
	new URL(
		'../../../node_modules/.pnpm/@tanstack+router-generator@1.167.17/node_modules/@tanstack/router-generator/dist/esm/index.js',
		import.meta.url,
	).pathname,
).toString();

const { Generator, getConfig } = await import(generatorPath);

const root = new URL('..', import.meta.url).pathname;

const config = await getConfig(
	{
		virtualRouteConfig: './src/routes.ts',
		routeFileIgnorePrefix: '-',
	},
	root,
);

const generator = new Generator({
	config,
	root,
});
await generator.run();

console.log('routeTree.gen.ts regenerated');
