import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	contextChunkIsolationPlugin,
	findContextChunkIsolationViolations,
	findReactContextDeclarations,
} from './check-context-chunk-isolation.mjs';

const frontDirectory = path.resolve(import.meta.dirname, '..');

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

void test('reports each React context whose source module is in multiple client chunks', () => {
	const sourceFile = path.join(frontDirectory, 'src/two-contexts.ts');
	const contexts = [
		{ name: 'FirstContext', sourceFile },
		{ name: 'SecondContext', sourceFile },
	];

	assert.deepEqual(
		findContextChunkIsolationViolations(
			contexts,
			[
				{ fileName: 'assets/first.js', modules: { [sourceFile]: {} } },
				{ fileName: 'assets/second.js', modules: { [sourceFile]: {} } },
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
				{ fileName: 'assets/route.js', modules: { [sourceFile]: {} } },
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

void test('ignores a TanStack route virtual-module sibling after it no longer contains a context', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile }],
			[
				{ fileName: 'assets/route.js', modules: { [sourceFile]: {} } },
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
						[path.join(fixtureDirectory, 'src/first.ts')]: {},
						[path.join(fixtureDirectory, 'src/second.ts')]: {},
						[path.join(fixtureDirectory, 'src/third.ts')]: {},
						[path.join(fixtureDirectory, 'src/fourth.ts')]: {},
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
