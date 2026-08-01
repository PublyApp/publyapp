import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
	contextChunkIsolationPlugin,
	findContextChunkIsolationViolations,
	findReactContextDeclarations,
} from './check-context-chunk-isolation.mjs';

const frontDirectory = path.resolve(import.meta.dirname, '..');
const execFileAsync = promisify(execFile);

const createFixture = async (files) => {
	const fixtureDirectory = await mkdtemp(
		path.join(os.tmpdir(), 'publy-context-isolation-fixture-'),
	);

	await writeFile(
		path.join(fixtureDirectory, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				jsx: 'react-jsx',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				noEmit: true,
				target: 'ES2022',
			},
			include: ['src/**/*.ts', 'src/**/*.tsx'],
		}),
	);
	await mkdir(path.join(fixtureDirectory, 'node_modules', '@types'), {
		recursive: true,
	});
	await Promise.all([
		symlink(
			path.join(frontDirectory, 'node_modules', 'react'),
			path.join(fixtureDirectory, 'node_modules', 'react'),
			'dir',
		),
		symlink(
			path.join(frontDirectory, 'node_modules', '@types', 'react'),
			path.join(fixtureDirectory, 'node_modules', '@types', 'react'),
			'dir',
		),
	]);

	for (const [relativePath, source] of Object.entries(files)) {
		const filePath = path.join(fixtureDirectory, relativePath);
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, source);
	}

	return fixtureDirectory;
};

const buildRouteFixture = async ({
	files,
	groupProbeModules = false,
	inventory,
	rootImportsProbe = false,
}) => {
	const fixtureDirectory = await createFixture({
		'vite.config.mjs': `
			import path from 'node:path';
			import { writeFileSync } from 'node:fs';
			import { defineConfig } from 'vite';
			import { tanstackStart } from '@tanstack/react-start/plugin/vite';
			import viteReact from '@vitejs/plugin-react';
			import { contextChunkIsolationPlugin } from ${JSON.stringify(
				path.join(frontDirectory, 'scripts/check-context-chunk-isolation.mjs'),
			)};

			const rootDirectory = import.meta.dirname;
			export default defineConfig({
				${
					groupProbeModules
						? "build: { rolldownOptions: { output: { advancedChunks: { groups: [{ name: 'probe-pair', test: /src[\\/]routes[\\/]probe\\.tsx/ }] } } } },"
						: ''
				}
				plugins: [
					{ applyToEnvironment: (environment) => environment.name === 'client', generateBundle(_options, bundle) { writeFileSync(path.join(rootDirectory, 'bundle-map.json'), JSON.stringify(Object.values(bundle).filter((output) => output.type === 'chunk').map((chunk) => ({ fileName: chunk.fileName, modules: Object.fromEntries(Object.entries(chunk.modules).map(([id, rendered]) => [id, rendered.code])) })), null, 2)); } },
					contextChunkIsolationPlugin({
						contextInventory: ${JSON.stringify(inventory)},
						tsconfigPath: path.join(rootDirectory, 'tsconfig.json'),
						workspaceDirectory: rootDirectory,
					}),
					tanstackStart({
						srcDirectory: 'src',
						router: { virtualRouteConfig: './src/routes.ts' },
					}),
					viteReact(),
				],
			});
		`,
		'src/routes.ts': `
			import { rootRoute, route } from '@tanstack/virtual-file-routes';
			export const routes = rootRoute('__root.tsx', [route('/probe', 'probe.tsx')]);
		`,
		'src/routes/__root.tsx': rootImportsProbe
			? `
				import { Outlet, createRootRoute } from '@tanstack/react-router';
				import { useProbe } from './probe';
				import { FourthContext, SecondContext, ThirdContext } from '../contexts';
				const Root = () => <SecondContext.Provider value={null}><ThirdContext.Provider value={null}><FourthContext.Provider value={null}><Outlet /><span>{String(useProbe)}</span></FourthContext.Provider></ThirdContext.Provider></SecondContext.Provider>;
				export const Route = createRootRoute({ component: Root });
			`
			: `
				import { Outlet, createRootRoute } from '@tanstack/react-router';
				import { FourthContext, SecondContext, ThirdContext } from '../contexts';
				const Root = () => <SecondContext.Provider value={null}><ThirdContext.Provider value={null}><FourthContext.Provider value={null}><Outlet /></FourthContext.Provider></ThirdContext.Provider></SecondContext.Provider>;
				export const Route = createRootRoute({ component: Root });
			`,
		'src/contexts.tsx': `
			import { createContext } from 'react';
			export const SecondContext = createContext(null);
			export const ThirdContext = createContext(null);
			export const FourthContext = createContext(null);
		`,
		'src/router.tsx': `
			import { createRouter } from '@tanstack/react-router';
			import { routeTree } from './routeTree.gen';
			export const getRouter = () => createRouter({ routeTree });
		`,
		'src/client.tsx': `
			import { RouterProvider } from '@tanstack/react-router';
			import { hydrateStart } from '@tanstack/react-start/client';
			import { hydrateRoot } from 'react-dom/client';
			void hydrateStart().then((router) => hydrateRoot(document, <RouterProvider router={router} />));
		`,
		...files,
	});

	for (const packageName of ['@tanstack', '@vitejs', 'react-dom', 'vite']) {
		const sourcePath = path.join(frontDirectory, 'node_modules', packageName);
		const targetPath = path.join(fixtureDirectory, 'node_modules', packageName);
		await rm(targetPath, { force: true, recursive: true });
		await symlink(sourcePath, targetPath, 'dir');
	}

	try {
		await execFileAsync(
			process.execPath,
			[path.join(frontDirectory, 'node_modules/vite/bin/vite.js'), 'build'],
			{ cwd: fixtureDirectory },
		);
		return {
			fixtureDirectory,
			output: '',
			status: 0,
			trace: await readFile(
				path.join(fixtureDirectory, 'bundle-map.json'),
				'utf8',
			),
		};
	} catch (error) {
		return {
			fixtureDirectory,
			output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
			status: error.code ?? 1,
			trace: await readFile(
				path.join(fixtureDirectory, 'bundle-map.json'),
				'utf8',
			).catch(() => ''),
		};
	}
};

void test('resolves React createContext through every supported import and type form', async () => {
	const fixtureDirectory = await createFixture({
		'src/aliased-import.ts': `
			import { createContext as makeContext } from 'react';
			export const AliasedImportContext = makeContext(null);
		`,
		'src/react-barrel.ts': `
			export { createContext as makeBrandedContext } from 'react';
		`,
		'src/re-exported-alias.ts': `
			import { makeBrandedContext } from './react-barrel';
			export const ReExportedAliasContext = makeBrandedContext(null);
		`,
		'src/element-access.ts': `
			import * as React from 'react';
			export const ElementAccessContext = React['createContext'](null);
		`,
		'src/value-alias.ts': `
			import * as React from 'react';
			const makeContext = React.createContext;
			export const ValueAliasContext = makeContext(null);
		`,
		'src/bound-alias.ts': `
			import * as React from 'react';
			const makeBoundContext = React.createContext.bind(React);
			export const BoundAliasContext = makeBoundContext(null);
		`,
		'src/indirect-delivery.ts': `
			import * as React from 'react';
			const passThrough = <T,>(value: T) => value;
			const makeIndirectContext = passThrough(React.createContext);
			export const IndirectDeliveryContext = makeIndirectContext(null);
		`,
		'src/function-generic.ts': `
			import { createContext } from 'react';
			export const FunctionGenericContext = createContext<((x: string) => void) | undefined>(undefined);
		`,
		'src/nested-generic.ts': `
			import { createContext } from 'react';
			type Foo<T> = { value: T };
			type Bar = string;
			export const NestedGenericContext = createContext<Foo<Bar> | null>(null);
		`,
		'src/conditional-generic.ts': `
			import { createContext } from 'react';
			type A = { kind: 'a' };
			type B = { kind: 'b' };
			type T = string;
			export const ConditionalGenericContext = createContext<T extends string ? A : B>({ kind: 'a' });
		`,
		'src/two-contexts.ts': `
			import { createContext } from 'react';
			export const FirstContext = createContext(null);
			export const SecondContext = createContext(null);
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);

		const contextNames = new Set(contexts.map((context) => context.name));
		for (const expectedName of [
			'AliasedImportContext',
			'BoundAliasContext',
			'ConditionalGenericContext',
			'ElementAccessContext',
			'FirstContext',
			'FunctionGenericContext',
			'NestedGenericContext',
			'ReExportedAliasContext',
			'SecondContext',
			'ValueAliasContext',
			'<React.createContext factory value>',
		]) {
			assert.equal(contextNames.has(expectedName), true, expectedName);
		}
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('discovers React contexts from shorthand destructuring and shorthand object properties', async () => {
	const fixtureDirectory = await createFixture({
		'src/destructured.ts': `
			import * as React from 'react';
			const { createContext } = React;
			export const DestructuredContext = createContext<string | null>(null);
		`,
		'src/dynamic-import-destructured.ts': `
			const { createContext } = await import('react');
			export const DynamicImportDestructuredContext = createContext(null);
		`,
		'src/nested-destructured.ts': `
			import * as React from 'react';
			export const make = () => {
				const { createContext } = React;
				return createContext(null);
			};
		`,
		'src/react-api.ts': `
			import { createContext } from 'react';
			export const reactApi = { createContext };
		`,
		'src/object-hop.ts': `
			import { reactApi } from './react-api';
			export const ObjectHopContext = reactApi.createContext(null);
		`,
		'src/explicit-react-api.ts': `
			import * as React from 'react';
			export const explicitReactApi = { createContext: React.createContext };
		`,
		'src/explicit-object-hop.ts': `
			import { explicitReactApi } from './explicit-react-api';
			export const ExplicitObjectHopContext = explicitReactApi.createContext(null);
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		for (const sourceFile of [
			'src/destructured.ts',
			'src/dynamic-import-destructured.ts',
			'src/nested-destructured.ts',
			'src/object-hop.ts',
			'src/explicit-object-hop.ts',
		]) {
			assert.equal(
				contexts.some(
					(context) =>
						context.sourceFile === path.join(fixtureDirectory, sourceFile),
				),
				true,
				sourceFile,
			);
		}
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('discovers contexts minted through a cross-file factory', async () => {
	const fixtureDirectory = await createFixture({
		'src/make-context.ts': `
			import { createContext } from 'react';
			export const createStrictContext = <T,>(fallback: T) => createContext(fallback);
		`,
		'src/wrapper-consumer.tsx': `
			import { createStrictContext } from './make-context';
			export const ProbeContext = createStrictContext<null>(null);
		`,
		'src/passthrough-consumer.tsx': `
			import { createStrictContext } from './make-context';
			const passThrough = <T,>(value: T) => value;
			export const SecondContext = passThrough(createStrictContext(null));
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		const nameInSourceFile = (name, relativeSourceFile) =>
			contexts.some(
				(context) =>
					context.name === name &&
					context.sourceFile ===
						path.join(fixtureDirectory, relativeSourceFile),
			);
		assert.equal(
			nameInSourceFile('ProbeContext', 'src/wrapper-consumer.tsx'),
			true,
		);
		assert.equal(
			nameInSourceFile('SecondContext', 'src/passthrough-consumer.tsx'),
			true,
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('discovers contexts minted through a factory whose return type is a branded Context subtype', async () => {
	const fixtureDirectory = await createFixture({
		'src/make-context.ts': `
			import { createContext } from 'react';
			export interface StrictContext<T> extends Context<T> { readonly strict: true; }
			export const createStrictContext = <T,>(fallback: T): StrictContext<T> =>
				Object.assign(createContext(fallback), { strict: true as const });
		`,
		'src/wrapper-consumer.tsx': `
			import { createStrictContext } from './make-context';
			export const ProbeContext = createStrictContext<null>(null);
		`,
		'src/deeper-consumer.tsx': `
			import { createStrictContext } from './make-context';
			import type { StrictContext } from './make-context';
			export interface DeeperContext<T> extends StrictContext<T> { readonly deeper: true; }
			export const DeeperContextValue = createStrictContext(null) as DeeperContext<null>;
		`,
		'src/alias-consumer.tsx': `
			import { createStrictContext } from './make-context';
			import type { StrictContext } from './make-context';
			type StrictAlias = StrictContext<string>;
			export const AliasedStrict = createStrictContext<string>('x') as StrictAlias;
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		const nameInSourceFile = (name, relativeSourceFile) =>
			contexts.some(
				(context) =>
					context.name === name &&
					context.sourceFile ===
						path.join(fixtureDirectory, relativeSourceFile),
			);
		assert.equal(
			nameInSourceFile('ProbeContext', 'src/wrapper-consumer.tsx'),
			true,
		);
		assert.equal(
			nameInSourceFile('DeeperContextValue', 'src/deeper-consumer.tsx'),
			true,
		);
		assert.equal(
			nameInSourceFile('AliasedStrict', 'src/alias-consumer.tsx'),
			true,
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('discovers factory-minted contexts in unbound holder positions', async () => {
	const fixtureDirectory = await createFixture({
		'src/make-context.ts': `
			import { createContext } from 'react';
			export const createStrictContext = <T,>(fallback: T) => createContext(fallback);
		`,
		'src/object-holder.tsx': `
			import { createStrictContext } from './make-context';
			export const contexts = { probe: createStrictContext<null>(null) };
		`,
		'src/array-holder.tsx': `
			import { createStrictContext } from './make-context';
			export const contexts = [createStrictContext<null>(null)];
		`,
		'src/array-destructure.tsx': `
			import { createStrictContext } from './make-context';
			export const [Ctx] = [createStrictContext<null>(null)];
		`,
		'src/export-default.tsx': `
			import { createStrictContext } from './make-context';
			export default createStrictContext<null>(null);
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		for (const relativeSourceFile of [
			'src/object-holder.tsx',
			'src/array-holder.tsx',
			'src/array-destructure.tsx',
			'src/export-default.tsx',
		]) {
			assert.equal(
				contexts.some(
					(context) =>
						context.name === '<anonymous context>' &&
						context.sourceFile ===
							path.join(fixtureDirectory, relativeSourceFile),
				),
				true,
				relativeSourceFile,
			);
		}
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('discovers a context whose binding type is a union of Context members', async () => {
	const fixtureDirectory = await mkdtemp(
		path.join(os.tmpdir(), 'publy-context-isolation-fixture-'),
	);
	await writeFile(
		path.join(fixtureDirectory, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				jsx: 'react-jsx',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				noEmit: true,
				target: 'ES2022',
				strict: true,
			},
			include: ['src/**/*.ts', 'src/**/*.tsx'],
		}),
	);
	await mkdir(path.join(fixtureDirectory, 'node_modules', '@types'), {
		recursive: true,
	});
	await Promise.all([
		symlink(
			path.join(frontDirectory, 'node_modules', 'react'),
			path.join(fixtureDirectory, 'node_modules', 'react'),
			'dir',
		),
		symlink(
			path.join(frontDirectory, 'node_modules', '@types', 'react'),
			path.join(fixtureDirectory, 'node_modules', '@types', 'react'),
			'dir',
		),
	]);
	await mkdir(path.join(fixtureDirectory, 'src'), { recursive: true });
	await writeFile(
		path.join(fixtureDirectory, 'src', 'make-context.ts'),
		`
			import { createContext } from 'react';
			export const createStrictContext = <T,>(fallback: T) => createContext(fallback);
		`,
	);
	await writeFile(
		path.join(fixtureDirectory, 'src', 'union-context.tsx'),
		`
			import { createContext } from 'react';
			import { createStrictContext } from './make-context';
			export const UnionContext = Math.random() < 0.5
				? createStrictContext(null)
				: createContext('x');
		`,
	);

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		assert.equal(
			contexts.some(
				(context) =>
					context.name === 'UnionContext' &&
					context.sourceFile ===
						path.join(fixtureDirectory, 'src/union-context.tsx'),
			),
			true,
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('discovers a static class field context', async () => {
	const fixtureDirectory = await createFixture({
		'src/static-field.tsx': `
			import { createContext } from 'react';
			export class ContextHolder {
				static Ctx = createContext(null);
				static NotACtx = 42;
			}
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		assert.equal(
			contexts.some(
				(context) =>
					context.name === 'Ctx' &&
					context.sourceFile ===
						path.join(fixtureDirectory, 'src/static-field.tsx'),
			),
			true,
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('fails closed when React type declarations expose createContext without Context', async () => {
	const fixtureDirectory = await mkdtemp(
		path.join(os.tmpdir(), 'publy-context-isolation-fixture-'),
	);
	await writeFile(
		path.join(fixtureDirectory, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				jsx: 'react-jsx',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				noEmit: true,
				target: 'ES2022',
			},
			include: ['src/**/*.ts', 'src/**/*.tsx'],
		}),
	);
	await mkdir(path.join(fixtureDirectory, 'node_modules', '@types', 'react'), {
		recursive: true,
	});
	await writeFile(
		path.join(
			fixtureDirectory,
			'node_modules',
			'@types',
			'react',
			'index.d.ts',
		),
		'export declare function createContext<T>(defaultValue: T): unknown;\n',
	);
	await mkdir(path.join(fixtureDirectory, 'src'), { recursive: true });
	await writeFile(
		path.join(fixtureDirectory, 'src', 'main.ts'),
		"import { createContext } from 'react'; export const Ctx = createContext(null);\n",
	);

	try {
		assert.throws(
			() =>
				findReactContextDeclarations(
					path.join(fixtureDirectory, 'tsconfig.json'),
				),
			/could not resolve React's Context type/i,
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('does not demand inventory entries for consumer-file aliases of a context', async () => {
	const fixtureDirectory = await createFixture({
		'src/source.tsx': `
			import { createContext } from 'react';
			export const RealContext = createContext(null);
			export const holder = { RealContext };
			export const list = [RealContext];
		`,
		'src/c1-local-alias.tsx': `
			import { RealContext } from './source';
			export const Ctx = RealContext;
		`,
		'src/c2-destructure.tsx': `
			import { holder } from './source';
			export const { RealContext } = holder;
		`,
		'src/c3-index.tsx': `
			import { list } from './source';
			export const Ctx = list[0];
		`,
		'src/c4-for-of.tsx': `
			import { list } from './source';
			export const seen = [];
			for (const Ctx of list) {
				seen.push(Ctx);
			}
		`,
		'src/c5-module-alias.ts': `
			import { RealContext } from './source';
			export const AliasOfRealContext = RealContext;
		`,
		'src/c6-typed-param.tsx': `
			import { RealContext } from './source';
			export const useIt = (ctx: typeof RealContext) => ctx;
		`,
		'src/c7-class-field-alias.tsx': `
			import { RealContext } from './source';
			export class Holder {
				static Ctx = RealContext;
			}
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		const contextNamesBySource = new Map(
			contexts.map((context) => [
				path.relative(fixtureDirectory, context.sourceFile),
				context.name,
			]),
		);
		assert.equal(contextNamesBySource.get('src/source.tsx'), 'RealContext');
		for (const relativeSourceFile of [
			'src/c1-local-alias.tsx',
			'src/c2-destructure.tsx',
			'src/c3-index.tsx',
			'src/c4-for-of.tsx',
			'src/c5-module-alias.ts',
			'src/c6-typed-param.tsx',
			'src/c7-class-field-alias.tsx',
		]) {
			assert.equal(
				contextNamesBySource.has(relativeSourceFile),
				false,
				relativeSourceFile,
			);
		}
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('keeps any-typed, unknown-typed, and unannotated let bindings invisible', async () => {
	const fixtureDirectory = await createFixture({
		'src/make-context.ts': `
			import { createContext } from 'react';
			export const createStrictContext = <T,>(fallback: T) => createContext(fallback);
		`,
		'src/residuals.tsx': `
			import { createStrictContext } from './make-context';
			export const AnyContext: any = createStrictContext(null);
			export const UnknownContext: unknown = createStrictContext(null);
			export let LateContext;
			LateContext = createStrictContext(null);
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		const nameInSourceFile = (name, relativeSourceFile) =>
			contexts.some(
				(context) =>
					context.name === name &&
					context.sourceFile ===
						path.join(fixtureDirectory, relativeSourceFile),
			);
		assert.equal(
			nameInSourceFile('<anonymous context>', 'src/make-context.ts'),
			true,
		);
		for (const name of ['AnyContext', 'UnknownContext', 'LateContext']) {
			assert.equal(
				contexts.some((context) => context.name === name),
				false,
				name,
			);
		}
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('fails closed when a local or unrelated createContext symbol is imported through a factory', async () => {
	const fixtureDirectory = await createFixture({
		'node_modules/not-react/index.d.ts': `
			export declare const createContext: <T>(value: T) => T;
		`,
		'src/local-factory.ts': `
			import { createElement } from 'react';
			void createElement;
			import { createContext } from 'not-react';
			export const createLocalContext = <T,>(value: T) => value;
			export const LocalContext = createLocalContext(createContext(null));
		`,
	});

	try {
		assert.deepEqual(
			findReactContextDeclarations(
				path.join(fixtureDirectory, 'tsconfig.json'),
			),
			[],
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('counts a rendered element-access createContext callee in a TanStack route virtual-module sibling', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const elementAccessCode =
		"const RouteContext = React['createContext'](null);";

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile }],
			[
				{
					fileName: 'assets/route.js',
					modules: { [sourceFile]: { code: elementAccessCode } },
				},
				{
					fileName: 'assets/route-component.js',
					modules: {
						[`${sourceFile}?tsr-split=component`]: {
							code: elementAccessCode,
						},
					},
				},
			],
			frontDirectory,
		),
		[
			'RouteContext in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/route-component.js.',
		],
	);
});

void test('does not treat the member-name of a React namespace access as a factory value', async () => {
	const fixtureDirectory = await createFixture({
		'src/namespace-call.ts': `
			import * as React from 'react';
			export const NamespaceContext = React.createContext(null);
		`,
	});

	try {
		assert.deepEqual(
			findReactContextDeclarations(
				path.join(fixtureDirectory, 'tsconfig.json'),
			),
			[
				{
					name: 'NamespaceContext',
					sourceFile: path.join(fixtureDirectory, 'src/namespace-call.ts'),
				},
			],
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('ignores React contexts declared in test source files', async () => {
	const fixtureDirectory = await createFixture({
		'src/context.test.tsx': `
			import { createContext } from 'react';
			export const TestContext = createContext(null);
		`,
	});

	try {
		assert.deepEqual(
			findReactContextDeclarations(
				path.join(fixtureDirectory, 'tsconfig.json'),
			),
			[],
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('discovers contexts through callee adapters and object holders even when the binding is any-typed', async () => {
	const fixtureDirectory = await createFixture({
		'src/bound-any.ts': `
			import * as React from 'react';
			const makeBoundContext = React.createContext.bind(React);
			export const AnyBoundContext: any = makeBoundContext(null);
		`,
		'src/shorthand-holder.ts': `
			import { createContext } from 'react';
			export const reactApi = { createContext };
			export const AnyShorthandContext: any = reactApi.createContext(null);
		`,
		'src/explicit-holder.ts': `
			import * as React from 'react';
			export const explicitReactApi = { createContext: React.createContext };
			export const AnyExplicitContext: any = explicitReactApi.createContext(null);
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		const namesBySource = new Map(
			contexts.map((context) => [
				path.relative(fixtureDirectory, context.sourceFile),
				context.name,
			]),
		);
		assert.equal(namesBySource.get('src/bound-any.ts'), 'AnyBoundContext');
		assert.equal(
			namesBySource.get('src/shorthand-holder.ts'),
			'AnyShorthandContext',
		);
		assert.equal(
			namesBySource.get('src/explicit-holder.ts'),
			'AnyExplicitContext',
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('does not report a local or unrelated createContext symbol', async () => {
	const fixtureDirectory = await createFixture({
		'node_modules/not-react/index.d.ts': `
			export declare const createContext: <T>(value: T) => T;
		`,
		'src/local.ts': `
			import { createElement } from 'react';
			void createElement;
			const createContext = <T>(value: T) => value;
			export const LocalContext = createContext(null);
		`,
		'src/unrelated.ts': `
			import { createContext } from 'not-react';
			export const UnrelatedContext = createContext(null);
		`,
	});

	try {
		assert.deepEqual(
			findReactContextDeclarations(
				path.join(fixtureDirectory, 'tsconfig.json'),
			),
			[],
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('fails closed for a dynamic React element access', async () => {
	const fixtureDirectory = await createFixture({
		'src/dynamic-element-access.ts': `
			import * as React from 'react';
			const contextFactory = 'create' + 'Context';
			export const DynamicContext = React[contextFactory](null);
		`,
	});

	try {
		assert.throws(
			() =>
				findReactContextDeclarations(
					path.join(fixtureDirectory, 'tsconfig.json'),
				),
			/cannot prove a dynamic React element access/i,
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('fails closed when a dynamic React element access is hoisted before the call', async () => {
	const fixtureDirectory = await createFixture({
		'src/hoisted-dynamic-element-access.ts': `
			import * as React from 'react';
			const key: any = 'create' + 'Context';
			const contextFactory = React[key];
			export const DynamicContext = contextFactory(null);
		`,
	});

	try {
		assert.throws(
			() =>
				findReactContextDeclarations(
					path.join(fixtureDirectory, 'tsconfig.json'),
				),
			/cannot prove a dynamic React element access/i,
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('fails closed when a dynamic object-holder access could be React createContext', async () => {
	const fixtureDirectory = await createFixture({
		'src/react-api.ts': `
			import { createContext } from 'react';
			export const reactApi: any = { createContext };
		`,
		'src/dynamic-object-holder.ts': `
			import { reactApi } from './react-api';
			const key: any = 'create' + 'Context';
			const make = reactApi[key];
			export const DynamicContext = make(null);
		`,
	});

	try {
		assert.throws(
			() =>
				findReactContextDeclarations(
					path.join(fixtureDirectory, 'tsconfig.json'),
				),
			/cannot prove a dynamic React element access/i,
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('does not flag a chunk copy that references a context without minting it', () => {
	const sourceFile = path.join(frontDirectory, 'src/lib/shared-context.tsx');

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'Ctx', sourceFile }],
			[
				{
					fileName: 'assets/a.js',
					modules: {
						[sourceFile]: { code: 'const Ctx = createContext(null);' },
					},
				},
				{
					fileName: 'assets/b.js',
					modules: {
						[sourceFile]: { code: 'const value = useContext(Ctx);' },
					},
				},
			],
			frontDirectory,
		),
		[],
	);
});

void test('reports each React context whose source module is in multiple client chunks', () => {
	const sourceFile = path.join(frontDirectory, 'src/two-contexts.ts');
	const contexts = [
		{ name: 'FirstContext', sourceFile },
		{ name: 'SecondContext', sourceFile },
	];
	const renderedCode = `
		const FirstContext = createContext(null);
		const SecondContext = createContext(null);
	`;

	assert.deepEqual(
		findContextChunkIsolationViolations(
			contexts,
			[
				{
					fileName: 'assets/first.js',
					modules: { [sourceFile]: { code: renderedCode } },
				},
				{
					fileName: 'assets/second.js',
					modules: { [sourceFile]: { code: renderedCode } },
				},
			],
			frontDirectory,
		),
		[
			'FirstContext in src/two-contexts.ts is present in multiple client chunks: assets/first.js, assets/second.js.',
			'SecondContext in src/two-contexts.ts is present in multiple client chunks: assets/first.js, assets/second.js.',
		],
	);
});

void test('counts a TanStack route virtual-module sibling that still creates the context', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile }],
			[
				{
					fileName: 'assets/route.js',
					modules: {
						[sourceFile]: {
							code: 'const RouteContext = createContext(null);',
							renderedLength: 49,
						},
					},
				},
				{
					fileName: 'assets/route-component.js',
					modules: {
						[`${sourceFile}?tsr-split=component`]: {
							code: 'const RouteContext = createContext(null);',
							renderedLength: 49,
						},
					},
				},
			],
			frontDirectory,
		),
		[
			'RouteContext in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/route-component.js.',
		],
	);
});

void test('counts a TanStack Hydrate virtual-module sibling that still creates the context', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile }],
			[
				{
					fileName: 'assets/route.js',
					modules: {
						[sourceFile]: {
							code: 'const RouteContext = createContext(null);',
						},
					},
				},
				{
					fileName: 'assets/hydrated.js',
					modules: {
						[`${sourceFile}?tss-hydrate=H1`]: {
							code: 'const RouteContext = createContext(null);',
						},
					},
				},
			],
			frontDirectory,
		),
		[
			'RouteContext in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/hydrated.js.',
		],
	);
});

void test('counts a namespace createContext call in a TanStack route virtual-module sibling', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile }],
			[
				{
					fileName: 'assets/route.js',
					modules: {
						[sourceFile]: {
							code: 'const RouteContext = React.createContext(null);',
						},
					},
				},
				{
					fileName: 'assets/route-component.js',
					modules: {
						[`${sourceFile}?tsr-split=component`]: {
							code: 'const RouteContext = React.createContext(null);',
						},
					},
				},
			],
			frontDirectory,
		),
		[
			'RouteContext in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/route-component.js.',
		],
	);
});

void test('counts a sequence-wrapped createContext call in a TanStack route virtual-module sibling', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile }],
			[
				{
					fileName: 'assets/route.js',
					modules: {
						[sourceFile]: {
							code: 'const RouteContext = (0, import_react.createContext)(null);',
						},
					},
				},
				{
					fileName: 'assets/route-component.js',
					modules: {
						[`${sourceFile}?tsr-split=component`]: {
							code: 'const RouteContext = (0, import_react.createContext)(null);',
						},
					},
				},
			],
			frontDirectory,
		),
		[
			'RouteContext in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/route-component.js.',
		],
	);
});

void test('counts a rendered-module-local createContext callee alias', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const aliasedCode = `
		const mk = import_react.createContext;
		const RouteContext = mk(null);
	`;

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile }],
			[
				{
					fileName: 'assets/route.js',
					modules: { [sourceFile]: { code: aliasedCode } },
				},
				{
					fileName: 'assets/route-component.js',
					modules: {
						[`${sourceFile}?tsr-split=component`]: {
							code: aliasedCode,
						},
					},
				},
			],
			frontDirectory,
		),
		[
			'RouteContext in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/route-component.js.',
		],
	);
});

void test('counts a context duplicated across TanStack virtual-module siblings', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile }],
			[
				{
					fileName: 'assets/route.js',
					modules: {
						[sourceFile]: { code: 'const route = {};' },
					},
				},
				{
					fileName: 'assets/route-component.js',
					modules: {
						[`${sourceFile}?tsr-split=component`]: {
							code: 'const RouteContext = React.createContext(null);',
						},
					},
				},
				{
					fileName: 'assets/route-loader.js',
					modules: {
						[`${sourceFile}?tsr-split=loader`]: {
							code: 'const RouteContext = React.createContext(null);',
						},
					},
				},
			],
			frontDirectory,
		),
		[
			'RouteContext in src/routes/field-validation.tsx is present in multiple client chunks: assets/route-component.js, assets/route-loader.js.',
		],
	);
});

void test('fails closed for a deconflicted-renamed context binding with an unrecognized initializer callee', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const unrecognizedCode = `
		const makeContext = getContextFactory();
		const RouteContext$1 = makeContext(null);
	`;

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[{ name: 'RouteContext', sourceFile }],
				[
					{
						fileName: 'assets/route.js',
						modules: { [sourceFile]: { code: unrecognizedCode } },
					},
					{
						fileName: 'assets/route-component.js',
						modules: {
							[`${sourceFile}?tsr-split=component`]: {
								code: unrecognizedCode,
							},
						},
					},
				],
				frontDirectory,
			),
		/cannot prove how RouteContext\$1 is created/i,
	);
});

void test('attributes a deconflicted-renamed context mint to its own binding, not every context in the file', () => {
	const sourceFile = path.join(frontDirectory, 'src/two-contexts.ts');
	const renamedFirstContextCode = `
		const FirstContext$1 = (0, import_react.createContext)(null);
	`;
	const secondContextCode = `
		const SecondContext = createContext(null);
	`;

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[
				{ name: 'FirstContext', sourceFile },
				{ name: 'SecondContext', sourceFile },
			],
			[
				{
					fileName: 'assets/first.js',
					modules: { [sourceFile]: { code: renamedFirstContextCode } },
				},
				{
					fileName: 'assets/second.js',
					modules: { [sourceFile]: { code: secondContextCode } },
				},
			],
			frontDirectory,
		),
		[],
	);
});

void test('counts a rendered createContext call bound to an unexpected name as a creator', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const unattributedCode = 'const Unrelated = createContext(null);';

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile }],
			[
				{
					fileName: 'assets/route.js',
					modules: { [sourceFile]: { code: unattributedCode } },
				},
				{
					fileName: 'assets/route-component.js',
					modules: {
						[`${sourceFile}?tsr-split=component`]: {
							code: unattributedCode,
						},
					},
				},
			],
			frontDirectory,
		),
		[
			'RouteContext in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/route-component.js.',
		],
	);
});

void test('fails closed when a context initializer callee remains unrecognized', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const unrecognizedCode = `
		const makeContext = getContextFactory();
		const RouteContext = makeContext(null);
	`;

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[{ name: 'RouteContext', sourceFile }],
				[
					{
						fileName: 'assets/route.js',
						modules: { [sourceFile]: { code: unrecognizedCode } },
					},
					{
						fileName: 'assets/route-component.js',
						modules: {
							[`${sourceFile}?tsr-split=component`]: {
								code: unrecognizedCode,
							},
						},
					},
				],
				frontDirectory,
			),
		/cannot prove how RouteContext is created/i,
	);
});

void test('fails closed for an unrecognized rendered createContext callee shape', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const unrecognizedCode =
		'const RouteContext = (enabled ? React.createContext : fallback)(null);';

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[{ name: 'RouteContext', sourceFile }],
				[
					{
						fileName: 'assets/route.js',
						modules: { [sourceFile]: { code: unrecognizedCode } },
					},
					{
						fileName: 'assets/route-component.js',
						modules: {
							[`${sourceFile}?tsr-split=component`]: {
								code: unrecognizedCode,
							},
						},
					},
				],
				frontDirectory,
			),
		/cannot prove an unrecognized rendered createContext callee/i,
	);
});

void test('fails closed for an unrecognized query derived from a context source module', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[{ name: 'RouteContext', sourceFile }],
				[
					{
						fileName: 'assets/route.js',
						modules: {
							[sourceFile]: {
								code: 'const RouteContext = createContext(null);',
							},
							[`${sourceFile}?unexpected=context-copy`]: {
								code: 'const RouteContext = createContext(null);',
							},
						},
					},
				],
				frontDirectory,
			),
		/cannot prove an unrecognized source-derived query module/i,
	);
});

void test('fails closed when a relevant rendered module has no code', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[{ name: 'RouteContext', sourceFile }],
				[
					{
						fileName: 'assets/route.js',
						modules: { [sourceFile]: {} },
					},
					{
						fileName: 'assets/route-component.js',
						modules: {
							[`${sourceFile}?tsr-split=component`]: {
								code: 'const RouteContext = React.createContext(null);',
							},
						},
					},
				],
				frontDirectory,
			),
		/cannot inspect rendered code/i,
	);
});

void test('fails closed when relevant rendered code cannot be parsed', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[{ name: 'RouteContext', sourceFile }],
				[
					{
						fileName: 'assets/route.js',
						modules: {
							[sourceFile]: {
								code: 'const RouteContext = createContext(',
							},
						},
					},
					{
						fileName: 'assets/route-component.js',
						modules: {
							[`${sourceFile}?tsr-split=component`]: {
								code: 'const RouteContext = createContext(null);',
							},
						},
					},
				],
				frontDirectory,
			),
		/cannot parse rendered code/i,
	);
});

void test('ignores a TanStack route virtual-module sibling after it no longer contains a context', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile }],
			[
				{
					fileName: 'assets/route.js',
					modules: {
						[sourceFile]: { code: 'const route = {};' },
					},
				},
				{
					fileName: 'assets/route-component.js',
					modules: {
						[`${sourceFile}?tsr-split=component`]: {
							code: 'const SplitComponent = () => null;',
							renderedLength: 34,
						},
					},
				},
			],
		),
		[],
	);
});

void test('does not require a client chunk for an unbundled factory-value mention', () => {
	const sourceFile = path.join(frontDirectory, 'scripts/vitest.setup.ts');

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[
				{
					isFactoryValue: true,
					name: '<React.createContext factory value>',
					sourceFile,
				},
			],
			[],
			frontDirectory,
		),
		[],
	);
});

void test('fails the plugin when no React contexts are discovered', async () => {
	const fixtureDirectory = await createFixture({
		'src/no-context.ts': `
			import { createElement } from 'react';
			void createElement;
		`,
	});

	try {
		const plugin = contextChunkIsolationPlugin({
			contextInventory: [{ name: 'FirstContext', sourceFile: 'src/first.ts' }],
			tsconfigPath: path.join(fixtureDirectory, 'tsconfig.json'),
		});

		assert.throws(
			() => plugin.buildStart(),
			/expected context inventory entry FirstContext in src\/first\.ts is missing/i,
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('fails the plugin when its checked-in context inventory loses a discovered context', async () => {
	const fixtureDirectory = await createFixture({
		'src/first.ts': `
			import { createContext } from 'react';
			export const FirstContext = createContext(null);
		`,
		'src/second.ts': `
			import { createContext } from 'react';
			export const SecondContext = createContext(null);
		`,
		'src/third.ts': `
			import { createContext } from 'react';
			export const ThirdContext = createContext(null);
		`,
		'src/fourth.ts': `
			import { createContext } from 'react';
			export const FourthContext = createContext(null);
		`,
	});

	try {
		const plugin = contextChunkIsolationPlugin({
			contextInventory: [
				{ name: 'FirstContext', sourceFile: 'src/first.ts' },
				{ name: 'SecondContext', sourceFile: 'src/second.ts' },
				{ name: 'ThirdContext', sourceFile: 'src/third.ts' },
				{ name: 'MissingContext', sourceFile: 'src/fourth.ts' },
			],
			tsconfigPath: path.join(fixtureDirectory, 'tsconfig.json'),
		});

		assert.throws(
			() => plugin.buildStart(),
			/expected context inventory entry MissingContext in src\/fourth\.ts is missing/i,
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('runs only for client builds and fails the plugin for unmapped or untyped source modules', async () => {
	const fixtureDirectory = await createFixture({
		'src/first.ts': `
			import { createContext } from 'react';
			export const FirstContext = createContext(null);
		`,
		'src/second.ts': `
			import { createContext } from 'react';
			export const SecondContext = createContext(null);
		`,
		'src/third.ts': `
			import { createContext } from 'react';
			export const ThirdContext = createContext(null);
		`,
		'src/fourth.ts': `
			import { createContext } from 'react';
			export const FourthContext = createContext(null);
		`,
		'src/untyped-context.jsx': `
			import { createContext } from 'react';
			export const UntypedContext = createContext(null);
		`,
	});

	try {
		const plugin = contextChunkIsolationPlugin({
			contextInventory: [
				{ name: 'FirstContext', sourceFile: 'src/first.ts' },
				{ name: 'SecondContext', sourceFile: 'src/second.ts' },
				{ name: 'ThirdContext', sourceFile: 'src/third.ts' },
				{ name: 'FourthContext', sourceFile: 'src/fourth.ts' },
			],
			tsconfigPath: path.join(fixtureDirectory, 'tsconfig.json'),
		});
		assert.equal(plugin.apply, 'build');
		assert.equal(plugin.applyToEnvironment({ name: 'client' }), true);
		assert.equal(plugin.applyToEnvironment({ name: 'ssr' }), false);
		plugin.buildStart();

		let errorMessage;
		plugin.generateBundle.call(
			{
				error(message) {
					errorMessage = message;
				},
			},
			{},
			{
				'assets/app.js': {
					fileName: 'assets/app.js',
					modules: {
						[path.join(fixtureDirectory, 'src/untyped-context.jsx')]: {},
					},
					type: 'chunk',
				},
			},
		);

		assert.match(errorMessage, /FirstContext.*not present in a client chunk/i);
		assert.match(errorMessage, /untyped-context\.jsx.*TypeScript program/i);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('fails the plugin for a bundled first-party module outside front src that is absent from the TypeScript program', async () => {
	const fixtureDirectory = await createFixture({
		'src/first.ts': `
			import { createContext } from 'react';
			export const FirstContext = createContext(null);
		`,
		'src/second.ts': `
			import { createContext } from 'react';
			export const SecondContext = createContext(null);
		`,
		'src/third.ts': `
			import { createContext } from 'react';
			export const ThirdContext = createContext(null);
		`,
		'src/fourth.ts': `
			import { createContext } from 'react';
			export const FourthContext = createContext(null);
		`,
		'packages/outside.ts': 'export const bundledOutsideSource = true;',
	});

	try {
		const plugin = contextChunkIsolationPlugin({
			contextInventory: [
				{ name: 'FirstContext', sourceFile: 'src/first.ts' },
				{ name: 'SecondContext', sourceFile: 'src/second.ts' },
				{ name: 'ThirdContext', sourceFile: 'src/third.ts' },
				{ name: 'FourthContext', sourceFile: 'src/fourth.ts' },
			],
			tsconfigPath: path.join(fixtureDirectory, 'tsconfig.json'),
			workspaceDirectory: fixtureDirectory,
		});
		plugin.buildStart();

		let errorMessage;
		plugin.generateBundle.call(
			{
				error(message) {
					errorMessage = message;
				},
			},
			{},
			{
				'assets/app.js': {
					fileName: 'assets/app.js',
					modules: {
						[path.join(fixtureDirectory, 'src/first.ts')]: {
							code: 'const FirstContext = createContext(null);',
						},
						[path.join(fixtureDirectory, 'src/second.ts')]: {
							code: 'const SecondContext = createContext(null);',
						},
						[path.join(fixtureDirectory, 'src/third.ts')]: {
							code: 'const ThirdContext = createContext(null);',
						},
						[path.join(fixtureDirectory, 'src/fourth.ts')]: {
							code: 'const FourthContext = createContext(null);',
						},
						[path.join(fixtureDirectory, 'packages/outside.ts')]: {},
					},
					type: 'chunk',
				},
			},
		);

		assert.match(errorMessage, /packages\/outside\.ts.*TypeScript program/i);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test(
	'fails a real TanStack route build when a context is minted through a cross-file factory',
	{ timeout: 120_000 },
	async () => {
		const inventory = [
			{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
			{ name: 'ProbeContext', sourceFile: 'src/routes/probe.tsx' },
			{ name: 'SecondContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'ThirdContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'FourthContext', sourceFile: 'src/contexts.tsx' },
		];
		const result = await buildRouteFixture({
			files: {
				'src/make-context.ts': `
					import { createContext } from 'react';
					export const createStrictContext = <T,>(fallback: T) => createContext(fallback);
				`,
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { useContext } from 'react';
					import { createStrictContext } from '../make-context';
					const ProbeContext = createStrictContext<null>(null);
					export const useProbe = () => useContext(ProbeContext);
					const Probe = () => <ProbeContext.Provider value={null}>probe</ProbeContext.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe });
				`,
			},
			inventory,
			rootImportsProbe: true,
		});

		try {
			const mintingCopies = [];
			for (const chunk of JSON.parse(result.trace)) {
				for (const [moduleId, code] of Object.entries(chunk.modules)) {
					if (
						moduleId.includes('/src/routes/probe.tsx') &&
						/createStrictContext\s*\(/.test(code)
					) {
						mintingCopies.push(`${chunk.fileName} :: ${moduleId}`);
					}
				}
			}
			assert.equal(
				new Set(mintingCopies.map((location) => location.split(' :: ')[0]))
					.size,
				2,
				`MINTING ${JSON.stringify(mintingCopies, null, 2)}`,
			);
			assert.notEqual(result.status, 0, result.trace);
			assert.match(result.output, /cannot prove how ProbeContext is created/i);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build when a context is minted through a factory with a branded return type',
	{ timeout: 120_000 },
	async () => {
		const inventory = [
			{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
			{ name: 'ProbeContext', sourceFile: 'src/routes/probe.tsx' },
			{ name: 'SecondContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'ThirdContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'FourthContext', sourceFile: 'src/contexts.tsx' },
		];
		const result = await buildRouteFixture({
			files: {
				'src/make-context.ts': `
					import { createContext } from 'react';
					export interface StrictContext<T> extends Context<T> { readonly strict: true; }
					export const createStrictContext = <T,>(fallback: T): StrictContext<T> =>
						Object.assign(createContext(fallback), { strict: true as const });
				`,
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { useContext } from 'react';
					import { createStrictContext } from '../make-context';
					const ProbeContext = createStrictContext<null>(null);
					export const useProbe = () => useContext(ProbeContext);
					const Probe = () => <ProbeContext.Provider value={null}>probe</ProbeContext.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe });
				`,
			},
			inventory,
			rootImportsProbe: true,
		});

		try {
			assert.notEqual(result.status, 0, result.trace);
			assert.match(result.output, /cannot prove how ProbeContext is created/i);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build when a factory-minted context is held in an object literal',
	{ timeout: 120_000 },
	async () => {
		const inventory = [
			{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
			{ name: 'SecondContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'ThirdContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'FourthContext', sourceFile: 'src/contexts.tsx' },
		];
		const result = await buildRouteFixture({
			files: {
				'src/make-context.ts': `
					import { createContext } from 'react';
					export interface StrictContext<T> extends Context<T> { readonly strict: true; }
					export const createStrictContext = <T,>(fallback: T): StrictContext<T> =>
						Object.assign(createContext(fallback), { strict: true as const });
				`,
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { useContext } from 'react';
					import { createStrictContext } from '../make-context';
					const contexts = { probe: createStrictContext<null>(null) };
					export const useProbe = () => useContext(contexts.probe);
					const Probe = () => <contexts.probe.Provider value={null}>probe</contexts.probe.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe });
				`,
			},
			inventory,
			rootImportsProbe: true,
		});

		try {
			const mintingCopies = [];
			for (const chunk of JSON.parse(result.trace)) {
				for (const [moduleId, code] of Object.entries(chunk.modules)) {
					if (
						moduleId.includes('/src/routes/probe.tsx') &&
						/createStrictContext\s*\(/.test(code)
					) {
						mintingCopies.push(`${chunk.fileName} :: ${moduleId}`);
					}
				}
			}
			assert.equal(
				new Set(mintingCopies.map((location) => location.split(' :: ')[0]))
					.size,
				2,
				`MINTING ${JSON.stringify(mintingCopies, null, 2)}`,
			);
			assert.notEqual(result.status, 0, result.trace);
			assert.match(
				result.output,
				/<anonymous context> in src\/routes\/probe\.tsx is present in multiple client chunks/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build when a context survives in its reference and split modules',
	{ timeout: 120_000 },
	async () => {
		const inventory = [
			{ name: 'ProbeContext', sourceFile: 'src/routes/probe.tsx' },
			{ name: 'SecondContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'ThirdContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'FourthContext', sourceFile: 'src/contexts.tsx' },
		];
		const result = await buildRouteFixture({
			files: {
				'src/routes/probe.tsx': `
				import { createFileRoute } from '@tanstack/react-router';
				import { createContext, useContext } from 'react';
				const ProbeContext = createContext(null);
				ProbeContext.displayName = 'ProbeContext';
				export const useProbe = () => useContext(ProbeContext);
				const Probe = () => <ProbeContext.Provider value={null}>probe</ProbeContext.Provider>;
				export const Route = createFileRoute('/probe')({ component: Probe });
			`,
			},
			inventory,
			rootImportsProbe: true,
		});

		try {
			assert.notEqual(result.status, 0, result.trace);
			assert.match(
				result.output,
				/ProbeContext in src\/routes\/probe\.tsx is present in multiple client chunks/i,
			);
			assert.match(result.output, /probe.*probe/i);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build when two context creators share one chunk',
	{ timeout: 120_000 },
	async () => {
		const inventory = [
			{ name: 'ProbeContext', sourceFile: 'src/routes/probe.tsx' },
			{ name: 'SecondContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'ThirdContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'FourthContext', sourceFile: 'src/contexts.tsx' },
		];
		const result = await buildRouteFixture({
			files: {
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { createContext, useContext } from 'react';
					const ProbeContext = createContext(null);
					ProbeContext.displayName = 'ProbeContext';
					export const useProbe = () => useContext(ProbeContext);
					const Probe = () => <ProbeContext.Provider value={null}>probe</ProbeContext.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe });
				`,
			},
			groupProbeModules: true,
			inventory,
			rootImportsProbe: true,
		});

		try {
			const creatorLocations = [];
			for (const chunk of JSON.parse(result.trace)) {
				for (const [moduleId, code] of Object.entries(chunk.modules)) {
					if (
						moduleId.includes('/src/routes/probe.tsx') &&
						code.includes('createContext')
					) {
						creatorLocations.push(`${chunk.fileName} :: ${moduleId}`);
					}
				}
			}
			assert.equal(creatorLocations.length, 2);
			assert.equal(
				new Set(creatorLocations.map((location) => location.split(' :: ')[0]))
					.size,
				1,
			);
			assert.notEqual(
				result.status,
				0,
				`CREATORS ${JSON.stringify(creatorLocations, null, 2)}`,
			);
			assert.match(
				result.output,
				/ProbeContext in src\/routes\/probe\.tsx is created by multiple client modules in chunk: assets\/probe-pair/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'passes a real TanStack route build when split groups consume one shared context',
	{ timeout: 120_000 },
	async () => {
		const inventory = [
			{ name: 'ProbeContext', sourceFile: 'src/routes/probe.tsx' },
			{ name: 'SecondContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'ThirdContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'FourthContext', sourceFile: 'src/contexts.tsx' },
		];
		const result = await buildRouteFixture({
			files: {
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { createContext } from 'react';
					const ProbeContext = createContext(null);
					const Probe = () => <ProbeContext.Provider value={null}>probe</ProbeContext.Provider>;
					const ProbeError = () => <ProbeContext.Provider value={null}>error</ProbeContext.Provider>;
					const ProbeNotFound = () => <ProbeContext.Provider value={null}>not found</ProbeContext.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe, errorComponent: ProbeError, notFoundComponent: ProbeNotFound });
				`,
			},
			inventory,
		});

		try {
			assert.equal(result.status, 0, result.output);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'passes a real TanStack route build when its reference module consumes a shared context',
	{ timeout: 120_000 },
	async () => {
		const inventory = [
			{ name: 'ProbeContext', sourceFile: 'src/routes/probe.tsx' },
			{ name: 'SecondContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'ThirdContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'FourthContext', sourceFile: 'src/contexts.tsx' },
		];
		const result = await buildRouteFixture({
			files: {
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { createContext, useContext } from 'react';
					const ProbeContext = createContext(null);
					export const useProbe = () => useContext(ProbeContext);
					const Probe = () => <ProbeContext.Provider value={null}>probe</ProbeContext.Provider>;
					const ProbeError = () => <ProbeContext.Provider value={null}>error</ProbeContext.Provider>;
					const ProbeNotFound = () => <ProbeContext.Provider value={null}>not found</ProbeContext.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe, errorComponent: ProbeError, notFoundComponent: ProbeNotFound });
				`,
			},
			inventory,
			rootImportsProbe: true,
		});

		try {
			assert.equal(result.status, 0, result.output);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'passes a real TanStack route build when its context is used only by the split component',
	{ timeout: 120_000 },
	async () => {
		const inventory = [
			{ name: 'ProbeContext', sourceFile: 'src/routes/probe.tsx' },
			{ name: 'SecondContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'ThirdContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'FourthContext', sourceFile: 'src/contexts.tsx' },
		];
		const result = await buildRouteFixture({
			files: {
				'src/routes/probe.tsx': `
				import { createFileRoute } from '@tanstack/react-router';
				import { createContext } from 'react';
				const ProbeContext = createContext(null);
				const Probe = () => <ProbeContext.Provider value={null}>probe</ProbeContext.Provider>;
				export const Route = createFileRoute('/probe')({ component: Probe });
			`,
			},
			inventory,
		});

		try {
			assert.equal(result.status, 0, result.output);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);
