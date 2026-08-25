import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
	mkdtemp,
	mkdir,
	readFile,
	readdir,
	rm,
	symlink,
	writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import {
	contextChunkIsolationPlugin,
	findContextChunkIsolationViolations,
	findContextInventoryViolations,
	findReactContextDeclarations,
} from './check-context-chunk-isolation.mts';
import type {
	BundleOutputEntry,
	ClientChunk,
	ContextInventoryEntry,
} from './check-context-chunk-isolation.mts';
import { findEmittedCallExtents } from './context-source-map.mts';
import type { SourceSpan } from './context-source-map.mts';
import type { RawSourceMapShape } from './context-source-map.mts';

/** One mapping segment handed to the hand-fed source-map encoder. */
type SourceMapSegmentInput =
	| { genLine: number; genCol: number }
	| {
			genLine: number;
			genCol: number;
			sourceIndex: number;
			origLine: number;
			origCol: number;
	  };

/** One mapping segment tied to a resolved original source id. */
interface ChunkSegmentInput {
	source: string;
	origLine: number;
	origCol: number;
	genLine: number;
	genCol: number;
}

/** One dumped chunk row of the harness bundle-map.json trace. */
interface TraceChunk {
	fileName: string;
	modules: Record<string, string>;
}

const frontDirectory = path.resolve(import.meta.dirname, '..', '..');
const execFileAsync = promisify(execFile);

// Hand-fed rendered fixtures express attribution through real source-map
// objects: segments map a generated position in the chunk to an original
// source position (0-based line/column, the standard VLQ encoding), exactly
// like the maps the guard reads from real builds.
const SOURCE_MAP_BASE64 =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const encodeVlq = (value: number): string => {
	let encoded = '';
	let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
	do {
		let digit = vlq & 31;
		vlq >>>= 5;
		if (vlq > 0) {
			digit |= 32;
		}
		encoded += SOURCE_MAP_BASE64[digit];
	} while (vlq > 0);
	return encoded;
};

// Builds a chunk source map from explicit segments. genLine/genCol are the
// generated coordinates the guard ties to the chunk's emitted calls;
// origLine/origCol and the resolved source id are the original coordinates
// it ties to the recorded mint spans. A copy is attributed a mint only when
// the same segment lands both inside an emitted call and inside a mint span.
const encodeSourceMap = ({
	sources,
	segments,
}: {
	sources: string[];
	segments: SourceMapSegmentInput[];
}) => {
	let mappings = '';
	let prevSource = 0;
	let prevOrigLine = 0;
	let prevOrigCol = 0;
	const byLine = new Map();
	let maxLine = 0;
	for (const segment of segments) {
		const lineSegments = byLine.get(segment.genLine) ?? [];
		lineSegments.push(segment);
		byLine.set(segment.genLine, lineSegments);
		maxLine = Math.max(maxLine, segment.genLine);
	}
	for (let line = 0; line <= maxLine; line++) {
		const lineSegments = byLine.get(line) ?? [];
		lineSegments.sort(
			(a: SourceMapSegmentInput, b: SourceMapSegmentInput) =>
				a.genCol - b.genCol,
		);
		let genCol = 0;
		const encodedSegments = [];
		for (const segment of lineSegments) {
			const fields = [segment.genCol - genCol];
			genCol = segment.genCol;
			if ('sourceIndex' in segment) {
				fields.push(segment.sourceIndex - prevSource);
				prevSource = segment.sourceIndex;
				fields.push(segment.origLine - prevOrigLine);
				prevOrigLine = segment.origLine;
				fields.push(segment.origCol - prevOrigCol);
				prevOrigCol = segment.origCol;
			}
			encodedSegments.push(fields.map(encodeVlq).join(''));
		}
		mappings += (line > 0 ? ';' : '') + encodedSegments.join(',');
	}
	return { version: 3, sources, sourcesContent: [], mappings };
};

// A hand-fed chunk whose map attributes the given segments to the given
// source ids (absolute module ids, as the guard resolves them). Every source
// also receives an anchor segment at original 0:0, the way real maps anchor
// the first emitted token, so single-segment fixtures stay distinguishable
// from a collapsed map (which resolves a copy to exactly one position).
const chunkWithMap = (
	fileName: string,
	modules: Record<string, { code?: string | undefined }>,
	segments: ChunkSegmentInput[],
): ClientChunk => {
	const sources = [...new Set(segments.map((segment) => segment.source))];
	const sourceIndexes = new Map(
		sources.map((source, index) => [source, index]),
	);
	const anchoredSegments = [
		...sources.map((source) => ({
			source,
			origLine: 0,
			origCol: 0,
			genLine: 0,
			genCol: 0,
		})),
		...segments,
	];
	return {
		type: 'chunk',
		fileName,
		modules,
		map: encodeSourceMap({
			sources,
			segments: anchoredSegments.map((segment) => ({
				...segment,
				sourceIndex: sourceIndexes.get(segment.source),
			})),
		}),
	};
};

// A hand-fed chunk that also carries the emitted code the map's generated
// positions refer to — the shape a real build hands the guard, where the
// emitted-call tie is enforced.
const chunkWithCode = (
	fileName: string,
	code: string,
	modules: Record<string, { code?: string | undefined }>,
	segments: ChunkSegmentInput[],
): ClientChunk => ({
	...chunkWithMap(fileName, modules, segments),
	code,
});

// The recorded span of a mint is the call's *argument-list* extent (open paren
// through close paren), which only the call's own execution can emit. The
// helper locates the needle's open paren and spans from there to the end of
// the needle, the way the source scan records mint spans.
const mintSpanOfText = (sourceText: string, needle: string): SourceSpan => {
	const index = sourceText.indexOf(needle);
	assert.notEqual(index, -1, `mint span needle ${needle} not found in source`);
	const openParenOffset = needle.indexOf('(');
	const before = sourceText.slice(0, index + openParenOffset);
	const after = sourceText.slice(0, index + needle.length);
	const beforeLines = before.split('\n');
	const afterLines = after.split('\n');
	return {
		startCol: beforeLines[beforeLines.length - 1].length,
		startLine: beforeLines.length - 1,
		endCol: afterLines[afterLines.length - 1].length,
		endLine: afterLines.length - 1,
	};
};

// The chunk source map a real build emitted for a chunk, as written by the
// harness dump plugin before the guard strips the maps from the output.
const readChunkMap = async (
	fixtureDirectory: string,
	chunkFileName: string,
) => {
	const raw = await readFile(
		path.join(
			fixtureDirectory,
			'chunk-maps',
			`${chunkFileName.replaceAll('/', '_')}.json`,
		),
		'utf8',
	);
	return (JSON.parse(raw) as { map: RawSourceMapShape | null }).map;
};

const createFixture = async (files: Record<string, string>) => {
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
	customSourcemapFileNames = false,
	coarsenSplitMap = false,
	forgeSplitMap = false,
	forgeSplitMapInCall = false,
	emitKeepMap = false,
	keepMapContentEqualsChunkMap = false,
	replaceOwnedMapAsset = false,
	renameModuleCallee = false,
}: {
	files: Record<string, string>;
	groupProbeModules?: boolean;
	inventory: readonly ContextInventoryEntry[];
	rootImportsProbe?: boolean;
	customSourcemapFileNames?: boolean | string;
	coarsenSplitMap?: boolean;
	forgeSplitMap?: boolean;
	forgeSplitMapInCall?: boolean;
	emitKeepMap?: boolean;
	keepMapContentEqualsChunkMap?: boolean;
	replaceOwnedMapAsset?: boolean | 'trimmed' | 'stub';
	renameModuleCallee?: boolean;
}) => {
	// Which asset bytes the r26 fixture emits over the guard's own forced
	// map: the default foreign artifact, or one of the round-27 subsets.
	const ownedMapAssetSource =
		replaceOwnedMapAsset === 'trimmed'
			? 'JSON.stringify({ ...chunk.map, sourcesContent: undefined })'
			: replaceOwnedMapAsset === 'stub'
				? '\'{"version":3}\''
				: '\'{"version":3,"sources":[],"mappings":"","foreign":true}\'';
	let buildOptions = '';
	if (groupProbeModules) {
		buildOptions =
			"build: { rolldownOptions: { output: { advancedChunks: { groups: [{ name: 'probe-pair', test: /src[\\/]routes[\\/]probe\\.tsx/ }] } } } },";
	} else if (customSourcemapFileNames) {
		const pattern =
			typeof customSourcemapFileNames === 'string'
				? customSourcemapFileNames
				: 'maps/[name]-[hash].map';
		buildOptions = `build: { rolldownOptions: { output: { sourcemapFileNames: ${JSON.stringify(
			pattern,
		)} } } },`;
	}
	const fixtureDirectory = await createFixture({
		'vite.config.mjs': `
			import path from 'node:path';
			import { mkdirSync, writeFileSync } from 'node:fs';
			import { defineConfig } from 'vite';
			import { tanstackStart } from '@tanstack/react-start/plugin/vite';
			import viteReact from '@vitejs/plugin-react';
			import { contextChunkIsolationPlugin } from ${JSON.stringify(
				path.join(
					frontDirectory,
					'tools/vite/check-context-chunk-isolation.mts',
				),
			)};
			${
				forgeSplitMapInCall
					? `import { findEmittedCallExtents } from ${JSON.stringify(
							path.join(frontDirectory, 'tools/vite/context-source-map.mts'),
						)};`
					: ''
			}
			${
				forgeSplitMapInCall
					? `const SOURCE_MAP_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
						const encodeVlq = (value) => { let encoded = ''; let vlq = value < 0 ? (-value << 1) | 1 : value << 1; do { let digit = vlq & 31; vlq >>>= 5; if (vlq > 0) digit |= 32; encoded += SOURCE_MAP_BASE64[digit]; } while (vlq > 0); return encoded; };
						const encodeSourceMap = ({ sources, segments }) => { let mappings = ''; let prevSource = 0; let prevOrigLine = 0; let prevOrigCol = 0; const byLine = new Map(); let maxLine = 0; for (const s of segments) { const l = byLine.get(s.genLine) ?? []; l.push(s); byLine.set(s.genLine, l); maxLine = Math.max(maxLine, s.genLine); } for (let line = 0; line <= maxLine; line++) { const ls = byLine.get(line) ?? []; ls.sort((a, b) => a.genCol - b.genCol); let genCol = 0; const enc = []; for (const s of ls) { const f = [s.genCol - genCol]; genCol = s.genCol; if (s.sourceIndex !== undefined) { f.push(s.sourceIndex - prevSource); prevSource = s.sourceIndex; f.push(s.origLine - prevOrigLine); prevOrigLine = s.origLine; f.push(s.origCol - prevOrigCol); prevOrigCol = s.origCol; } enc.push(f.map(encodeVlq).join('')); } mappings += (line > 0 ? ';' : '') + enc.join(','); } return { version: 3, sources, sourcesContent: [], mappings }; };`
					: ''
			}

			const rootDirectory = import.meta.dirname;
			export default defineConfig({
				${buildOptions}
				plugins: [
					${
						emitKeepMap
							? `{
							name: 'r22-emit-keep-map',
							applyToEnvironment: (environment) => environment.name === 'client',
							${keepMapContentEqualsChunkMap ? 'generateBundle(_options, bundle)' : 'buildStart()'} {
								${
									keepMapContentEqualsChunkMap
										? `const keepSource = Object.values(bundle).find((output) => output.type === 'chunk' && output.map)?.map; this.emitFile({ type: 'asset', fileName: 'assets/keep.map', source: JSON.stringify(keepSource) });`
										: `this.emitFile({ type: 'asset', fileName: 'assets/keep.map', source: '{"version":3,"sources":[],"mappings":""}' });`
								}
							},
						},`
							: ''
					}
					${
						forgeSplitMapInCall
							? `{
							name: 'r23-forge-split-map-in-call',
							applyToEnvironment: (environment) => environment.name === 'client',
							generateBundle(_options, bundle) {
								for (const chunk of Object.values(bundle)) {
									if (chunk.type !== 'chunk' || !chunk.map) {
										continue;
									}
									const splitModuleId = Object.keys(chunk.modules).find((id) => id.includes('?tsr-split=component'));
									if (!splitModuleId) {
										continue;
									}
									const firstCall = findEmittedCallExtents(chunk.code)[0];
									const forgedGen = firstCall ? firstCall.startCol + 1 : 2;
									chunk.map = { version: 3, sources: [splitModuleId], mappings: encodeSourceMap({ sources: [splitModuleId], segments: [
										{ sourceIndex: 0, genLine: 0, genCol: 0, origLine: 0, origCol: 0 },
										{ sourceIndex: 0, genLine: 0, genCol: 1, origLine: 0, origCol: 0 },
										{ sourceIndex: 0, genLine: 0, genCol: forgedGen, origLine: 0, origCol: 1 },
									] }).mappings };
								}
							},
						},`
							: ''
					}
					${
						forgeSplitMap
							? `{
							name: 'r22-forge-split-map',
							applyToEnvironment: (environment) => environment.name === 'client',
							generateBundle(_options, bundle) {
								for (const chunk of Object.values(bundle)) {
									if (chunk.type !== 'chunk' || !chunk.map) {
										continue;
									}
									const splitModuleId = Object.keys(chunk.modules).find((id) => id.includes('?tsr-split=component'));
									if (!splitModuleId) {
										continue;
									}
									chunk.map = { version: 3, sources: [splitModuleId], mappings: 'AAAA,AACA' };
								}
							},
						},`
							: ''
					}
						${
							renameModuleCallee
								? `{
						name: 'r26-rename-module-callee',
						applyToEnvironment: (environment) => environment.name === 'client',
						generateBundle(_options, bundle) {
							for (const chunk of Object.values(bundle)) {
								if (chunk.type !== 'chunk') continue;
								for (const [moduleId, rendered] of Object.entries(chunk.modules)) {
									if (typeof rendered.code !== 'string') continue;
									chunk.modules[moduleId] = {
										...rendered,
										code: rendered.code.replace(/\\bcreateStrictContext\\b/g, 'm').replace(/\\bcreateContext\\b/g, 'c'),
									};
								}
							}
						},
					},`
								: ''
						}
					{ applyToEnvironment: (environment) => environment.name === 'client', generateBundle(_options, bundle) { const chunks = Object.values(bundle).filter((output) => output.type === 'chunk'); writeFileSync(path.join(rootDirectory, 'bundle-map.json'), JSON.stringify(chunks.map((chunk) => ({ fileName: chunk.fileName, modules: Object.fromEntries(Object.entries(chunk.modules).map(([id, rendered]) => [id, rendered.code])) })), null, 2)); mkdirSync(path.join(rootDirectory, 'chunk-maps'), { recursive: true }); for (const chunk of chunks) { if (chunk.map) writeFileSync(path.join(rootDirectory, 'chunk-maps', \`\${chunk.fileName.replaceAll('/', '_')}.json\`), JSON.stringify({ fileName: chunk.fileName, map: chunk.map }, null, 2)); } } },
					${
						replaceOwnedMapAsset
							? `{
						name: 'r26-replace-owned-map-asset',
						applyToEnvironment: (environment) => environment.name === 'client',
						generateBundle(_options, bundle) {
							for (const chunk of Object.values(bundle)) {
								if (chunk.type !== 'chunk' || chunk.map === undefined || chunk.map === null) continue;
								const fileName = \`\${chunk.name}.map\`;
								const source = ${ownedMapAssetSource};
								this.emitFile({ type: 'asset', fileName, source });
								writeFileSync(path.join(rootDirectory, 'replaced-chunk.json'), JSON.stringify({ fileName, source }));
								break;
							}
						},
					},`
							: ''
					}
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
					${
						coarsenSplitMap
							? `{
							name: 'r20-coarsen-split-map',
							applyToEnvironment: (environment) => environment.name === 'client',
							transform(code, id) {
								if (!id.includes('?tsr-split=component')) {
									return null;
								}
								return {
									code,
									map: {
										version: 3,
										sources: [id],
										sourcesContent: [code],
										mappings: new Array(code.split('\\n').length)
											.fill('AAAA')
											.join(';'),
									},
								};
							},
						},`
							: ''
					}
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
		const failure = error as {
			stdout?: string;
			stderr?: string;
			code?: number;
		};
		return {
			fixtureDirectory,
			output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
			status: failure.code ?? 1,
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
		const nameInSourceFile = (name: string, relativeSourceFile: string) =>
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
			import type { Context } from 'react';
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
		const nameInSourceFile = (name: string, relativeSourceFile: string) =>
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

void test('does not inventory an interface whose heritage reference does not resolve', async () => {
	const fixtureDirectory = await createFixture({
		'src/nonsense.ts': `
			export interface HttpClient extends UndeclaredBaseClient { readonly get: (u: string) => Promise<string> }
			declare const makeClient: () => HttpClient;
			export const NotAContext = makeClient();
		`,
		'src/unresolved-generic.ts': `
			export interface NotAContext<T> extends ThisNameDoesNotExistAnywhere<T> { readonly x: true; }
			declare const makeNotAContext: <T,>() => NotAContext<T>;
			export const NotAContextValue = makeNotAContext<null>();
		`,
		'src/react-ref.ts': `
			import { createElement } from 'react';
			void createElement;
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		assert.deepEqual(contexts, []);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('discovers a context whose interface heritage clause sits on a later merged declaration', async () => {
	const fixtureDirectory = await createFixture({
		'src/make.ts': `
			import { createContext } from 'react';
			export const mk = <T,>(value: T) => createContext(value);
		`,
		'src/merged-second.ts': `
			import { mk } from './make';
			import type { Context } from 'react';
			interface Merged<T> { readonly tag: 'merged' }
			interface Merged<T> extends Context<T> {}
			export const M1 = mk<null>(null) as unknown as Merged<null>;
		`,
		'src/merged-first.ts': `
			import { mk } from './make';
			import type { Context } from 'react';
			interface Merged2<T> extends Context<T> {}
			interface Merged2<T> { readonly tag: 'merged' }
			export const M2 = mk<null>(null) as unknown as Merged2<null>;
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		for (const [name, relativeSourceFile] of [
			['M1', 'src/merged-second.ts'],
			['M2', 'src/merged-first.ts'],
		]) {
			assert.equal(
				contexts.some(
					(context) =>
						context.name === name &&
						context.sourceFile ===
							path.join(fixtureDirectory, relativeSourceFile),
				),
				true,
				name,
			);
		}
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('discovers a context whose interface heritage is a generic type alias of Context', async () => {
	const fixtureDirectory = await createFixture({
		'src/make.ts': `
			import { createContext } from 'react';
			import type { Context } from 'react';
			export type CtxAlias<T> = Context<T>;
			export const mk = <T,>(value: T) => createContext(value);
		`,
		'src/alias-branded.ts': `
			import { mk, type CtxAlias } from './make';
			interface AliasBranded<T> extends CtxAlias<T> { readonly ab: true }
			declare const brand: <T,>() => AliasBranded<T>;
			export const N4 = brand<null>();
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		assert.equal(
			contexts.some(
				(context) =>
					context.name === 'N4' &&
					context.sourceFile ===
						path.join(fixtureDirectory, 'src/alias-branded.ts'),
			),
			true,
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('discovers contexts destructured out of a cross-file factory call', async () => {
	const fixtureDirectory = await createFixture({
		'src/make.ts': `
			import { createContext } from 'react';
			export const makeContexts = <T,>(fallback: T) => ({ probe: createContext(fallback) });
			export const makeTuple = <T,>(fallback: T) => [createContext(fallback)];
			export const makePair = <T,>(fallback: T) => [null, createContext(fallback)] as const;
			export const makeNested = <T,>(fallback: T) => ({ inner: { probe: createContext(fallback) } });
			export const makeNestedTuple = <T,>(fallback: T) => [[createContext(fallback)]];
		`,
		'src/c1-object-destructure-call.ts': `
			import { makeContexts } from './make';
			export const { probe: ProbeContext } = makeContexts<null>(null);
		`,
		'src/c2-renamed-destructure-call.ts': `
			import { makeContexts } from './make';
			export const { probe: RenamedContext } = makeContexts<null>(null);
		`,
		'src/c3-array-destructure-call.ts': `
			import { makeTuple } from './make';
			export const [TupleContext] = makeTuple<null>(null);
		`,
		'src/c5-elided-destructure-call.ts': `
			import { makePair } from './make';
			export const [, ElidedContext] = makePair<null>(null);
		`,
		'src/c6-nested-object-destructure-call.ts': `
			import { makeNested } from './make';
			export const { inner: { probe: NestedContext } } = makeNested<null>(null);
		`,
		'src/c7-nested-array-destructure-call.ts': `
			import { makeNestedTuple } from './make';
			export const [[NestedTupleContext]] = makeNestedTuple<null>(null);
		`,
		'src/c4-inline-holder-destructure.ts': `
			import { createContext } from 'react';
			export const { Ctx } = { Ctx: createContext<null>(null) };
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		const nameInSourceFile = (name: string, relativeSourceFile: string) =>
			contexts.some(
				(context) =>
					context.name === name &&
					context.sourceFile ===
						path.join(fixtureDirectory, relativeSourceFile),
			);
		for (const [name, relativeSourceFile] of [
			['ProbeContext', 'src/c1-object-destructure-call.ts'],
			['RenamedContext', 'src/c2-renamed-destructure-call.ts'],
			['TupleContext', 'src/c3-array-destructure-call.ts'],
			['ElidedContext', 'src/c5-elided-destructure-call.ts'],
			['NestedContext', 'src/c6-nested-object-destructure-call.ts'],
			['NestedTupleContext', 'src/c7-nested-array-destructure-call.ts'],
		]) {
			assert.equal(nameInSourceFile(name, relativeSourceFile), true, name);
		}

		// An inline holder mint in the same statement is tracked as the
		// holder-position `<anonymous context>`, not as the binding.
		assert.equal(
			nameInSourceFile('Ctx', 'src/c4-inline-holder-destructure.ts'),
			false,
			'Ctx',
		);
		assert.equal(
			nameInSourceFile(
				'<anonymous context>',
				'src/c4-inline-holder-destructure.ts',
			),
			true,
			'<anonymous context>',
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
		'src/as-wrapped-holder.tsx': `
			import { createStrictContext } from './make-context';
			import type { StrictContext } from './make-context';
			export const contexts = { probe: createStrictContext<null>(null) as StrictContext<null> };
		`,
		'src/paren-wrapped-holder.tsx': `
			import { createStrictContext } from './make-context';
			export const contexts = { probe: (createStrictContext<null>(null)) };
		`,
		'src/export-default-as.tsx': `
			import { createStrictContext } from './make-context';
			import type { StrictContext } from './make-context';
			export default createStrictContext<null>(null) as StrictContext<null>;
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
			'src/as-wrapped-holder.tsx',
			'src/paren-wrapped-holder.tsx',
			'src/export-default-as.tsx',
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

void test('records the exact source span of each discovered holder mint', async () => {
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
		'src/export-default.tsx': `
			import { createStrictContext } from './make-context';
			export default createStrictContext<null>(null);
		`,
		'src/as-wrapped-holder.tsx': `
			import { createStrictContext } from './make-context';
			import type { StrictContext } from './make-context';
			export const contexts = { probe: createStrictContext<null>(null) as StrictContext<null> };
		`,
		'src/nested-holder.tsx': `
			import { createStrictContext } from './make-context';
			export const contexts = { outer: { probe: createStrictContext<null>(null) } };
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		const spansIn = (relativeSourceFile: string) =>
			contexts.find(
				(context) =>
					context.name === '<anonymous context>' &&
					context.sourceFile ===
						path.join(fixtureDirectory, relativeSourceFile),
			)?.mintSpans;
		const sourceOf = (relativeSourceFile: string) =>
			readFile(path.join(fixtureDirectory, relativeSourceFile), 'utf8');
		assert.deepEqual(spansIn('src/object-holder.tsx'), [
			mintSpanOfText(
				await sourceOf('src/object-holder.tsx'),
				'createStrictContext<null>(null)',
			),
		]);
		assert.deepEqual(spansIn('src/array-holder.tsx'), [
			mintSpanOfText(
				await sourceOf('src/array-holder.tsx'),
				'createStrictContext<null>(null)',
			),
		]);
		assert.deepEqual(spansIn('src/export-default.tsx'), [
			mintSpanOfText(
				await sourceOf('src/export-default.tsx'),
				'createStrictContext<null>(null)',
			),
		]);
		assert.deepEqual(spansIn('src/as-wrapped-holder.tsx'), [
			mintSpanOfText(
				await sourceOf('src/as-wrapped-holder.tsx'),
				'createStrictContext<null>(null)',
			),
		]);
		assert.deepEqual(spansIn('src/nested-holder.tsx'), [
			mintSpanOfText(
				await sourceOf('src/nested-holder.tsx'),
				'createStrictContext<null>(null)',
			),
		]);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('tracks a comma-chain holder mint only when the call is the chain value', async () => {
	const fixtureDirectory = await createFixture({
		'src/make-context.ts': `
			import { createContext } from 'react';
			export const createStrictContext = <T,>(fallback: T) => createContext(fallback);
		`,
		'src/comma-right-holder.tsx': `
			import { createStrictContext } from './make-context';
			export const contexts = { probe: (0, createStrictContext<null>(null)) };
		`,
		'src/comma-discarded-holder.tsx': `
			import { createStrictContext } from './make-context';
			export const contexts = { probe: (createStrictContext<null>(null), 0) };
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		const discoveredIn = (relativeSourceFile: string) =>
			contexts.some(
				(context) =>
					context.sourceFile ===
					path.join(fixtureDirectory, relativeSourceFile),
			);
		assert.equal(discoveredIn('src/comma-right-holder.tsx'), true);
		assert.equal(discoveredIn('src/comma-discarded-holder.tsx'), false);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('discovers each mint inside a conditional holder expression with its own span', async () => {
	const fixtureDirectory = await createFixture({
		'src/make-context.ts': `
			import { createContext } from 'react';
			export const createStrictContext = <T,>(fallback: T) => createContext(fallback);
			export const makeContexts = <T,>(fallback: T) => ({ probe: createContext(fallback) });
		`,
		'src/conditional-holder.tsx': `
			import { createStrictContext } from './make-context';
			export const contexts = { probe: Math.random() > -1 ? createStrictContext<null>(null) : createStrictContext<null>(null) };
		`,
		'src/spread-holder.tsx': `
			import { makeContexts } from './make-context';
			export const contexts = { ...makeContexts<null>(null) };
		`,
		'src/record-property-holder.tsx': `
			import { makeContexts } from './make-context';
			export const contexts = { probe: makeContexts<null>(null) };
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		const discoveredIn = (relativeSourceFile: string) =>
			contexts.filter(
				(context) =>
					context.name === '<anonymous context>' &&
					context.sourceFile ===
						path.join(fixtureDirectory, relativeSourceFile),
			);
		const sourceOf = (relativeSourceFile: string) =>
			readFile(path.join(fixtureDirectory, relativeSourceFile), 'utf8');

		// Each branch of the conditional is a separate mint at its own span,
		// so a copy executing either branch is attributed.
		const conditionalSpans = discoveredIn('src/conditional-holder.tsx');
		assert.equal(conditionalSpans.length, 2);
		const conditionalSource = await sourceOf('src/conditional-holder.tsx');
		const firstSpan = mintSpanOfText(
			conditionalSource,
			'createStrictContext<null>(null)',
		);
		const secondNeedle = 'createStrictContext<null>(null)';
		const secondOccurrence = conditionalSource.indexOf(
			secondNeedle,
			conditionalSource.indexOf(secondNeedle) + secondNeedle.length,
		);
		assert.notEqual(secondOccurrence, -1);
		// The second occurrence's span is the argument-list extent of the call
		// at that occurrence, not the whole call.
		const secondOpenParen = secondOccurrence + secondNeedle.indexOf('(');
		const secondBefore = conditionalSource.slice(0, secondOpenParen);
		const secondAfter = conditionalSource.slice(
			0,
			secondOccurrence + secondNeedle.length,
		);
		const secondLastBefore = secondBefore.split('\n').at(-1) ?? '';
		const secondLastAfter = secondAfter.split('\n').at(-1) ?? '';
		const secondSpan: SourceSpan = {
			startCol: secondLastBefore.length,
			startLine: secondBefore.split('\n').length - 1,
			endCol: secondLastAfter.length,
			endLine: secondAfter.split('\n').length - 1,
		};
		assert.deepEqual(
			conditionalSpans.map((context) => context.mintSpans),
			[[firstSpan], [secondSpan]],
		);

		// A spread of a context record and a record held in a property are
		// both mints at the factory call's own span.
		const spreadSpans = discoveredIn('src/spread-holder.tsx');
		assert.equal(spreadSpans.length, 1);
		assert.deepEqual(spreadSpans[0].mintSpans, [
			mintSpanOfText(
				await sourceOf('src/spread-holder.tsx'),
				'makeContexts<null>(null)',
			),
		]);
		const recordSpans = discoveredIn('src/record-property-holder.tsx');
		assert.equal(recordSpans.length, 1);
		assert.deepEqual(recordSpans[0].mintSpans, [
			mintSpanOfText(
				await sourceOf('src/record-property-holder.tsx'),
				'makeContexts<null>(null)',
			),
		]);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('records a named conditional createContext declaration as one inventory entry', async () => {
	const fixtureDirectory = await createFixture({
		'src/conditional-declaration.tsx': `
			import { createContext } from 'react';
			export const ConditionalContext = Math.random() > -1
				? createContext(null)
				: createContext(null);
		`,
	});

	try {
		const contexts = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		// One declaration, one inventory entry: the branch calls are mint
		// spans of the named entry, never phantom anonymous entries.
		assert.deepEqual(
			contexts.map((context) => context.name),
			['ConditionalContext'],
		);
		const [entry] = contexts;
		const mintSpans = entry.mintSpans ?? [];
		assert.equal(mintSpans.length, 2);
		assert.notDeepEqual(mintSpans[0], mintSpans[1]);
		assert.equal(mintSpans[0]?.startLine, 3);
		assert.equal(mintSpans[1]?.startLine, 4);
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
		const nameInSourceFile = (name: string, relativeSourceFile: string) =>
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
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };
	const elementAccessCode =
		"const RouteContext = React['createContext'](null);";

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile, mintSpans: [mintSpan] }],
			[
				chunkWithMap(
					'assets/route.js',
					{ [sourceFile]: { code: elementAccessCode } },
					[
						{
							source: sourceFile,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
				chunkWithMap(
					'assets/route-component.js',
					{ [splitModule]: { code: elementAccessCode } },
					[
						{
							source: splitModule,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
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
		const discovered = findReactContextDeclarations(
			path.join(fixtureDirectory, 'tsconfig.json'),
		);
		assert.equal(discovered.length, 1);
		assert.equal(discovered[0].name, 'NamespaceContext');
		assert.equal(
			discovered[0].sourceFile,
			path.join(fixtureDirectory, 'src/namespace-call.ts'),
		);
		assert.deepEqual(discovered[0].mintSpans, [
			mintSpanOfText(
				await readFile(
					path.join(fixtureDirectory, 'src/namespace-call.ts'),
					'utf8',
				),
				'React.createContext(null)',
			),
		]);
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
			(error: Error) => {
				assert.match(
					error.message,
					/cannot prove a dynamic React element access/i,
				);
				assert.match(error.message, /dynamic-element-access\.ts/);
				return true;
			},
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
			(error: Error) => {
				assert.match(
					error.message,
					/cannot prove a dynamic React element access/i,
				);
				assert.match(error.message, /hoisted-dynamic-element-access\.ts/);
				return true;
			},
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
			(error: Error) => {
				assert.match(
					error.message,
					/cannot prove a dynamic React element access/i,
				);
				assert.match(error.message, /dynamic-object-holder\.ts/);
				return true;
			},
		);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});

void test('fails closed when a consumer copy references a context without minting it', () => {
	const sourceFile = path.join(frontDirectory, 'src/lib/shared-context.tsx');
	const sourceText = `
		const Ctx = createContext(null);
		const value = useContext(Ctx);
	`;
	const mintSpan = mintSpanOfText(sourceText, 'createContext(null)');
	const referenceSpan = mintSpanOfText(sourceText, 'useContext(Ctx)');

	// The second copy consumes the context (`useContext(Ctx)`) and never
	// executes the mint. Its map ties its emitted call to the consumption
	// span, outside the mint span — the same observable shape as a forged map
	// hiding a mint, so the single emitted-call classifier cannot verify the
	// copy and the build fails closed instead of trusting a spelling.
	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: 'Ctx',
						sourceFile,
						mintSpans: [mintSpan],
					},
				],
				[
					chunkWithMap(
						'assets/a.js',
						{ [sourceFile]: { code: 'const Ctx = createContext(null);' } },
						[
							{
								source: sourceFile,
								origLine: mintSpan.startLine,
								origCol: mintSpan.startCol + 5,
								genLine: 0,
								genCol: 4,
							},
						],
					),
					chunkWithMap(
						'assets/b.js',
						{ [sourceFile]: { code: 'const value = useContext(Ctx);' } },
						[
							{
								source: sourceFile,
								origLine: referenceSpan.startLine,
								origCol: referenceSpan.startCol,
								genLine: 0,
								genCol: 4,
							},
						],
					),
				],
				frontDirectory,
			),
		/cannot classify how Ctx .* is created/i,
	);
});

void test('reports each React context whose source module is in multiple client chunks', () => {
	const sourceFile = path.join(frontDirectory, 'src/two-contexts.ts');
	const sourceText = `
		const FirstContext = createContext(null);
		const SecondContext = createContext(null);
	`;
	const firstSpan = mintSpanOfText(sourceText, 'createContext(null)');
	const secondSpan = mintSpanOfText(sourceText, 'createContext(null)');
	const contexts = [
		{ name: 'FirstContext', sourceFile, mintSpans: [firstSpan] },
		{ name: 'SecondContext', sourceFile, mintSpans: [secondSpan] },
	];
	const firstChunk = chunkWithMap(
		'assets/first.js',
		{ [sourceFile]: { code: sourceText } },
		[
			{
				source: sourceFile,
				origLine: firstSpan.startLine,
				origCol: firstSpan.startCol + 5,
				genLine: 0,
				genCol: 4,
			},
			{
				source: sourceFile,
				origLine: secondSpan.startLine,
				origCol: secondSpan.startCol + 5,
				genLine: 0,
				genCol: 20,
			},
		],
	);
	const secondChunk = chunkWithMap(
		'assets/second.js',
		{ [sourceFile]: { code: sourceText } },
		[
			{
				source: sourceFile,
				origLine: firstSpan.startLine,
				origCol: firstSpan.startCol + 5,
				genLine: 0,
				genCol: 4,
			},
			{
				source: sourceFile,
				origLine: secondSpan.startLine,
				origCol: secondSpan.startCol + 5,
				genLine: 0,
				genCol: 20,
			},
		],
	);

	assert.deepEqual(
		findContextChunkIsolationViolations(
			contexts,
			[firstChunk, secondChunk],
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
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile, mintSpans: [mintSpan] }],
			[
				chunkWithMap(
					'assets/route.js',
					{
						[sourceFile]: { code: 'const RouteContext = createContext(null);' },
					},
					[
						{
							source: sourceFile,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
				chunkWithMap(
					'assets/route-component.js',
					{
						[splitModule]: {
							code: 'const RouteContext = createContext(null);',
						},
					},
					[
						{
							source: splitModule,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
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
	const hydratedModule = `${sourceFile}?tss-hydrate=H1`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile, mintSpans: [mintSpan] }],
			[
				chunkWithMap(
					'assets/route.js',
					{
						[sourceFile]: { code: 'const RouteContext = createContext(null);' },
					},
					[
						{
							source: sourceFile,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
				chunkWithMap(
					'assets/hydrated.js',
					{
						[hydratedModule]: {
							code: 'const RouteContext = createContext(null);',
						},
					},
					[
						{
							source: hydratedModule,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
			],
			frontDirectory,
		),
		[
			'RouteContext in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/hydrated.js.',
		],
	);
});

void test('attributes a rendered mint by source position regardless of its rendered callee name', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	// Both copies execute the mint; the rendered spelling is a renamed
	// helper the guard has never heard of. The map is the only evidence, and
	// the position matches, so both copies are creators.
	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile, mintSpans: [mintSpan] }],
			[
				chunkWithMap(
					'assets/route.js',
					{ [sourceFile]: { code: 'const RouteContext = otherHelper(null);' } },
					[
						{
							source: sourceFile,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
				chunkWithMap(
					'assets/route-component.js',
					{
						[splitModule]: { code: 'const RouteContext = otherHelper(null);' },
					},
					[
						{
							source: splitModule,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
			],
			frontDirectory,
		),
		[
			'RouteContext in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/route-component.js.',
		],
	);
});

void test('counts a rendered factory mint held in an array element as a creator', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: '<anonymous context>', sourceFile, mintSpans: [mintSpan] }],
			[
				chunkWithMap(
					'assets/route.js',
					{
						[sourceFile]: {
							code: 'var contexts = [make_context_default(null)];',
						},
					},
					[
						{
							source: sourceFile,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
				chunkWithMap(
					'assets/route-component.js',
					{
						[splitModule]: {
							code: 'var contexts = [make_context_default(null)];',
						},
					},
					[
						{
							source: splitModule,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
			],
			frontDirectory,
		),
		[
			'<anonymous context> in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/route-component.js.',
		],
	);
});

void test('counts a rendered factory mint held in an export default as a creator', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: '<anonymous context>', sourceFile, mintSpans: [mintSpan] }],
			[
				chunkWithMap(
					'assets/route.js',
					{
						[sourceFile]: {
							code: 'export default make_context_default(null);',
						},
					},
					[
						{
							source: sourceFile,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
				chunkWithMap(
					'assets/route-component.js',
					{
						[splitModule]: {
							code: 'export default make_context_default(null);',
						},
					},
					[
						{
							source: splitModule,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
			],
			frontDirectory,
		),
		[
			'<anonymous context> in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/route-component.js.',
		],
	);
});

void test('fails closed when no rendered copy of a holder-mint module is attributed a mint', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: '<anonymous context>',
						sourceFile,
						mintSpans: [mintSpan],
					},
				],
				[
					chunkWithMap(
						'assets/route.js',
						{ [sourceFile]: { code: 'var route = {};' } },
						[
							{
								source: sourceFile,
								origLine: 5,
								origCol: 17,
								genLine: 0,
								genCol: 4,
							},
						],
					),
					chunkWithMap(
						'assets/route-component.js',
						{ [splitModule]: { code: 'var SplitComponent = () => null;' } },
						[
							{
								source: splitModule,
								origLine: 5,
								origCol: 17,
								genLine: 0,
								genCol: 4,
							},
						],
					),
				],
				frontDirectory,
			),
		/cannot classify how <anonymous context> .* is created/i,
	);
});

void test('fails when two positioned holder mints of a module share one chunk', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[
				{
					name: '<anonymous context>',
					sourceFile,
					mintSpans: [mintSpan],
				},
			],
			[
				chunkWithMap(
					'assets/probe-pair.js',
					{
						[sourceFile]: {
							code: 'var contexts = { probe: make_context_default(null) };',
						},
						[splitModule]: {
							code: 'var contexts = { probe: make_context_default(null) };',
						},
					},
					[
						{
							source: sourceFile,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
						{
							source: splitModule,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 40,
						},
					],
				),
			],
			frontDirectory,
		),
		[
			'<anonymous context> in src/routes/field-validation.tsx is created by multiple client modules in chunk: assets/probe-pair.js.',
		],
	);
});

void test('passes a single delivered copy of a holder-position mint when no rendered call is attributed', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[
				{
					name: '<anonymous context>',
					sourceFile,
					mintSpans: [mintSpan],
				},
			],
			[
				chunkWithMap(
					'assets/route.js',
					{ [sourceFile]: { code: 'var route = {};' } },
					[
						{
							source: sourceFile,
							origLine: 5,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
			],
			frontDirectory,
		),
		[],
	);
});

void test('fails closed when one rendered copy of a split module mints while the other only holds the route shim', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	// The split copy mints (its map ties its call to the mint span); the
	// reference copy is the genuine TanStack route shim and never executes the
	// mint. Its map ties its call to a position outside the mint span — the
	// same observable shape as a forged map, so the single emitted-call
	// classifier cannot verify the shim copy and the build fails closed. A
	// name-based check would have called the shim "provably non-minting", but
	// a minifier renames the mint to `m(null)` and the same check declares a
	// genuinely minting copy non-minting — the round-25 bypass.
	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: '<anonymous context>',
						sourceFile,
						mintSpans: [mintSpan],
					},
				],
				[
					chunkWithMap(
						'assets/route.js',
						{ [sourceFile]: { code: 'var route = {};' } },
						[
							{
								source: sourceFile,
								origLine: 5,
								origCol: 17,
								genLine: 0,
								genCol: 4,
							},
						],
					),
					chunkWithMap(
						'assets/route-component.js',
						{
							[splitModule]: {
								code: 'var contexts = { probe: createStrictContext(null) };',
							},
						},
						[
							{
								source: splitModule,
								origLine: 0,
								origCol: 17,
								genLine: 0,
								genCol: 4,
							},
						],
					),
				],
				frontDirectory,
			),
		/cannot classify how <anonymous context> .* is created/i,
	);
});

void test('attributes a rendered holder mint at a recorded source position', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[
				{
					name: '<anonymous context>',
					sourceFile,
					mintSpans: [mintSpan],
				},
			],
			[
				chunkWithMap(
					'assets/route.js',
					{
						[sourceFile]: {
							code: 'var contexts = { probe: createStrictContext(null) };',
						},
					},
					[
						{
							source: sourceFile,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
				chunkWithMap(
					'assets/route-component.js',
					{
						[splitModule]: {
							code: 'var contexts = { probe: createStrictContext(null) };',
						},
					},
					[
						{
							source: splitModule,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
			],
			frontDirectory,
		),
		[
			'<anonymous context> in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/route-component.js.',
		],
	);
});

void test('attributes a rendered IIFE holder mint at its recorded source position', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[
				{
					name: '<anonymous context>',
					sourceFile,
					mintSpans: [mintSpan],
				},
			],
			[
				chunkWithMap(
					'assets/route.js',
					{
						[sourceFile]: {
							code: 'var contexts = { probe: (() => createStrictContext(null))() };',
						},
					},
					[
						{
							source: sourceFile,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
				chunkWithMap(
					'assets/route-component.js',
					{
						[splitModule]: {
							code: 'var contexts = { probe: (() => createStrictContext(null))() };',
						},
					},
					[
						{
							source: splitModule,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
			],
			frontDirectory,
		),
		[
			'<anonymous context> in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/route-component.js.',
		],
	);
});

void test('fails closed when a rendered copy ties its calls only outside the recorded mint positions', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };
	// Same line as the mint, but a column outside the recorded span: an
	// unrelated call that happens to be emitted near the mint is not
	// attributed to it — and a copy whose map ties only to that unrelated
	// position cannot be verified non-minting, so the build fails closed
	// instead of trusting a rendered-code spelling.
	const unrelatedSpan = { startLine: 0, startCol: 40, endLine: 0, endCol: 60 };

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: '<anonymous context>',
						sourceFile,
						mintSpans: [mintSpan],
					},
				],
				[
					chunkWithMap(
						'assets/route.js',
						{
							[sourceFile]: {
								code: 'var contexts = { probe: createStrictContext(null) };',
							},
						},
						[
							{
								source: sourceFile,
								origLine: 0,
								origCol: 17,
								genLine: 0,
								genCol: 4,
							},
						],
					),
					chunkWithMap(
						'assets/route-component.js',
						{
							[splitModule]: {
								code: 'var contexts = { probe: otherHelper(null) };',
							},
						},
						[
							{
								source: splitModule,
								origLine: 0,
								origCol: unrelatedSpan.startCol,
								genLine: 0,
								genCol: 4,
							},
						],
					),
				],
				frontDirectory,
			),
		/cannot classify how <anonymous context> .* is created/i,
	);
});

void test('fails closed when a copy ties a segment only to the mint call start', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	// The split copy emits only the callee *start* position (a callee
	// reference or a map that anchors there); the call's argument extent is
	// not emitted. The callee start alone must not count as an emitted mint:
	// only a segment strictly inside the call's extent proves the call. A
	// copy whose map ties only to the start boundary is unverifiable, so the
	// build fails closed instead of trusting a rendered-code spelling.
	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: '<anonymous context>',
						sourceFile,
						mintSpans: [mintSpan],
					},
				],
				[
					chunkWithMap(
						'assets/route.js',
						{
							[sourceFile]: {
								code: 'var contexts = { probe: createStrictContext(null) };',
							},
						},
						[
							{
								source: sourceFile,
								origLine: 0,
								origCol: 17,
								genLine: 0,
								genCol: 4,
							},
						],
					),
					chunkWithMap(
						'assets/route-component.js',
						{
							[splitModule]: {
								code: 'var contexts = { probe: otherHelper(null) };',
							},
						},
						[
							{
								source: splitModule,
								origLine: 0,
								origCol: mintSpan.startCol,
								genLine: 0,
								genCol: 4,
							},
						],
					),
				],
				frontDirectory,
			),
		/cannot classify how <anonymous context> .* is created/i,
	);
});

void test('fails closed when a delivered copy map collapses every position to the origin', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	// The split copy genuinely contains the mint (the emitted code carries
	// it), but its map collapses every generated line to original 0:0. The
	// reference copy is attributed through its precise map; the coarse copy
	// cannot answer, so the verdict must fail closed instead of silently
	// treating the copy as non-minting.
	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: '<anonymous context>',
						sourceFile,
						mintSpans: [mintSpan],
					},
				],
				[
					chunkWithMap(
						'assets/route.js',
						{
							[sourceFile]: {
								code: 'var contexts = { probe: createStrictContext(null) };',
							},
						},
						[
							{
								source: sourceFile,
								origLine: 0,
								origCol: 17,
								genLine: 0,
								genCol: 4,
							},
						],
					),
					chunkWithMap(
						'assets/route-component.js',
						{
							[splitModule]: {
								code: 'var contexts = { probe: createStrictContext(null) };',
							},
						},
						[
							{
								source: splitModule,
								origLine: 0,
								origCol: 0,
								genLine: 0,
								genCol: 4,
							},
						],
					),
				],
				frontDirectory,
			),
		/cannot classify how <anonymous context> .* is created: the build emits no source map for a client chunk delivering its source, or a delivered copy's map does not resolve precise original positions for it/i,
	);
});

void test('passes a single delivered copy even when its map collapses every position to the origin', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[
				{
					name: '<anonymous context>',
					sourceFile,
					mintSpans: [mintSpan],
				},
			],
			[
				chunkWithMap(
					'assets/route.js',
					{
						[sourceFile]: {
							code: 'var contexts = { probe: createStrictContext(null) };',
						},
					},
					[
						{
							source: sourceFile,
							origLine: 0,
							origCol: 0,
							genLine: 0,
							genCol: 4,
						},
					],
				),
			],
			frontDirectory,
		),
		[],
	);
});

void test('attributes a comma-chain-wrapped rendered holder mint at its recorded position', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[
				{
					name: '<anonymous context>',
					sourceFile,
					mintSpans: [mintSpan],
				},
			],
			[
				chunkWithMap(
					'assets/route.js',
					{
						[sourceFile]: {
							code: 'var contexts = { probe: (0, createStrictContext(null)) };',
						},
					},
					[
						{
							source: sourceFile,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
				chunkWithMap(
					'assets/route-component.js',
					{
						[splitModule]: {
							code: 'var contexts = { probe: (0, createStrictContext(null)) };',
						},
					},
					[
						{
							source: splitModule,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
			],
			frontDirectory,
		),
		[
			'<anonymous context> in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/route-component.js.',
		],
	);
});

void test('attributes a rendered holder mint through a deconflicted binding name', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[
				{
					name: '<anonymous context>',
					sourceFile,
					mintSpans: [mintSpan],
				},
			],
			[
				chunkWithMap(
					'assets/route.js',
					{
						[sourceFile]: {
							code: 'var contexts$1 = { probe: createStrictContext(null) };',
						},
					},
					[
						{
							source: sourceFile,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
				chunkWithMap(
					'assets/route-component.js',
					{
						[splitModule]: {
							code: 'var contexts$1 = { probe: createStrictContext(null) };',
						},
					},
					[
						{
							source: splitModule,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
			],
			frontDirectory,
		),
		[
			'<anonymous context> in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/route-component.js.',
		],
	);
});

void test('attributes a rendered holder mint through a nested property chain', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[
				{
					name: '<anonymous context>',
					sourceFile,
					mintSpans: [mintSpan],
				},
			],
			[
				chunkWithMap(
					'assets/route.js',
					{
						[sourceFile]: {
							code: 'var contexts = { outer: { probe: createStrictContext(null) } };',
						},
					},
					[
						{
							source: sourceFile,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
				chunkWithMap(
					'assets/route-component.js',
					{
						[splitModule]: {
							code: 'var contexts = { outer: { probe: createStrictContext(null) } };',
						},
					},
					[
						{
							source: splitModule,
							origLine: 0,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
			],
			frontDirectory,
		),
		[
			'<anonymous context> in src/routes/field-validation.tsx is present in multiple client chunks: assets/route.js, assets/route-component.js.',
		],
	);
});

void test('fails closed when a same-named helper call of another holder cannot be verified', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };
	// The unrelated helper lives at its own source position — the same
	// rendered property name and callee name cannot move it into the mint
	// span, because the bundler's map says it originated elsewhere. A copy
	// whose map ties only to that other position is unverifiable, so the
	// build fails closed instead of trusting a rendered-code spelling.
	const helperSpan = { startLine: 1, startCol: 8, endLine: 1, endCol: 24 };

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: '<anonymous context>',
						sourceFile,
						mintSpans: [mintSpan],
					},
				],
				[
					chunkWithMap(
						'assets/route.js',
						{
							[sourceFile]: {
								code: 'var contexts = { probe: make_context_default(null) };\nvar unrelatedHolder = { probe: mkDefault("sentinel") };',
							},
						},
						[
							{
								source: sourceFile,
								origLine: 0,
								origCol: 17,
								genLine: 0,
								genCol: 4,
							},
							{
								source: sourceFile,
								origLine: 1,
								origCol: 17,
								genLine: 0,
								genCol: 40,
							},
						],
					),
					chunkWithMap(
						'assets/route-component.js',
						{
							[splitModule]: {
								code: 'var unrelatedHolder = { probe: mkDefault("sentinel") };',
							},
						},
						[
							{
								source: splitModule,
								origLine: helperSpan.startLine,
								origCol: helperSpan.startCol,
								genLine: 0,
								genCol: 4,
							},
						],
					),
				],
				frontDirectory,
			),
		/cannot classify how <anonymous context> .* is created/i,
	);
});

void test('fails closed when a chunk delivering a context source emits no source map', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: '<anonymous context>',
						sourceFile,
						mintSpans: [mintSpan],
					},
				],
				[
					{
						fileName: 'assets/route.js',
						modules: {
							[sourceFile]: {
								code: 'var contexts = { probe: createStrictContext(null) };',
							},
						},
						type: 'chunk',
					},
					chunkWithMap(
						'assets/route-component.js',
						{
							[splitModule]: {
								code: 'var contexts = { probe: createStrictContext(null) };',
							},
						},
						[
							{
								source: splitModule,
								origLine: 0,
								origCol: 17,
								genLine: 0,
								genCol: 4,
							},
						],
					),
				],
				frontDirectory,
			),
		/no source map/i,
	);
});

void test('passes a single delivered copy when its chunk emits no source map', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[
				{
					name: '<anonymous context>',
					sourceFile,
					mintSpans: [mintSpan],
				},
			],
			[
				{
					fileName: 'assets/route.js',
					modules: {
						[sourceFile]: {
							code: 'var contexts = { probe: createStrictContext(null) };',
						},
					},
					type: 'chunk',
				},
			],
			frontDirectory,
		),
		[],
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
				[
					{
						name: 'RouteContext',
						sourceFile,
						mintSpans: [{ startLine: 0, startCol: 8, endLine: 0, endCol: 24 }],
					},
				],
				[
					chunkWithMap(
						'assets/route.js',
						{
							[sourceFile]: {
								code: 'const RouteContext = createContext(null);',
							},
							[`${sourceFile}?unexpected=context-copy`]: {
								code: 'const RouteContext = createContext(null);',
							},
						},
						[
							{
								source: sourceFile,
								origLine: 0,
								origCol: 17,
								genLine: 0,
								genCol: 4,
							},
						],
					),
				],
				frontDirectory,
			),
		/cannot prove an unrecognized source-derived query module/i,
	);
});

void test('fails closed when a TanStack route sibling no longer contains the context and no copy mints', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[{ name: 'RouteContext', sourceFile, mintSpans: [mintSpan] }],
				[
					chunkWithMap(
						'assets/route.js',
						{ [sourceFile]: { code: 'const route = {};' } },
						[
							{
								source: sourceFile,
								origLine: 5,
								origCol: 17,
								genLine: 0,
								genCol: 4,
							},
						],
					),
					chunkWithMap(
						'assets/route-component.js',
						{ [splitModule]: { code: 'const SplitComponent = () => null;' } },
						[
							{
								source: splitModule,
								origLine: 5,
								origCol: 17,
								genLine: 0,
								genCol: 4,
							},
						],
					),
				],
				frontDirectory,
			),
		/cannot classify how RouteContext .* is created/i,
	);

	assert.deepEqual(
		findContextChunkIsolationViolations(
			[{ name: 'RouteContext', sourceFile, mintSpans: [mintSpan] }],
			[
				chunkWithMap(
					'assets/route.js',
					{ [sourceFile]: { code: 'const route = {};' } },
					[
						{
							source: sourceFile,
							origLine: 5,
							origCol: 17,
							genLine: 0,
							genCol: 4,
						},
					],
				),
			],
			frontDirectory,
		),
		[],
	);
});

void test('decodes a real emitted chunk source map into standard positions', async () => {
	// The map below is the actual source map of a real `?tsr-split=component`
	// chunk emitted by Vite 8.1.5 / Rolldown 1.1.5 for the route text below
	// (a context minted through a cross-file factory). The expected decoded
	// positions were cross-checked against @jridgewell's reference decoders;
	// the test pins the guard's own VLQ decoder to the standard 0-based
	// line/column encoding real builds emit, and pins the source resolution
	// of the map's relative id against the chunk's own directory.
	const sourceFile = path.join(frontDirectory, 'src/routes/probe.tsx');
	const splitModule = `${sourceFile}?tsr-split=component`;
	const map = {
		version: 3,
		sources: ['../../../src/routes/probe.tsx?tsr-split=component'],
		mappings:
			'oDAMQG,EAAWF,CADQC,MAAOF,EAA0B,IAAI,CAC7CC,EAUXI,OACL,EAAA,EAAA,IAAA,CAAC,EAAS,MAAM,SAAhB,CAAyB,MAAO,cAAM,OAA8B,CAAA',
	};
	const sourceText = `
		import { createFileRoute } from '@tanstack/react-router';
		import { useContext } from 'react';
		import { consume, other } from '../not-context';
		import { createStrictContext } from '../make-context';
		const mintedContexts = { probe: createStrictContext<null>(null) };
		const contexts = mintedContexts;
		const forge = () => {
			const mintedContexts = { probe: other('sentinel') };
			consume(mintedContexts);
			return mintedContexts.probe;
		};
		export const useProbe = () => {
			forge();
			return useContext(contexts.probe);
		};
		const Probe = () => (
			<contexts.probe.Provider value={null}>probe</contexts.probe.Provider>
		);
		export const Route = createFileRoute('/probe')({ component: Probe });
	`;
	const mintSpan = mintSpanOfText(
		sourceText,
		'createStrictContext<null>(null)',
	);

	// The emitted split copy's mint maps back inside the recorded span of the
	// route file's mint call (the map's segments at columns 34/60/64 of the
	// mint line are all within the call's [34, 65) extent), so the copy is
	// attributed even though the map names the virtual split module, not the
	// route file itself.
	const violations = findContextChunkIsolationViolations(
		[
			{
				name: '<anonymous context>',
				sourceFile,
				mintSpans: [mintSpan],
			},
		],
		[
			chunkWithMap('assets/probe.js', { [splitModule]: { code: '' } }, [
				{
					source: splitModule,
					origLine: mintSpan.startLine,
					origCol: mintSpan.startCol + 5,
					genLine: 0,
					genCol: 4,
				},
			]),
			{
				fileName: 'assets/route.js',
				modules: { [splitModule]: { code: '' } },
				map,
				type: 'chunk',
			},
		],
		frontDirectory,
		path.join(frontDirectory, 'dist', 'client'),
	);
	assert.deepEqual(violations, [
		'<anonymous context> in src/routes/probe.tsx is present in multiple client chunks: assets/probe.js, assets/route.js.',
	]);
});

void test('scans emitted call argument lists without inventing or missing calls', () => {
	// Round 23 §88: the extent finder decided from one preceding character
	// whether a `(` starts a call. `if(cond)` and `function declared(parm)`
	// were accepted as calls, a regex after `return` was mis-tokenized, and a
	// direct optional call `maybe?.(value)` was missed. The scanner is a real
	// oracle now: statement/grouping parens and function parameter lists are
	// never calls, and optional calls are.
	const inside = (code: string) =>
		findEmittedCallExtents(code).map((extent) => ({
			startCol: extent.startCol,
			endCol: extent.endCol,
		}));

	// `if(cond)` is a statement paren, not a call; the inner `a()` is.
	assert.deepEqual(inside('if(cond){a()}'), [{ startCol: 10, endCol: 12 }]);
	// A function declaration's parameter list is not a call.
	assert.deepEqual(inside('function declared(parameter){return 1}'), []);
	// A regex after `return` is opaque, not a call; `.test(x)` is.
	assert.deepEqual(inside('return /ab(c)/.test(x)'), [
		{ startCol: 19, endCol: 22 },
	]);
	// A direct optional call IS a call.
	assert.deepEqual(inside('maybe?.(value)'), [{ startCol: 7, endCol: 14 }]);
	// A string and a comment never register calls.
	assert.deepEqual(inside('"a/b(c)"//x(y)\n'), []);
	// A call whose callee is a parenthesized expression (`(0,a.b)(x)`) is a
	// call on the outer parens, not the wrapper.
	assert.deepEqual(inside('(0,a.b)(x)'), [{ startCol: 7, endCol: 10 }]);
	// A class or object-literal method's parameter list is not a call: the
	// close paren is followed by the body brace. Real calls after the method
	// body are still calls.
	assert.deepEqual(inside('class A { method(value) { return value } }'), []);
	assert.deepEqual(inside('class A { get value() { return 1 } }'), []);
	assert.deepEqual(
		inside('class A { async load(value) { return value } }'),
		[],
	);
	assert.deepEqual(
		inside('const holder = { m(value) { return value } }; holder.m(1);'),
		[{ startCol: 54, endCol: 57 }],
	);
});

void test('fails closed when a segment lies in the mint callee text and the copy cannot be verified', () => {
	// Round 23 §127: the recorded mint span is the call's *argument-list*
	// extent. A segment whose original position lies inside the callee text —
	// e.g. a property reference to `createContext` mapping back to the callee
	// — is outside the argument list, so it cannot be the call's own emission
	// and is never accepted as a mint. A copy whose map ties only to the
	// callee text is unverifiable, so the build fails closed instead of
	// trusting a rendered-code spelling.
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	// `createContext(null)`: the callee `createContext` occupies [0, 13) and
	// the argument list `(null)` spans [13, 19). A segment whose original
	// position lies inside the callee text (here 0:2) is outside the recorded
	// argument-list extent, so it cannot be the call's own emission.
	const argListSpan = { startLine: 0, startCol: 13, endLine: 0, endCol: 19 };
	const calleeTextPosition = {
		startLine: 0,
		startCol: 2,
		endLine: 0,
		endCol: 13,
	};

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: '<anonymous context>',
						sourceFile,
						mintSpans: [argListSpan],
					},
				],
				[
					chunkWithMap(
						'assets/route.js',
						{
							[sourceFile]: {
								code: 'var contexts = { probe: createContext(null) };',
							},
						},
						[
							{
								source: sourceFile,
								origLine: 0,
								origCol: 15,
								genLine: 0,
								genCol: 4,
							},
						],
					),
					chunkWithMap(
						'assets/route-component.js',
						{
							[splitModule]: {
								code: 'var other = { probe: h(null) };',
							},
						},
						[
							{
								source: splitModule,
								origLine: calleeTextPosition.startLine,
								origCol: calleeTextPosition.startCol,
								genLine: 0,
								genCol: 4,
							},
						],
					),
				],
				frontDirectory,
			),
		/cannot classify how <anonymous context> .* is created/i,
	);
});

void test('fails with a named diagnostic instead of hanging on a malformed source map VLQ character', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: 'RouteContext',
						sourceFile,
						mintSpans: [{ startLine: 0, startCol: 8, endLine: 0, endCol: 24 }],
					},
				],
				[
					{
						fileName: 'assets/route.js',
						modules: { [sourceFile]: { code: '' } },
						map: { version: 3, sources: [sourceFile], mappings: '!' },
						type: 'chunk',
					},
				],
				frontDirectory,
			),
		/could not decode the source map for chunk assets\/route\.js: invalid VLQ character/i,
	);
});

void test('bounds the malformed VLQ decode in a child process instead of letting a hang stall the suite', async () => {
	// The in-process test above only proves today's diagnostic message; it
	// cannot itself distinguish a fast throw from a hang, because a hang
	// would stall this very test process forever rather than fail it. The
	// original defect (before the VLQ decode was bounded) had exactly that
	// shape: an out-of-range digit's continuation bit stays set forever, so
	// an invalid or exhausted character never terminates the field. Running
	// the decode in a child process under execFile's own `timeout` turns
	// that failure mode into a bounded, in-process red assertion instead of
	// a suite-wide hang that only an external `timeout` wrapper can end.
	const moduleFile = path.join(
		frontDirectory,
		'tools/vite/context-source-map.mts',
	);
	const probeScript = `
			import(${JSON.stringify(pathToFileURL(moduleFile).href)}).then((mod) => {
				try {
					mod.decodeSourceMapSegments(
						{ version: 3, sources: ['x'], mappings: '!' },
						'assets/route.js',
					);
					console.error('DID_NOT_THROW');
					process.exitCode = 1;
				} catch (error) {
					console.error(error.message);
					process.exitCode = /invalid VLQ character/i.test(error.message)
						? 0
						: 2;
				}
			});
		`;
	try {
		const { stderr } = await execFileAsync(
			process.execPath,
			['-e', probeScript],
			{ timeout: 5_000 },
		);
		assert.match(stderr, /invalid VLQ character/i);
	} catch (error) {
		const failure = error as {
			killed?: boolean;
			signal?: string | null;
			code?: number | string;
			stderr?: string;
		};
		if (failure.killed) {
			assert.fail(
				`the decode hung and was killed by the test's own timeout (signal ${failure.signal}) instead of throwing a named diagnostic`,
			);
		}
		assert.fail(
			`expected the child process to exit 0 with the invalid VLQ diagnostic; it exited ${failure.code} with stderr: ${failure.stderr}`,
		);
	}
});

void test('fails with a named diagnostic on a truncated source map VLQ field', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: 'RouteContext',
						sourceFile,
						mintSpans: [{ startLine: 0, startCol: 8, endLine: 0, endCol: 24 }],
					},
				],
				[
					{
						fileName: 'assets/route.js',
						modules: { [sourceFile]: { code: '' } },
						map: { version: 3, sources: [sourceFile], mappings: 'g' },
						type: 'chunk',
					},
				],
				frontDirectory,
			),
		/could not decode the source map for chunk assets\/route\.js: invalid VLQ character/i,
	);
});

void test('fails with a named diagnostic when a source map VLQ field exceeds the value range', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: 'RouteContext',
						sourceFile,
						mintSpans: [{ startLine: 0, startCol: 8, endLine: 0, endCol: 24 }],
					},
				],
				[
					{
						fileName: 'assets/route.js',
						modules: { [sourceFile]: { code: '' } },
						map: { version: 3, sources: [sourceFile], mappings: 'ggggggg' },
						type: 'chunk',
					},
				],
				frontDirectory,
			),
		/could not decode the source map for chunk assets\/route\.js: VLQ field exceeds the supported 31-bit value range/i,
	);
});

void test('fails with a named diagnostic on a source map segment with invalid field arity', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: 'RouteContext',
						sourceFile,
						mintSpans: [{ startLine: 0, startCol: 8, endLine: 0, endCol: 24 }],
					},
				],
				[
					{
						fileName: 'assets/route.js',
						modules: { [sourceFile]: { code: '' } },
						map: { version: 3, sources: [sourceFile], mappings: 'AA' },
						type: 'chunk',
					},
				],
				frontDirectory,
			),
		/could not decode the source map for chunk assets\/route\.js: segment carries 2 VLQ fields/i,
	);
});

void test('fails with a named diagnostic when a source map is not a version-3 map', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: 'RouteContext',
						sourceFile,
						mintSpans: [{ startLine: 0, startCol: 8, endLine: 0, endCol: 24 }],
					},
				],
				[
					{
						fileName: 'assets/route.js',
						modules: { [sourceFile]: { code: '' } },
						map: { version: 2, sources: [sourceFile], mappings: 'AAAA' },
						type: 'chunk',
					},
				],
				frontDirectory,
			),
		/could not use the source map the build emitted for chunk assets\/route\.js: expected a version-3 map/i,
	);
});

void test('fails with a named diagnostic when a source map segment references an unknown source', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: 'RouteContext',
						sourceFile,
						mintSpans: [{ startLine: 0, startCol: 8, endLine: 0, endCol: 24 }],
					},
				],
				[
					{
						fileName: 'assets/route.js',
						modules: { [sourceFile]: { code: '' } },
						map: { version: 3, sources: [sourceFile], mappings: 'ACAA' },
						type: 'chunk',
					},
				],
				frontDirectory,
			),
		/could not use the source map the build emitted for chunk assets\/route\.js: segment references source index 1 beyond the 1 listed sources/i,
	);
});

void test('does not count a generated-only segment as an original position', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	// The split copy's map carries one *genuine* mapped segment and one
	// one-field (generated-only) segment. Round 21 forged a second precise
	// position exactly this way: the generated-only segment inherited the
	// previous origin, satisfied the two-position bar, and made the minting
	// copy look non-minting. A one-field segment has no original source by
	// specification, so it must never contribute a position — the copy then
	// resolves to a single position and cannot be trusted as non-minting.
	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: '<anonymous context>',
						sourceFile,
						mintSpans: [mintSpan],
					},
				],
				[
					chunkWithMap(
						'assets/route.js',
						{
							[sourceFile]: {
								code: 'var contexts = { probe: createStrictContext(null) };',
							},
						},
						[
							{
								source: sourceFile,
								origLine: 0,
								origCol: 17,
								genLine: 0,
								genCol: 4,
							},
						],
					),
					{
						fileName: 'assets/route-component.js',
						modules: {
							[splitModule]: {
								code: 'var contexts = { probe: createStrictContext(null) };',
							},
						},
						type: 'chunk',
						map: encodeSourceMap({
							sources: [splitModule],
							segments: [
								// A one-field VLQ segment: generated-only, no
								// original source, must not inherit one.
								{ genLine: 0, genCol: 0 },
								{
									genLine: 0,
									genCol: 4,
									sourceIndex: 0,
									origLine: 5,
									origCol: 17,
								},
							],
						}),
					},
				],
				frontDirectory,
			),
		/cannot classify how <anonymous context> .* is created/i,
	);
});

void test('fails closed when a map places no position inside a call the copy emits', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };
	// The split copy genuinely emits the mint — its rendered code carries the
	// call — but its final map points at two positions (generated 0:0 and
	// 0:1) that lie outside every call the code emits. Round 21's exact
	// forgery: the map resolves the copy to two distinct original positions,
	// so the old cardinality bar called it attributable and non-minting. The
	// map does not describe this copy — it never touches the call the copy
	// actually emits — so the copy must be un-attributable and fail closed.
	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: '<anonymous context>',
						sourceFile,
						mintSpans: [mintSpan],
					},
				],
				[
					chunkWithCode(
						'assets/route.js',
						'var contexts={probe:createStrictContext(null)};',
						{
							[sourceFile]: {
								code: 'var contexts={probe:createStrictContext(null)};',
							},
						},
						[
							{
								source: sourceFile,
								origLine: 0,
								origCol: 17,
								genLine: 0,
								genCol: 42,
							},
						],
					),
					{
						fileName: 'assets/route-component.js',
						code: 'var contexts={probe:createStrictContext(null)};',
						modules: {
							[splitModule]: {
								code: 'var contexts={probe:createStrictContext(null)};',
							},
						},
						type: 'chunk',
						map: {
							version: 3,
							sources: [splitModule],
							mappings: 'AAAA,AACA',
						},
					},
				],
				frontDirectory,
			),
		/cannot classify how <anonymous context> .* is created/i,
	);
});

void test('fails closed when a non-minting copy covers the call it emits but ties to no recorded span', () => {
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };

	// The split copy emits an unrelated call (`otherHelper(null)` at
	// generated columns 28-34) and its map attributes that call's argument
	// extent to a position outside the mint span. The map ties its positions
	// to a call the copy actually emits — but that is also exactly what a
	// forged map looks like when it hides a real mint, so the copy is
	// unverifiable and the build fails closed instead of trusting a
	// rendered-code spelling.
	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: '<anonymous context>',
						sourceFile,
						mintSpans: [mintSpan],
					},
				],
				[
					chunkWithCode(
						'assets/route.js',
						'var contexts={probe:createStrictContext(null)};',
						{
							[sourceFile]: {
								code: 'var contexts={probe:createStrictContext(null)};',
							},
						},
						[
							{
								source: sourceFile,
								origLine: 0,
								origCol: 17,
								genLine: 0,
								genCol: 42,
							},
						],
					),
					chunkWithCode(
						'assets/route-component.js',
						'var other={probe:otherHelper(null)};',
						{
							[splitModule]: {
								code: 'var other={probe:otherHelper(null)};',
							},
						},
						[
							{
								source: splitModule,
								origLine: 0,
								origCol: 40,
								genLine: 0,
								genCol: 31,
							},
						],
					),
				],
				frontDirectory,
			),
		/cannot classify how <anonymous context> .* is created/i,
	);
});

void test('fails closed when a wrong map lands a forged generated position inside a call', () => {
	// Round 23's BLOCKER, driven through the production API: the genuinely
	// minting split copy's map forges two wrong original positions (outside
	// the mint span) but places its generated column inside an emitted call —
	// exactly the property the round-22 containment gate did not check. The
	// guard must not trust that map as a non-minting verdict: it cannot verify
	// the copy does not execute the mint, so a multi-copy build fails closed
	// instead of shipping the duplicated mint silently.
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };
	// Both copies emit the mint (`m` is its minified callee); the reference
	// copy's map is honest, the split copy's is forged with its generated
	// column 2 inside the `m(null)` argument list.
	const mkMap = ({
		source,
		segments,
	}: {
		source: string;
		segments: (Omit<ChunkSegmentInput, 'source'> | ChunkSegmentInput)[];
	}) =>
		encodeSourceMap({
			sources: [...new Set([source])],
			segments: [
				{ sourceIndex: 0, genLine: 0, genCol: 0, origLine: 0, origCol: 0 },
				...segments,
			].map((segment) => ({
				...segment,
				sourceIndex: 0,
			})),
		});

	assert.throws(
		() =>
			findContextChunkIsolationViolations(
				[
					{
						name: '<anonymous context>',
						sourceFile,
						mintSpans: [mintSpan],
					},
				],
				[
					{
						fileName: 'assets/route.js',
						code: 'm(null)',
						modules: { [sourceFile]: { code: 'm(null)' } },
						type: 'chunk',
						map: mkMap({
							source: sourceFile,
							segments: [
								{
									genLine: 0,
									genCol: 2,
									origLine: 0,
									origCol: 15,
								},
							],
						}),
					},
					{
						fileName: 'assets/route-component.js',
						code: 'm(null)',
						modules: { [splitModule]: { code: 'm(null)' } },
						type: 'chunk',
						map: mkMap({
							source: splitModule,
							segments: [
								{
									genLine: 0,
									genCol: 2,
									origLine: 99,
									origCol: 5,
								},
								{
									genLine: 0,
									genCol: 5,
									origLine: 99,
									origCol: 6,
								},
							],
						}),
					},
				],
				frontDirectory,
			),
		/cannot classify how <anonymous context> .* is created/i,
	);
});

void test('treats a mint-callee string in a copy as inert — the string is never minting evidence', () => {
	// Round 25's R25_STRING_CALLEE false positive: the old spelling
	// classifier read the *string* "createStrictContext(" in a copy's
	// rendered code as a mint and failed the build on it. The single
	// classifier never looks at the rendered text: the emitted-call scanner
	// skips strings, and the copy below is unverifiable for the same reason
	// the identical copy without the string is — its map ties its emitted
	// call to no recorded mint span. Both shapes throw the same fail-closed
	// error; the string changes nothing.
	const sourceFile = path.join(
		frontDirectory,
		'src/routes/field-validation.tsx',
	);
	const splitModule = `${sourceFile}?tsr-split=component`;
	const mintSpan = { startLine: 0, startCol: 8, endLine: 0, endCol: 24 };
	const stringCopyCode = 'var s="createStrictContext("; otherHelper(null);';
	const plainCopyCode = 'var otherHelper = null; otherHelper(null);';

	for (const splitCopyCode of [stringCopyCode, plainCopyCode]) {
		assert.throws(
			() =>
				findContextChunkIsolationViolations(
					[
						{
							name: '<anonymous context>',
							sourceFile,
							mintSpans: [mintSpan],
						},
					],
					[
						chunkWithCode(
							'assets/route.js',
							'var contexts={probe:m(null)};',
							{ [sourceFile]: { code: 'var contexts={probe:m(null)};' } },
							[
								{
									source: sourceFile,
									origLine: 0,
									origCol: 17,
									genLine: 0,
									genCol: 42,
								},
							],
						),
						chunkWithCode(
							'assets/route-component.js',
							splitCopyCode,
							{ [splitModule]: { code: splitCopyCode } },
							[
								{
									source: splitModule,
									origLine: 0,
									origCol: 40,
									genLine: 0,
									genCol: 29,
								},
							],
						),
					],
					frontDirectory,
				),
			/cannot classify how <anonymous context> .* is created/i,
			`split copy ${JSON.stringify(splitCopyCode)} must fail closed`,
		);
	}
});

void test('deletes only the forced map the guard owns, never an exact-name unrelated asset', () => {
	// Round 25's R25_FORCED_NAME_COLLISION: the round-24 cleanup deleted
	// every asset at `chunk.name + '.map'` because a mapped chunk shared the
	// name, so a plugin's unrelated `index.map` asset was swept away. The
	// guard now deletes an asset only when its bytes are the bundler's own
	// serialization of that chunk's map object — the identity the guard
	// recorded when it forced the map — so the same-key unrelated asset
	// survives. Both halves are driven through the production plugin hooks.
	// The map carries `sourcesContent`, a field real bundler maps include
	// and the guard's cleanup compares byte-for-byte, even though the
	// guard's own `RawSourceMapShape` only names the fields it reads.
	const mappedChunk: ClientChunk & {
		map: RawSourceMapShape & { sourcesContent: string[] };
	} = {
		type: 'chunk',
		fileName: 'assets/index.js',
		name: 'index',
		code: 'm(null)',
		modules: {},
		map: {
			version: 3,
			sources: [],
			sourcesContent: [''],
			mappings: '',
		},
	};
	const run = (assetSource: string): BundleOutputEntry | undefined => {
		const plugin = contextChunkIsolationPlugin({
			contextInventory: [],
			tsconfigPath: path.join(frontDirectory, 'tsconfig.json'),
			workspaceDirectory: frontDirectory,
		});
		plugin.config.call({}, { environments: { client: { build: {} } } });
		const bundle: Record<string, BundleOutputEntry> = {
			'assets/index.js': mappedChunk,
			'index.map': {
				type: 'asset',
				fileName: 'index.map',
				name: 'index.map',
				source: assetSource,
			},
		};
		plugin.generateBundle.call({ error() {} }, {}, bundle);
		return bundle['index.map'];
	};

	// An asset whose content is the bundler's serialization of the chunk's
	// own map object is the map the guard forced, and is removed.
	assert.equal(run(JSON.stringify(mappedChunk.map)), undefined);
	// An asset whose bytes are only a strict subset of that serialization —
	// the minimal `{"version":3}` stub, or the realistic "ship maps without
	// embedded sources" artifact (the chunk's own map with `sourcesContent`
	// stripped) — is not the map the guard wrote and survives byte-for-byte
	// (round 27's data-loss reproduction at the hook boundary).
	const stub = run('{"version":3}');
	const stubSource = stub?.type === 'asset' ? stub.source : undefined;
	assert.equal(stubSource, '{"version":3}', 'the version stub must survive');
	const trimmedSource = JSON.stringify({
		...mappedChunk.map,
		sourcesContent: undefined,
	});
	const trimmed = run(trimmedSource);
	const trimmedEntrySource =
		trimmed?.type === 'asset' ? trimmed.source : undefined;
	assert.equal(
		trimmedEntrySource,
		trimmedSource,
		'the sourcesContent-stripped map must survive',
	);
	// The unrelated asset that merely occupies the pinned key survives
	// byte-for-byte.
	run('{"version":3,"sources":[],"mappings":"AAAA"}');
});

void test('type-checks the guard\u2019s source-declared public API against a real consumer probe', async () => {
	// Types live in the .mts sources themselves since the scripts/ -> tools/
	// move retired the hand-written .d.mts files; the probe below uses the
	// current API (mintSpans, chunk maps, the output directory parameter)
	// and pins the removed position-key mechanism's absence, then the real
	// TypeScript compiler must accept it.
	const probeDirectory = await mkdtemp(
		path.join(frontDirectory, '.r20-type-probe-'),
	);
	const scriptPath = path.join(
		frontDirectory,
		'tools/vite/check-context-chunk-isolation.mts',
	);
	try {
		await writeFile(
			path.join(probeDirectory, 'type-probe.mts'),
			`
			import {
				contextChunkIsolationPlugin,
				findContextChunkIsolationViolations,
				findContextInventoryViolations,
				findReactContextDeclarations,
				type ClientChunk,
				type ContextDeclaration,
				type SourceSpan,
			} from ${JSON.stringify(scriptPath)};

			const span: SourceSpan = {
				startLine: 0,
				startCol: 8,
				endLine: 0,
				endCol: 24,
			};

			const context: ContextDeclaration = {
				name: 'ProbeContext',
				sourceFile: 'src/probe.tsx',
				mintSpans: [span],
			};

			const chunk: ClientChunk = {
				type: 'chunk',
				fileName: 'assets/route.js',
				modules: { 'src/probe.tsx': { code: 'x' } },
				map: {
					version: 3,
					sources: ['src/probe.tsx'],
					mappings: 'AAAA',
				},
			};

			// Rolldown declares OutputChunk.map as SourceMap | null, and the
			// runtime treats a null map like an absent one (fail-closed past a
			// single copy); the declaration must accept it too.
			const nullMapChunk: ClientChunk = {
				type: 'chunk',
				fileName: 'assets/route-null-map.js',
				modules: { 'src/other.tsx': { code: 'x' } },
				map: null,
			};

			const violations: string[] = findContextChunkIsolationViolations(
				[context],
				[chunk, nullMapChunk],
				${JSON.stringify(frontDirectory)},
				${JSON.stringify(path.join(frontDirectory, 'dist', 'client'))},
			);

			const declarations: ContextDeclaration[] =
				findReactContextDeclarations(
					${JSON.stringify(path.join(frontDirectory, 'tsconfig.json'))},
				);

			const inventoryViolations: string[] =
				findContextInventoryViolations(
					declarations,
					[context],
					${JSON.stringify(frontDirectory)},
				);

			const plugin = contextChunkIsolationPlugin({
				contextInventory: [context],
				tsconfigPath: ${JSON.stringify(
					path.join(frontDirectory, 'tsconfig.json'),
				)},
				workspaceDirectory: ${JSON.stringify(frontDirectory)},
			});

			// The discarded position-key mechanism must not be describable by
			// this declaration file anymore.
			const stale = {
				// @ts-expect-error mintingPositions was removed with the position-key mechanism
				mintingPositions: ['contexts.probe'],
			} satisfies ContextDeclaration;

			export {
				chunk,
				declarations,
				inventoryViolations,
				nullMapChunk,
				plugin,
				stale,
				violations,
			};
			`,
		);
		await execFileAsync(
			process.execPath,
			[
				path.join(frontDirectory, 'node_modules/typescript/bin/tsc'),
				'--ignoreConfig',
				'--noEmit',
				'--skipLibCheck',
				'--allowImportingTsExtensions',
				'--types',
				'node',
				'--target',
				'ES2022',
				'--module',
				'NodeNext',
				'--moduleResolution',
				'NodeNext',
				path.join(probeDirectory, 'type-probe.mts'),
			],
			{ cwd: frontDirectory },
		);
	} finally {
		await rm(probeDirectory, { force: true, recursive: true });
	}
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

		let errorMessage: string | undefined;
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

		assert.match(
			errorMessage ?? '',
			/FirstContext.*not present in a client chunk/i,
		);
		assert.match(
			errorMessage ?? '',
			/untyped-context\.jsx.*TypeScript program/i,
		);
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

		let errorMessage: string | undefined;
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

		assert.match(
			errorMessage ?? '',
			/packages\/outside\.ts.*TypeScript program/i,
		);
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
			for (const chunk of JSON.parse(result.trace) as TraceChunk[]) {
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
				/ProbeContext in src\/routes\/probe\.tsx is present in multiple client chunks/i,
			);
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
					import type { Context } from 'react';
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
			assert.match(
				result.output,
				/ProbeContext in src\/routes\/probe\.tsx is present in multiple client chunks/i,
			);
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
					import type { Context } from 'react';
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
			for (const chunk of JSON.parse(result.trace) as TraceChunk[]) {
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
	'fails a real TanStack route build when a context is destructured out of a cross-file factory call',
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
					export const makeContexts = <T,>(fallback: T) => ({ probe: createContext(fallback) });
				`,
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { useContext } from 'react';
					import { makeContexts } from '../make-context';
					const { probe: ProbeContext } = makeContexts<null>(null);
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
			for (const chunk of JSON.parse(result.trace) as TraceChunk[]) {
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
	'fails a real TanStack route build closed when split groups consume one shared context',
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
			// The reference shim copy never executes the mint and its map ties
			// to no recorded span — indistinguishable from a forged map hiding
			// a mint — so the single emitted-call classifier fails closed.
			assert.notEqual(result.status, 0, result.output);
			assert.match(
				result.output,
				/ProbeContext in src\/routes\/probe\.tsx is created: the build emits no source map for a client chunk delivering its source, or a delivered copy's map does not resolve precise original positions for it/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build closed when its reference module consumes a shared context',
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
			// The reference copy keeps the shared-context consumption while
			// the mint survives only in the split copy; the reference copy's
			// map ties to no recorded span, so the single emitted-call
			// classifier fails closed instead of trusting a spelling.
			assert.notEqual(result.status, 0, result.output);
			assert.match(
				result.output,
				/ProbeContext in src\/routes\/probe\.tsx is created: the build emits no source map for a client chunk delivering its source, or a delivered copy's map does not resolve precise original positions for it/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build closed when its context is used only by the split component',
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
			// The split copy mints; the reference copy is the route shim and
			// its map ties to no recorded span — indistinguishable from a
			// forged map hiding a mint, so the guard fails closed.
			assert.notEqual(result.status, 0, result.output);
			assert.match(
				result.output,
				/ProbeContext in src\/routes\/probe\.tsx is created: the build emits no source map for a client chunk delivering its source, or a delivered copy's map does not resolve precise original positions for it/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

const holderFactoryFixture = (probeBody: string) => ({
	'src/make-context.ts': `
		import { createContext } from 'react';
		import type { Context } from 'react';
		export interface StrictContext<T> extends Context<T> { readonly strict: true; }
		export const createStrictContext = <T,>(fallback: T): StrictContext<T> =>
			Object.assign(createContext(fallback), { strict: true as const });
		export default createStrictContext;
	`,
	'src/routes/probe.tsx': `
		import { createFileRoute } from '@tanstack/react-router';
		import { useContext } from 'react';
		${probeBody}
	`,
});

// F824 (ui F6): the inventory compared DISCOVERED and EXPECTED contexts as
// sets keyed by `${name} in ${file}` — a module hosting two distinct
// `createContext` sites under one identity (e.g. two anonymous holder mints,
// both discovered as `<anonymous context>` in the same file) collapsed to a
// single discovered entry, and a single inventory entry silently certified
// both sites (and silently kept certifying one after the other was deleted).
// The comparison is a multiset now: every minting site must be covered by its
// own inventory entry, and any surplus or deficit on either side fails loud.
void test('F824-ui-F6: demands one inventory entry per createContext site when one file hosts several under one identity', () => {
	const sourceFile = path.resolve(frontDirectory, 'src/two-mints.tsx');
	const contexts = [
		{
			name: '<anonymous context>',
			sourceFile,
			mintSpans: [{ startLine: 2, startCol: 8, endLine: 2, endCol: 24 }],
		},
		{
			name: '<anonymous context>',
			sourceFile,
			mintSpans: [{ startLine: 5, startCol: 8, endLine: 5, endCol: 24 }],
		},
	];

	const violations = findContextInventoryViolations(
		contexts,
		[{ name: '<anonymous context>', sourceFile: 'src/two-mints.tsx' }],
		frontDirectory,
	);

	assert.equal(violations.length, 1);
	assert.match(violations[0], /missing from the checked-in inventory/);
});

void test('F824-ui-F6: flags an inventory entry whose site disappeared while another entry remains uncovered', () => {
	const sourceFile = path.resolve(frontDirectory, 'src/two-mints.tsx');
	const contexts = [
		{
			name: '<anonymous context>',
			sourceFile,
			mintSpans: [{ startLine: 2, startCol: 8, endLine: 2, endCol: 24 }],
		},
	];

	const violations = findContextInventoryViolations(
		contexts,
		[
			{ name: '<anonymous context>', sourceFile: 'src/two-mints.tsx' },
			{ name: '<anonymous context>', sourceFile: 'src/two-mints.tsx' },
		],
		frontDirectory,
	);

	assert.equal(violations.length, 1);
	assert.match(violations[0], /missing from the TypeScript program/);
});

const holderInventory = [
	{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
	{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
	{ name: 'SecondContext', sourceFile: 'src/contexts.tsx' },
	{ name: 'ThirdContext', sourceFile: 'src/contexts.tsx' },
	{ name: 'FourthContext', sourceFile: 'src/contexts.tsx' },
];

void test(
	'fails a real TanStack route build when a holder mint is imported under a renamed name',
	{ timeout: 120_000 },
	async () => {
		const result = await buildRouteFixture({
			files: holderFactoryFixture(`
				import { createStrictContext as mk } from '../make-context';
				const contexts = { probe: mk<null>(null) };
				export const useProbe = () => useContext(contexts.probe);
				const Probe = () => <contexts.probe.Provider value={null}>probe</contexts.probe.Provider>;
				export const Route = createFileRoute('/probe')({ component: Probe });
			`),
			inventory: holderInventory,
			rootImportsProbe: true,
		});

		try {
			assert.notEqual(result.status, 0, result.output);
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
	'fails a real TanStack route build when a holder mint is imported as a default import',
	{ timeout: 120_000 },
	async () => {
		const result = await buildRouteFixture({
			files: holderFactoryFixture(`
				import mkDefault from '../make-context';
				const contexts = { probe: mkDefault<null>(null) };
				export const useProbe = () => useContext(contexts.probe);
				const Probe = () => <contexts.probe.Provider value={null}>probe</contexts.probe.Provider>;
				export const Route = createFileRoute('/probe')({ component: Probe });
			`),
			inventory: holderInventory,
			rootImportsProbe: true,
		});

		try {
			assert.notEqual(result.status, 0, result.output);
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
	'fails a real TanStack route build when a holder mint is wrapped in an IIFE',
	{ timeout: 120_000 },
	async () => {
		const result = await buildRouteFixture({
			files: holderFactoryFixture(`
				import { createStrictContext } from '../make-context';
				const contexts = { probe: (() => createStrictContext(null))() };
				export const useProbe = () => useContext(contexts.probe);
				const Probe = () => <contexts.probe.Provider value={null}>probe</contexts.probe.Provider>;
				export const Route = createFileRoute('/probe')({ component: Probe });
			`),
			inventory: holderInventory,
			rootImportsProbe: true,
		});

		try {
			assert.notEqual(result.status, 0, result.output);
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
	'fails a real TanStack route build when a holder mint is wrapped in a comma chain',
	{ timeout: 120_000 },
	async () => {
		const result = await buildRouteFixture({
			files: holderFactoryFixture(`
				import { createStrictContext } from '../make-context';
				const contexts = { probe: (0, createStrictContext(null)) };
				export const useProbe = () => useContext(contexts.probe);
				const Probe = () => <contexts.probe.Provider value={null}>probe</contexts.probe.Provider>;
				export const Route = createFileRoute('/probe')({ component: Probe });
			`),
			inventory: holderInventory,
			rootImportsProbe: true,
		});

		try {
			assert.notEqual(result.status, 0, result.output);
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
	'fails a real TanStack route build closed when a renamed-imported holder mint survives only in the split copy',
	{ timeout: 120_000 },
	async () => {
		const result = await buildRouteFixture({
			files: holderFactoryFixture(`
				import { createStrictContext as mk } from '../make-context';
				const contexts = { probe: mk<null>(null) };
				const Probe = () => <contexts.probe.Provider value={null}>{String(useContext(contexts.probe))}</contexts.probe.Provider>;
				export const Route = createFileRoute('/probe')({ component: Probe });
			`),
			inventory: holderInventory,
		});

		try {
			// The split copy mints; the reference shim copy's map ties to no
			// recorded span — indistinguishable from a forged map hiding a
			// mint, so the single emitted-call classifier fails closed.
			assert.notEqual(result.status, 0, result.output);
			assert.match(
				result.output,
				/<anonymous context> in src\/routes\/probe\.tsx is created: the build emits no source map for a client chunk delivering its source, or a delivered copy's map does not resolve precise original positions for it/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build closed when a default-imported holder mint survives only in the split copy',
	{ timeout: 120_000 },
	async () => {
		const result = await buildRouteFixture({
			files: holderFactoryFixture(`
				import mkDefault from '../make-context';
				const contexts = { probe: mkDefault<null>(null) };
				const Probe = () => <contexts.probe.Provider value={null}>{String(useContext(contexts.probe))}</contexts.probe.Provider>;
				export const Route = createFileRoute('/probe')({ component: Probe });
			`),
			inventory: holderInventory,
		});
		try {
			assert.notEqual(result.status, 0, result.output);
			assert.match(
				result.output,
				/<anonymous context> in src\/routes\/probe\.tsx is created: the build emits no source map for a client chunk delivering its source, or a delivered copy's map does not resolve precise original positions for it/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build closed when a named-default-factory holder mint survives only in the split copy',
	{ timeout: 120_000 },
	async () => {
		const result = await buildRouteFixture({
			files: {
				'src/make-context.ts': `
					import { createContext } from 'react';
					import type { Context } from 'react';
					export interface StrictContext<T> extends Context<T> { readonly strict: true; }
					export default function createStrictContext<T>(fallback: T): StrictContext<T> {
						return Object.assign(createContext(fallback), { strict: true as const });
					}
				`,
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { useContext } from 'react';
					import mkDefault from '../make-context';
					const contexts = { probe: mkDefault<null>(null) };
					const Probe = () => <contexts.probe.Provider value={null}>{String(useContext(contexts.probe))}</contexts.probe.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe });
				`,
			},
			inventory: holderInventory,
		});

		try {
			assert.notEqual(result.status, 0, result.output);
			assert.match(
				result.output,
				/<anonymous context> in src\/routes\/probe\.tsx is created: the build emits no source map for a client chunk delivering its source, or a delivered copy's map does not resolve precise original positions for it/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build closed when an IIFE-wrapped holder mint survives only in the split copy',
	{ timeout: 120_000 },
	async () => {
		const result = await buildRouteFixture({
			files: holderFactoryFixture(`
				import { createStrictContext } from '../make-context';
				const contexts = { probe: (() => createStrictContext(null))() };
				const Probe = () => <contexts.probe.Provider value={null}>{String(useContext(contexts.probe))}</contexts.probe.Provider>;
				export const Route = createFileRoute('/probe')({ component: Probe });
			`),
			inventory: holderInventory,
		});

		try {
			assert.notEqual(result.status, 0, result.output);
			assert.match(
				result.output,
				/<anonymous context> in src\/routes\/probe\.tsx is created: the build emits no source map for a client chunk delivering its source, or a delivered copy's map does not resolve precise original positions for it/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build closed when a comma-chain holder mint survives only in the split copy',
	{ timeout: 120_000 },
	async () => {
		const result = await buildRouteFixture({
			files: holderFactoryFixture(`
				import { createStrictContext } from '../make-context';
				const contexts = { probe: (0, createStrictContext(null)) };
				const Probe = () => <contexts.probe.Provider value={null}>{String(useContext(contexts.probe))}</contexts.probe.Provider>;
				export const Route = createFileRoute('/probe')({ component: Probe });
			`),
			inventory: holderInventory,
		});

		try {
			assert.notEqual(result.status, 0, result.output);
			assert.match(
				result.output,
				/<anonymous context> in src\/routes\/probe\.tsx is created: the build emits no source map for a client chunk delivering its source, or a delivered copy's map does not resolve precise original positions for it/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'passes a real TanStack route build when a comma chain discards the factory result',
	{ timeout: 120_000 },
	async () => {
		const result = await buildRouteFixture({
			files: holderFactoryFixture(`
				import { createStrictContext } from '../make-context';
				const holder = { probe: (createStrictContext(null), 0) };
				const Probe = () => <div>{String(holder.probe)}</div>;
				export const Route = createFileRoute('/probe')({ component: Probe });
			`),
			inventory: [
				{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
				{ name: 'SecondContext', sourceFile: 'src/contexts.tsx' },
				{ name: 'ThirdContext', sourceFile: 'src/contexts.tsx' },
				{ name: 'FourthContext', sourceFile: 'src/contexts.tsx' },
			],
		});

		try {
			assert.equal(result.status, 0, result.output);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build when a context is destructured through a nested pattern',
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
					export const makeNested = <T,>(fallback: T) => ({ inner: { probe: createContext(fallback) } });
				`,
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { useContext } from 'react';
					import { makeNested } from '../make-context';
					const { inner: { probe: ProbeContext } } = makeNested<null>(null);
					export const useProbe = () => useContext(ProbeContext);
					const Probe = () => <ProbeContext.Provider value={null}>probe</ProbeContext.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe });
				`,
			},
			inventory,
			rootImportsProbe: true,
		});

		try {
			assert.notEqual(result.status, 0, result.output);
			assert.match(
				result.output,
				/ProbeContext in src\/routes\/probe\.tsx is present in multiple client chunks/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build closed when a split route owns an anonymous context used only by the split component',
	{ timeout: 120_000 },
	async () => {
		const inventory = [
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
			{ name: 'SecondContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'ThirdContext', sourceFile: 'src/contexts.tsx' },
			{ name: 'FourthContext', sourceFile: 'src/contexts.tsx' },
		];
		const result = await buildRouteFixture({
			files: {
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { createContext, useContext } from 'react';
					const contexts = { probe: createContext<null>(null) };
					const Probe = () => <contexts.probe.Provider value={null}>{String(useContext(contexts.probe))}</contexts.probe.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe });
				`,
			},
			inventory,
		});

		try {
			// The split copy mints; the reference shim copy's map ties to no
			// recorded span — indistinguishable from a forged map hiding a
			// mint — so the single emitted-call classifier fails closed.
			assert.notEqual(result.status, 0, result.output);
			assert.match(
				result.output,
				/<anonymous context> in src\/routes\/probe\.tsx is created: the build emits no source map for a client chunk delivering its source, or a delivered copy's map does not resolve precise original positions for it/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build when anonymous default-factory holder copies share one chunk',
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
					import type { Context } from 'react';
					export default function <T,>(fallback: T): Context<T> {
						return createContext(fallback);
					}
				`,
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { useContext } from 'react';
					import mkDefault from '../make-context';
					const contexts = { probe: mkDefault<null>(null) };
					export const useProbe = () => useContext(contexts.probe);
					const Probe = () => <contexts.probe.Provider value={null}>probe</contexts.probe.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe });
				`,
			},
			groupProbeModules: true,
			inventory,
			rootImportsProbe: true,
		});

		try {
			const mintingCopies = [];
			for (const chunk of JSON.parse(result.trace) as TraceChunk[]) {
				for (const [moduleId, code] of Object.entries(chunk.modules)) {
					if (
						moduleId.includes('/src/routes/probe.tsx') &&
						/make_context_default\s*\(/.test(code)
					) {
						mintingCopies.push(`${chunk.fileName} :: ${moduleId}`);
					}
				}
			}
			assert.equal(
				mintingCopies.length,
				2,
				`MINTING ${JSON.stringify(mintingCopies, null, 2)}`,
			);
			assert.equal(
				new Set(mintingCopies.map((location) => location.split(' :: ')[0]))
					.size,
				1,
			);
			assert.notEqual(result.status, 0, result.trace);
			assert.match(
				result.output,
				/<anonymous context> in src\/routes\/probe\.tsx is created by multiple client modules in chunk: assets\/probe-pair/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build when a same-named non-context helper must not mask two anonymous context mints',
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
					import type { Context } from 'react';
					export default function <T,>(fallback: T): Context<T> {
						return createContext(fallback);
					}
				`,
				'src/not-context.ts': `
					export function mkDefault<T>(value: T): T { return value; }
				`,
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { useContext } from 'react';
					import mkDefault from '../make-context';
					import { mkDefault as other } from '../not-context';
					const contexts = { probe: mkDefault<null>(null) };
					export const unrelatedHolder = { value: other('sentinel') };
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
			for (const chunk of JSON.parse(result.trace) as TraceChunk[]) {
				for (const [moduleId, code] of Object.entries(chunk.modules)) {
					if (
						moduleId.includes('/src/routes/probe.tsx') &&
						/make_context_default\s*\(/.test(code)
					) {
						mintingCopies.push(`${chunk.fileName} :: ${moduleId}`);
					}
				}
			}
			assert.equal(
				mintingCopies.length,
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
	'fails a real TanStack route build when a same-named export is deconflicted by the bundler',
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
					import type { Context } from 'react';
					export function mk<T,>(fallback: T): Context<T> {
						return createContext(fallback);
					}
				`,
				'src/not-context.ts': `
					export function mk<T>(value: T): T { return value; }
				`,
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { useContext } from 'react';
					import { mk } from '../make-context';
					import { mk as other } from '../not-context';
					const contexts = { probe: mk<null>(null) };
					export const unrelatedHolder = { value: other('sentinel') };
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
			for (const chunk of JSON.parse(result.trace) as TraceChunk[]) {
				for (const [moduleId, code] of Object.entries(chunk.modules)) {
					if (
						moduleId.includes('/src/routes/probe.tsx') &&
						/contexts[^;]*\{ probe: mk/.test(code)
					) {
						mintingCopies.push(`${chunk.fileName} :: ${moduleId}`);
					}
				}
			}
			assert.equal(
				mintingCopies.length,
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
	'fails a real TanStack route build when the bundler rewrites the recorded holder binding and an unrelated call keeps the old name',
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
					export const createStrictContext = <T,>(fallback: T) => createContext(fallback);
				`,
				'src/not-context.ts': `
					export const other = <T,>(value: T) => ({ sentinel: value });
					export const consume = (value: unknown) => { (globalThis).__consume = value; };
				`,
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { useContext } from 'react';
					import { consume, other } from '../not-context';
					import { createStrictContext } from '../make-context';
					const mintedContexts = { probe: createStrictContext<null>(null) };
					const contexts = mintedContexts;
					const forge = () => {
						const mintedContexts = { probe: other('sentinel') };
						consume(mintedContexts);
						return mintedContexts.probe;
					};
					export const useProbe = () => {
						forge();
						return useContext(contexts.probe);
					};
					const Probe = () => (
						<contexts.probe.Provider value={null}>probe</contexts.probe.Provider>
					);
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
				/<anonymous context> in src\/routes\/probe\.tsx is present in multiple client chunks/i,
			);
			assert.doesNotMatch(
				result.output,
				/no rendered copy is attributed a mint/i,
			);
			assert.doesNotMatch(result.output, /cannot classify/i);
			// The guard attributed through the bundler's own maps: both the
			// reference and the split chunks must carry one.
			const referenceChunk = (JSON.parse(result.trace) as TraceChunk[]).find(
				(chunk) =>
					Object.keys(chunk.modules).some(
						(id) => id.includes('probe.tsx') && !id.includes('?'),
					),
			);
			const referenceMap = await readChunkMap(
				result.fixtureDirectory,
				referenceChunk?.fileName ?? '',
			);
			assert.ok(
				referenceMap?.sources.some((source: string) =>
					source.includes('src/routes/probe.tsx'),
				),
				'reference chunk map must attribute the route source',
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build when a conditional holder mints in every copy',
	{ timeout: 120_000 },
	async () => {
		const inventory = [
			{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
			// F824 ui F6: one inventory entry per minting site — the probe hosts TWO.
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
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
					const contexts = { probe: Math.random() > -1 ? createStrictContext<null>(null) : createStrictContext<null>(null) };
					export const useProbe = () => useContext(contexts.probe);
					const Probe = () => <contexts.probe.Provider value={null}>probe</contexts.probe.Provider>;
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
				/<anonymous context> in src\/routes\/probe\.tsx is present in multiple client chunks/i,
			);
			assert.doesNotMatch(result.output, /cannot classify/i);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build when a context record is spread into a holder in every copy',
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
					export const makeContexts = <T,>(fallback: T) => ({ probe: createContext(fallback) });
				`,
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { useContext } from 'react';
					import { makeContexts } from '../make-context';
					const contexts = { ...makeContexts<null>(null) };
					export const useProbe = () => useContext(contexts.probe);
					const Probe = () => <contexts.probe.Provider value={null}>probe</contexts.probe.Provider>;
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
				/<anonymous context> in src\/routes\/probe\.tsx is present in multiple client chunks/i,
			);
			assert.doesNotMatch(result.output, /cannot classify/i);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build closed when a split-module transform emits a coarse map',
	{ timeout: 120_000 },
	async () => {
		const result = await buildRouteFixture({
			files: holderFactoryFixture(`
				import { createStrictContext } from '../make-context';
				const contexts = { probe: createStrictContext<null>(null) };
				export const useProbe = () => useContext(contexts.probe);
				const Probe = () => <contexts.probe.Provider value={null}>probe</contexts.probe.Provider>;
				export const Route = createFileRoute('/probe')({ component: Probe });
			`),
			inventory: holderInventory,
			rootImportsProbe: true,
			coarsenSplitMap: true,
		});

		try {
			// The real split copy genuinely mints — prove the duplicated mint
			// shipped before asserting the guard's verdict.
			const mintingCopies = [];
			for (const chunk of JSON.parse(result.trace) as TraceChunk[]) {
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
			// The post-transform coarse map (every generated line at original
			// 0:0 for the split copy) must not produce a silent green: the
			// split copy cannot answer, so the verdict fails closed.
			assert.notEqual(result.status, 0, result.trace);
			assert.match(
				result.output,
				/cannot classify how <anonymous context> .* is created/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build closed when the final split map forges two wrong positions',
	{ timeout: 120_000 },
	async () => {
		const result = await buildRouteFixture({
			files: holderFactoryFixture(`
				import { createStrictContext } from '../make-context';
				const contexts = { probe: createStrictContext<null>(null) };
				export const useProbe = () => useContext(contexts.probe);
				const Probe = () => <contexts.probe.Provider value={null}>probe</contexts.probe.Provider>;
				export const Route = createFileRoute('/probe')({ component: Probe });
			`),
			inventory: holderInventory,
			rootImportsProbe: true,
			forgeSplitMap: true,
		});

		try {
			// The real split copy genuinely mints — prove the duplicated mint
			// shipped before asserting the guard's verdict. The final split
			// map was forged to two valid mapped positions (0:0 and 0:1) for
			// the split module, exactly round 21's probe: two distinct
			// positions satisfied the old cardinality bar, so the minting
			// copy looked non-minting and the build shipped green with two
			// copies of the mint. The map never touches a call the copy
			// emits, so the copy must fail closed instead.
			const mintingCopies = [];
			for (const chunk of JSON.parse(result.trace) as TraceChunk[]) {
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
				/cannot classify how <anonymous context> .* is created/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build closed when a wrong map places a forged position inside an emitted call',
	{ timeout: 120_000 },
	async () => {
		// Round 23's escape: land the forged map's generated coordinate inside
		// an emitted call — the one property the round-22 containment gate did
		// not check. The split copy genuinely mints (its rendered code carries
		// createStrictContext( and the trace proves two chunks emit it), but
		// its final map forges two wrong original positions that happen to
		// point into a real emitted call. The guard must not trust that map as
		// a non-minting verdict: it cannot verify the copy does not execute the
		// mint, so it fails closed.
		const result = await buildRouteFixture({
			files: holderFactoryFixture(`
				import { createStrictContext } from '../make-context';
				const contexts = { probe: createStrictContext<null>(null) };
				export const useProbe = () => useContext(contexts.probe);
				const Probe = () => <contexts.probe.Provider value={null}>probe</contexts.probe.Provider>;
				export const Route = createFileRoute('/probe')({ component: Probe });
			`),
			inventory: holderInventory,
			rootImportsProbe: true,
			forgeSplitMapInCall: true,
		});

		try {
			const mintingCopies = [];
			for (const chunk of JSON.parse(result.trace) as TraceChunk[]) {
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
				/cannot classify how <anonymous context> .* is created/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'passes a real TanStack route build when two anonymous contexts are minted in disjoint copies',
	{ timeout: 120_000 },
	async () => {
		const inventory = [
			{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
			// F824 ui F6: one inventory entry per minting site — the probe hosts TWO.
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
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
				'src/routes/__root.tsx': `
					import { Outlet, createRootRoute } from '@tanstack/react-router';
					import { FourthContext, SecondContext, ThirdContext } from '../contexts';
					const Root = () => <SecondContext.Provider value={null}><ThirdContext.Provider value={null}><FourthContext.Provider value={null}><Outlet /></FourthContext.Provider></ThirdContext.Provider></SecondContext.Provider>;
					export const Route = createRootRoute({ component: Root });
				`,
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { useContext } from 'react';
					import { createStrictContext } from '../make-context';
					const loaderContexts = { probe: createStrictContext<null>(null) };
					const loader = () => ({ context: String(loaderContexts.probe) });
					const componentContexts = { probe: createStrictContext<null>(null) };
					const Probe = () => <componentContexts.probe.Provider value={null}>{String(useContext(componentContexts.probe))}</componentContexts.probe.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe, loader });
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
	'fails a real TanStack route build when one of two disjoint anonymous contexts is minted in both copies',
	{ timeout: 120_000 },
	async () => {
		const inventory = [
			{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
			// F824 ui F6: one inventory entry per minting site — the probe hosts TWO.
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
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
				'src/routes/__root.tsx': `
					import { Outlet, createRootRoute } from '@tanstack/react-router';
					import { FourthContext, SecondContext, ThirdContext } from '../contexts';
					const Root = () => <SecondContext.Provider value={null}><ThirdContext.Provider value={null}><FourthContext.Provider value={null}><Outlet /></FourthContext.Provider></ThirdContext.Provider></SecondContext.Provider>;
					export const Route = createRootRoute({ component: Root });
				`,
				'src/routes/probe.tsx': `
					import { createFileRoute } from '@tanstack/react-router';
					import { useContext } from 'react';
					import { createStrictContext } from '../make-context';
					const loaderContexts = { probe: createStrictContext<null>(null) };
					const loader = () => ({ context: String(loaderContexts.probe) });
					const componentContexts = { probe: createStrictContext<null>(null) };
					const Probe = () => <componentContexts.probe.Provider value={null}>{String(useContext(componentContexts.probe))}</componentContexts.probe.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe, loader: () => ({ context: String(componentContexts.probe) }) });
				`,
			},
			inventory,
		});

		try {
			assert.notEqual(result.status, 0, result.output);
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
	'emits no client source map files after the guard consumes them while an unrelated map asset survives',
	{ timeout: 120_000 },
	async () => {
		const inventory = [
			{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
			// F824 ui F6: one inventory entry per minting site — the probe hosts TWO.
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
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
					const loaderContexts = { probe: createStrictContext<null>(null) };
					const loader = () => ({ context: String(loaderContexts.probe) });
					const componentContexts = { probe: createStrictContext<null>(null) };
					const Probe = () => <componentContexts.probe.Provider value={null}>{String(useContext(componentContexts.probe))}</componentContexts.probe.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe, loader });
				`,
			},
			inventory,
			emitKeepMap: true,
		});

		try {
			assert.equal(result.status, 0, result.output);
			const clientFiles = await readdir(
				path.join(result.fixtureDirectory, 'dist', 'client'),
				{ recursive: true },
			);
			const mapFiles = clientFiles.filter((file) => file.endsWith('.map'));
			// The forced chunk maps must not ship anywhere in the client
			// output — but the unrelated asset an earlier plugin emitted
			// (assets/keep.map) is not a map this plugin forced, and it must
			// survive byte-for-byte instead of being swept up by a *.map
			// filename filter.
			assert.deepEqual(
				mapFiles.filter((file) => file !== 'assets/keep.map'),
				[],
				'guard-stripped source maps must not ship anywhere in the client output',
			);
			const keepMap = await readFile(
				path.join(
					result.fixtureDirectory,
					'dist',
					'client',
					'assets',
					'keep.map',
				),
				'utf8',
			);
			assert.equal(
				keepMap,
				'{"version":3,"sources":[],"mappings":""}',
				'the unrelated .map asset must survive byte-for-byte',
			);
			// 'hidden' also keeps the sourceMappingURL comment out of the chunks.
			const chunkCode = await readFile(
				path.join(
					result.fixtureDirectory,
					'dist',
					'client',
					clientFiles.find(
						(file) => file.endsWith('.js') && !file.endsWith('.map'),
					) ?? '',
				),
				'utf8',
			);
			assert.doesNotMatch(chunkCode, /sourceMappingURL/);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'emits no client source map files even when the output renames map files while an unrelated map asset survives',
	{ timeout: 120_000 },
	async () => {
		const inventory = [
			{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
			// F824 ui F6: one inventory entry per minting site — the probe hosts TWO.
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
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
					const loaderContexts = { probe: createStrictContext<null>(null) };
					const loader = () => ({ context: String(loaderContexts.probe) });
					const componentContexts = { probe: createStrictContext<null>(null) };
					const Probe = () => <componentContexts.probe.Provider value={null}>{String(useContext(componentContexts.probe))}</componentContexts.probe.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe, loader });
				`,
			},
			inventory,
			customSourcemapFileNames: true,
			emitKeepMap: true,
		});

		try {
			assert.equal(result.status, 0, result.output);
			const clientFiles = await readdir(
				path.join(result.fixtureDirectory, 'dist', 'client'),
				{ recursive: true },
			);
			// With `sourcemapFileNames: 'maps/[name]-[hash].map'` the map
			// assets live outside `assets/` under names no `${chunk}.map`
			// derivation could have guessed; the guard must still strip them —
			// while the unrelated `assets/keep.map` asset survives untouched.
			assert.deepEqual(
				clientFiles.filter(
					(file) => file.endsWith('.map') && file !== 'assets/keep.map',
				),
				[],
				'guard-stripped source maps must not ship under renamed map file names',
			);
			const keepMap = await readFile(
				path.join(
					result.fixtureDirectory,
					'dist',
					'client',
					'assets',
					'keep.map',
				),
				'utf8',
			);
			assert.equal(
				keepMap,
				'{"version":3,"sources":[],"mappings":""}',
				'the unrelated .map asset must survive byte-for-byte',
			);
			const chunkCode = await readFile(
				path.join(
					result.fixtureDirectory,
					'dist',
					'client',
					clientFiles.find(
						(file) => file.endsWith('.js') && !file.endsWith('.map'),
					) ?? '',
				),
				'utf8',
			);
			assert.doesNotMatch(chunkCode, /sourceMappingURL/);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'emits no client source map files even when the output renames maps to a non-.map extension',
	{ timeout: 120_000 },
	async () => {
		// Round 23 §157: the old cleanup only considered `.map`-suffixed
		// assets, so a `sourcemapFileNames` pattern ending in `.txt` leaked the
		// guard's forced maps. The guard now owns the forced map filenames
		// and strips them by name, whatever suffix the output would have used.
		const inventory = [
			{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
			// F824 ui F6: one inventory entry per minting site — the probe hosts TWO.
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
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
					const loaderContexts = { probe: createStrictContext<null>(null) };
					const loader = () => ({ context: String(loaderContexts.probe) });
					const componentContexts = { probe: createStrictContext<null>(null) };
					const Probe = () => <componentContexts.probe.Provider value={null}>{String(useContext(componentContexts.probe))}</componentContexts.probe.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe, loader });
				`,
			},
			inventory,
			customSourcemapFileNames: 'maps/[name]-[hash].txt',
		});

		try {
			assert.equal(result.status, 0, result.output);
			const clientDirectory = path.join(
				result.fixtureDirectory,
				'dist',
				'client',
			);
			const clientFiles = await readdir(clientDirectory, { recursive: true });
			// No source map may ship under ANY name — the guard pins the forced
			// map naming to `[name].map`, so even a user pattern ending in
			// `.txt` must be neutralized and the maps stripped. A leaked
			// `.txt` map would be a source map that must not be present.
			for (const file of clientFiles) {
				const fullPath = path.join(clientDirectory, file);
				let source;
				try {
					source = await readFile(fullPath, 'utf8');
				} catch {
					continue; // a directory entry, not a file
				}
				assert.doesNotMatch(
					source,
					/^\{\s*"version"\s*:\s*3/,
					`source map content leaked at ${file}`,
				);
			}
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'does not delete an unrelated map asset whose content equals a chunk map',
	{ timeout: 120_000 },
	async () => {
		// Round 23 §157: content equality is not ownership. An unrelated
		// asset that happens to serialize one of the chunk maps byte-for-byte
		// is not a map this plugin forced, and must survive untouched — the
		// guard deletes the forced maps by their own exact filenames, never
		// every content-identical lookalike.
		const inventory = [
			{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
			// F824 ui F6: one inventory entry per minting site — the probe hosts TWO.
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
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
					const loaderContexts = { probe: createStrictContext<null>(null) };
					const loader = () => ({ context: String(loaderContexts.probe) });
					const componentContexts = { probe: createStrictContext<null>(null) };
					const Probe = () => <componentContexts.probe.Provider value={null}>{String(useContext(componentContexts.probe))}</componentContexts.probe.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe, loader });
				`,
			},
			inventory,
			emitKeepMap: true,
			keepMapContentEqualsChunkMap: true,
		});

		try {
			assert.equal(result.status, 0, result.output);
			const keepMap = await readFile(
				path.join(
					result.fixtureDirectory,
					'dist',
					'client',
					'assets',
					'keep.map',
				),
				'utf8',
			);
			assert.match(keepMap, /^\{/);
			assert.doesNotThrow(() => JSON.parse(keepMap));
			const parsed = JSON.parse(keepMap);
			assert.equal(parsed.version, 3);
			assert.ok(
				parsed.sources?.length > 0,
				'the asset carried a real chunk map',
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build closed when the per-module rendered mint identifier is renamed and the split map hides the mint',
	{ timeout: 120_000 },
	async () => {
		// Round 25's R25_MINIFIED_CALLEE through a real build: the split
		// copy's map hides the mint (its segments resolve outside the
		// recorded span) while minification renames the per-module rendered
		// mint identifier, so a name-based non-minting verdict would declare
		// the genuinely minting copy "provably non-minting" and ship the
		// duplicated mint green. The single emitted-call classifier never
		// reads the rendered text: it fails closed on the unverifiable copy.
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
			forgeSplitMap: true,
			renameModuleCallee: true,
		});

		try {
			const renamedCopies = [];
			for (const chunk of JSON.parse(result.trace) as TraceChunk[]) {
				for (const [moduleId, code] of Object.entries(chunk.modules)) {
					if (moduleId.includes('/src/routes/probe.tsx')) {
						renamedCopies.push(`${chunk.fileName} :: ${moduleId} :: ${code}`);
					}
				}
			}
			assert.ok(
				renamedCopies.length >= 2,
				`SPLIT ${JSON.stringify(renamedCopies, null, 2)}`,
			);
			assert.ok(
				renamedCopies.every(
					(location) => !/create(?:Strict)?Context\s*\(/.test(location),
				),
				`the mint must be renamed away from the source spelling in every rendered module: ${JSON.stringify(renamedCopies, null, 2)}`,
			);
			assert.ok(
				renamedCopies.some((location) =>
					/\b[cm][^a-zA-Z0-9_$]*\(null\)/.test(location),
				),
				`the renamed mint call must still execute in a rendered module: ${JSON.stringify(renamedCopies, null, 2)}`,
			);
			assert.notEqual(result.status, 0, result.output);
			assert.match(
				result.output,
				/cannot classify how ProbeContext in src\/routes\/probe\.tsx is created/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'fails a real TanStack route build when the per-module rendered mint identifier is renamed and the map stays honest',
	{ timeout: 120_000 },
	async () => {
		// Round 27's R27_MIN_POSITIVE, pinned permanently: the fail-closed
		// half of minification tolerance is pinned by the sibling test
		// above, but the positive half — the guard still *reports* a
		// duplication when the rendered mint identifier is renamed — was
		// only ever demonstrated by a probe. An honest map (no
		// forgeSplitMap) ties the renamed mint's emitted call back to the
		// recorded span, so the verdict must fire. This test dies if the
		// spelling dependency ever returns to the classifier.
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
			renameModuleCallee: true,
		});

		try {
			const renamedCopies = [];
			for (const chunk of JSON.parse(result.trace) as TraceChunk[]) {
				for (const [moduleId, code] of Object.entries(chunk.modules)) {
					if (moduleId.includes('/src/routes/probe.tsx')) {
						renamedCopies.push(`${chunk.fileName} :: ${moduleId} :: ${code}`);
					}
				}
			}
			assert.ok(
				renamedCopies.length >= 2,
				`SPLIT ${JSON.stringify(renamedCopies, null, 2)}`,
			);
			assert.ok(
				renamedCopies.every(
					(location) => !/create(?:Strict)?Context\s*\(/.test(location),
				),
				`the mint must be renamed away from the source spelling in every rendered module: ${JSON.stringify(renamedCopies, null, 2)}`,
			);
			assert.ok(
				renamedCopies.some((location) =>
					/\b[cm][^a-zA-Z0-9_$]*\(null\)/.test(location),
				),
				`the renamed mint call must still execute in a rendered module: ${JSON.stringify(renamedCopies, null, 2)}`,
			);
			assert.notEqual(result.status, 0, result.output);
			assert.match(
				result.output,
				/ProbeContext in src\/routes\/probe\.tsx is present in multiple client chunks: assets\/index-[a-zA-Z0-9_-]+\.js, assets\/probe-[a-zA-Z0-9_-]+\.js/i,
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'survives an exact-name map asset a plugin places at a forced map key in a real build',
	{ timeout: 120_000 },
	async () => {
		// Round 25's R25_FORCED_NAME_COLLISION through a complete Vite
		// build: a plugin replaces the guard's own map asset at the exact
		// pinned key (`chunk.name + '.map'`) with unrelated content before
		// the guard's generateBundle runs. The guard must delete only the
		// maps it caused — content-identical to the chunk's own map object —
		// so the plugin's same-key asset survives byte-for-byte while every
		// other forced map is still stripped.
		const inventory = [
			{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
			// F824 ui F6: one inventory entry per minting site — the probe hosts TWO.
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
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
					const loaderContexts = { probe: createStrictContext<null>(null) };
					const loader = () => ({ context: String(loaderContexts.probe) });
					const componentContexts = { probe: createStrictContext<null>(null) };
					const Probe = () => <componentContexts.probe.Provider value={null}>{String(useContext(componentContexts.probe))}</componentContexts.probe.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe, loader });
				`,
			},
			inventory,
			replaceOwnedMapAsset: true,
		});

		try {
			assert.equal(result.status, 0, result.output);
			const clientDirectory = path.join(
				result.fixtureDirectory,
				'dist',
				'client',
			);
			const clientFiles = await readdir(clientDirectory, { recursive: true });
			const mapFiles = clientFiles.filter((file) => file.endsWith('.map'));
			// Exactly one map asset survives: the unrelated one the fixture
			// plugin placed at the first mapped chunk's pinned key.
			assert.equal(mapFiles.length, 1, `MAPS ${JSON.stringify(mapFiles)}`);
			const foreignMap = await readFile(
				path.join(clientDirectory, mapFiles[0]),
				'utf8',
			);
			assert.equal(
				foreignMap,
				'{"version":3,"sources":[],"mappings":"","foreign":true}',
				'the exact-name unrelated asset must survive byte-for-byte',
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'survives a real-build map asset at a forced key whose sourcesContent is stripped, while the guard still strips its own maps',
	{ timeout: 120_000 },
	async () => {
		// Round 27's IMPORTANT reproduction in a complete build: a "ship
		// maps without embedded sources" plugin rewrites the chunk's own map
		// at the pinned key with `sourcesContent` stripped. Its bytes are
		// not the serialization the guard recorded when it forced the map,
		// so the guard must leave it untouched — and still strip every map
		// it did force from the output.
		const inventory = [
			{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
			// F824 ui F6: one inventory entry per minting site — the probe hosts TWO.
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
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
					const loaderContexts = { probe: createStrictContext<null>(null) };
					const loader = () => ({ context: String(loaderContexts.probe) });
					const componentContexts = { probe: createStrictContext<null>(null) };
					const Probe = () => <componentContexts.probe.Provider value={null}>{String(useContext(componentContexts.probe))}</componentContexts.probe.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe, loader });
				`,
			},
			inventory,
			replaceOwnedMapAsset: 'trimmed',
		});

		try {
			assert.equal(result.status, 0, result.output);
			const clientDirectory = path.join(
				result.fixtureDirectory,
				'dist',
				'client',
			);
			const clientFiles = await readdir(clientDirectory, { recursive: true });
			const mapFiles = clientFiles.filter((file) => file.endsWith('.map'));
			// Exactly one map asset survives: the trimmed one the fixture
			// plugin placed at the first mapped chunk's pinned key. Every
			// map the guard forced is still stripped.
			assert.equal(mapFiles.length, 1, `MAPS ${JSON.stringify(mapFiles)}`);
			const replaced = JSON.parse(
				await readFile(
					path.join(result.fixtureDirectory, 'replaced-chunk.json'),
					'utf8',
				),
			);
			assert.equal(mapFiles[0], replaced.fileName);
			const trimmedMap = await readFile(
				path.join(clientDirectory, mapFiles[0]),
				'utf8',
			);
			assert.equal(
				trimmedMap,
				replaced.source,
				'the sourcesContent-stripped map must survive byte-for-byte',
			);
			const parsed = JSON.parse(trimmedMap);
			assert.equal(parsed.version, 3);
			assert.ok(
				parsed.sources?.length > 0,
				'the survivor must be the chunk\u2019s own map, not a stub',
			);
			assert.ok(
				!('sourcesContent' in parsed),
				'the survivor must be the realistic stripped-map artifact',
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);

void test(
	'survives a minimal {"version":3} stub at a forced map key in a real build while the guard still strips its own maps',
	{ timeout: 120_000 },
	async () => {
		// Round 27's boundary probe, pinned in a complete build: a stub
		// whose fields are a strict subset of the chunk map's serialization
		// is not the map the guard recorded, so it survives untouched while
		// the guard still strips every map it did force.
		const inventory = [
			{ name: '<anonymous context>', sourceFile: 'src/make-context.ts' },
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
			// F824 ui F6: one inventory entry per minting site — the probe hosts TWO.
			{ name: '<anonymous context>', sourceFile: 'src/routes/probe.tsx' },
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
					const loaderContexts = { probe: createStrictContext<null>(null) };
					const loader = () => ({ context: String(loaderContexts.probe) });
					const componentContexts = { probe: createStrictContext<null>(null) };
					const Probe = () => <componentContexts.probe.Provider value={null}>{String(useContext(componentContexts.probe))}</componentContexts.probe.Provider>;
					export const Route = createFileRoute('/probe')({ component: Probe, loader });
				`,
			},
			inventory,
			replaceOwnedMapAsset: 'stub',
		});

		try {
			assert.equal(result.status, 0, result.output);
			const clientDirectory = path.join(
				result.fixtureDirectory,
				'dist',
				'client',
			);
			const clientFiles = await readdir(clientDirectory, { recursive: true });
			const mapFiles = clientFiles.filter((file) => file.endsWith('.map'));
			// Exactly one map asset survives: the stub the fixture plugin
			// placed at the first mapped chunk's pinned key.
			assert.equal(mapFiles.length, 1, `MAPS ${JSON.stringify(mapFiles)}`);
			const replaced = JSON.parse(
				await readFile(
					path.join(result.fixtureDirectory, 'replaced-chunk.json'),
					'utf8',
				),
			);
			assert.equal(mapFiles[0], replaced.fileName);
			const stubMap = await readFile(
				path.join(clientDirectory, mapFiles[0]),
				'utf8',
			);
			assert.equal(
				stubMap,
				'{"version":3}',
				'the minimal stub must survive byte-for-byte',
			);
		} finally {
			await rm(result.fixtureDirectory, { force: true, recursive: true });
		}
	},
);
