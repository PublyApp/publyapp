import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Scanner } from '@tailwindcss/oxide';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ts } from 'ts-morph';

import {
	buildProductionApp,
	classifyModuleKind,
	classifyZUtility,
	checkAuthoredCssScaleDefinitions,
	checkCompiledCssZIndex,
	collectRawImportBindings,
	KNOWN_RAW_Z_INDEX_DECLARATIONS,
	runZIndexGuard,
	scanZIndexFile,
	stripComments,
	type ProductionBuildResult,
} from './check-zindex-guard.mts';

// #987 — z-index scale guard. Every fixture below lives in `scripts/`, outside
// the `src/**` tree the production scanner watches, so fixture literals can
// never reach the shipped stylesheet the way the withdrawn guard's did. The
// end-to-end tests drive the *full* guard (`runZIndexGuard`) against isolated
// fixture trees whose own app.css points `source('./src')` at a throwaway
// `src/` — proving behaviour through the production scanner, not just the
// source component.

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

// Fixture trees must live under `scripts/` so `@import 'tailwindcss'` resolves
// from `apps/front/node_modules`; a hard kill during the suite could otherwise
// leave `scripts/zindex-guard-*` directories in the working tree. Sweep any
// stale fixture directories up front so the suite always starts clean.
for (const entry of await readdir(scriptsDir)) {
	if (/^zindex-(guard|outdir)-/.test(entry)) {
		await rm(path.join(scriptsDir, entry), { recursive: true, force: true });
	}
}

const FIXTURE_APP_CSS = `@import 'tailwindcss' source('./src');
:root {
  --publy-z-raised: 10;
  --publy-z-menu: 100;
}
`;

// Runs the full guard against an isolated fixture tree. The tree lives under
// `scripts/` so `@import 'tailwindcss'` resolves from `apps/front/node_modules`
// (it would not resolve from the OS tmpdir) while staying invisible to the real
// guard, whose scanner only watches `src/**`.
//
// The fixture build IS the production build path (`buildProductionApp`): the
// provenance recording every fixture exercises is the same pre-transform hook
// the shipped CLI runs, not a test-file copy of it. A regression in the real
// plugin's extension test, query parsing, or path recording reds these tests
// instead of sailing past a stand-in.
const buildViteFixture = async (
	root: string,
): Promise<ProductionBuildResult> => buildProductionApp(root);

const runFixtureGuard = async (
	files: Record<string, string>,
	appCssExtra = '',
	entryImports: ReadonlyArray<string> = [],
	emittedCssOverride:
		| string
		| ReadonlyArray<{ file: string; content: string }>
		| null = null,
	productionBuildOverride:
		| ((root: string) => Promise<ProductionBuildResult>)
		| null = null,
	appCssOverride: string | null = null,
	extraDirectories: ReadonlyArray<string> = [],
) => {
	// `emittedCssOverride` is a single `{ file, content }` entry or an array
	// of them, so tests can pin gates that only fire across assets.
	const singleEmittedOverride =
		emittedCssOverride == null
			? []
			: [{ file: 'fixture.css', content: emittedCssOverride }];
	const emittedOverrides = Array.isArray(emittedCssOverride)
		? emittedCssOverride
		: singleEmittedOverride;
	const root = await mkdtemp(path.join(scriptsDir, 'zindex-guard-'));
	try {
		await mkdir(path.join(root, 'src'), { recursive: true });
		for (const directory of extraDirectories) {
			await mkdir(path.join(root, directory), { recursive: true });
		}
		await writeFile(
			path.join(root, 'app.css'),
			appCssOverride == null ? FIXTURE_APP_CSS + appCssExtra : appCssOverride,
		);
		for (const [relativePath, content] of Object.entries(files)) {
			const absolutePath = path.join(root, 'src', relativePath);
			await mkdir(path.dirname(absolutePath), { recursive: true });
			await writeFile(absolutePath, content);
		}
		await writeFile(
			path.join(root, 'index.html'),
			'<div id="app"></div><script type="module" src="/src/main.ts"></script>',
		);
		// The fixture build is the real `buildProductionApp`, so the fixture
		// root needs its own Vite config: `@import 'tailwindcss'` in app.css
		// must compile the way the production build compiles it.
		await writeFile(
			path.join(root, 'vite.config.mjs'),
			"import tailwindcss from '@tailwindcss/vite';\n" +
				'export default { plugins: [tailwindcss()] };\n',
		);
		await writeFile(
			path.join(root, 'src/main.ts'),
			[`import '../app.css';`, ...entryImports].join('\n'),
		);
		let productionBuild;
		if (productionBuildOverride != null) {
			productionBuild = () => productionBuildOverride(root);
		} else if (emittedOverrides.length === 0) {
			productionBuild = () => buildViteFixture(root);
		} else {
			productionBuild = async () => {
				await mkdir(path.join(root, 'dist'), { recursive: true });
				for (const { file, content } of emittedOverrides) {
					await writeFile(path.join(root, 'dist', file), content);
				}
				return {
					emittedCssRoot: path.join(root, 'dist'),
					authoredCssPaths: [path.join(root, 'app.css')],
					authoredScriptPaths: [path.join(root, 'src/main.ts')],
					cleanup: async () => {},
				};
			};
		}
		const result = await runZIndexGuard({
			baseDir: root,
			appCssPath: path.join(root, 'app.css'),
			productionBuild,
		});
		return result;
	} finally {
		await rm(root, { recursive: true, force: true });
	}
};

const scanner = new Scanner({ sources: [] });

const violationsFor = (relativePath: string, content: string) =>
	scanZIndexFile({ scanner, relativePath, content });

const assertRaw = (relativePath: string, content: string) => {
	const violations = violationsFor(relativePath, content);
	assert.ok(
		violations.length > 0,
		`expected a violation for ${relativePath}: ${JSON.stringify(content)}`,
	);
	return violations;
};

const assertClean = (relativePath: string, content: string) => {
	const violations = violationsFor(relativePath, content);
	assert.deepEqual(
		violations.map((violation) => violation.source),
		[],
		`expected no violations for ${relativePath}: ${JSON.stringify(content)}`,
	);
};

test('guard structure (round 23 B1): every staticString() consumption routes through the three-outcome funnel', async () => {
	// Round 21's "every call site was audited" claim failed because an audit
	// cannot hold a property the code does not enforce: a consumer added
	// after the audit dropped `staticString()` overflow back onto the benign
	// default (`?? null` → "ordinary unknown"). This check is mechanical,
	// not a hand-written list: it parses the guard script and enumerates the
	// call sites itself.
	//   - The raw projection (`staticStringRaw`) must be reachable only from
	//     inside the `staticString` funnel.
	//   - Every funnel call must name all three outcomes (a node plus three
	//     handlers). A new consumer that calls the raw projection directly,
	//     or a funnel call that omits a handler, fails here.
	const script = await readFile(
		path.join(scriptsDir, 'check-zindex-guard.mts'),
		'utf8',
	);
	const sourceFile = ts.createSourceFile(
		'check-zindex-guard.mts',
		script,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS,
	);
	const funnelCalls: ts.CallExpression[] = [];
	const rawCalls: ts.CallExpression[] = [];
	let funnelArrow: ts.ArrowFunction | null = null;
	const visit = (node: ts.Node) => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			if (node.expression.text === 'staticStringRaw') {
				rawCalls.push(node);
			} else if (node.expression.text === 'staticString') {
				funnelCalls.push(node);
			}
		}
		if (
			funnelArrow == null &&
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === 'staticString' &&
			node.initializer != null &&
			ts.isArrowFunction(node.initializer)
		) {
			funnelArrow = node.initializer;
		}
		node.forEachChild(visit);
	};
	visit(sourceFile);
	assert.ok(funnelArrow != null, 'the staticString funnel must exist');
	const funnel = funnelArrow;
	// The funnel itself must dispatch on all three outcomes — a rewrite that
	// folds overflow back into the benign branch is a B1 regression. The
	// markers are anchored to the dispatch statements, not the outcome kind
	// text: `false && kind.kind === 'overflow'` still contains the old marker
	// string, and a disabled dispatch is exactly the round-21 conflation this
	// check exists to catch (round-23 mutation evidence).
	const funnelText = funnel.getText(sourceFile);
	assert.ok(
		funnelText.includes("if (kind.kind === 'value') {"),
		`the funnel must dispatch the resolved-value outcome: ${funnelText}`,
	);
	assert.ok(
		funnelText.includes("if (kind.kind === 'overflow') {") &&
			funnelText.includes('return onOverflow();'),
		`the funnel must dispatch UNRESOLVED overflow to its own handler, ` +
			`never folding it onto the not-static branch: ${funnelText}`,
	);
	assert.ok(funnelCalls.length >= 7, 'every consumer must use the funnel');
	// Every raw-projection call site must sit inside the funnel body.
	const enclosingFunction = (
		call: ts.CallExpression,
	): ts.Node | null => {
		let cursor: ts.Node | null = call.parent;
		while (cursor != null) {
			if (
				ts.isArrowFunction(cursor) ||
				ts.isFunctionExpression(cursor) ||
				ts.isFunctionDeclaration(cursor) ||
				ts.isMethodDeclaration(cursor)
			) {
				return cursor;
			}
			cursor = cursor.parent;
		}
		return null;
	};
	const isFunnel = (fn: ts.Node | null): boolean =>
		fn === funnelArrow ||
		(fn != null &&
			ts.isArrowFunction(fn) &&
			ts.isVariableDeclaration(fn.parent) &&
			ts.isIdentifier(fn.parent.name) &&
			fn.parent.name.text === 'staticString');
	for (const call of rawCalls) {
		assert.ok(
			isFunnel(enclosingFunction(call)),
			`staticStringRaw must only be called inside the funnel: ${call.getText(
				sourceFile,
			)}`,
		);
	}
	// Every funnel call must name all three outcomes — no `?? null`, no
	// truthiness-guarded `.value` read, no default that maps a non-value
	// result onto a benign kind.
	for (const call of funnelCalls) {
		assert.equal(
			call.arguments.length,
			4,
			`staticString() must receive a node and onValue/onOverflow/onNotStatic handlers: ${call.getText(
				sourceFile,
			)}`,
		);
	}
});

// Compiled-gate violations come from the emitted assets of the real build
// (`emitted/<relative>` display paths, since the guard-owned output directory
// lives in the OS temp root) or from an override fixture under `dist/`.
const isCompiledCssFile = (file: string | null | undefined) =>
	file != null &&
	(file === 'compiled stylesheet' ||
		file.startsWith('dist/') ||
		file.startsWith('emitted/'));

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------
test('classifier: every evasion shape is a raw z-index utility', () => {
	for (const candidate of [
		'z-50',
		'z-0',
		'z-[60]',
		'z-[50]',
		'-z-10',
		'!z-50',
		'z-50!',
		'md:z-50',
		'[&:hover]:z-50',
		'hover:-z-10',
		'z-[var(--publy-z-menu,50)]',
		'z-[50px]',
		'[z-index:5]',
		'hover:[z-index:5]',
		'[Z-INDEX:5]',
		'[z-index:--publy-z-menu]',
	]) {
		assert.equal(classifyZUtility(candidate), 'raw', candidate);
	}
});

test('classifier: scale-routed and inert utilities are allowed', () => {
	for (const candidate of [
		'z-auto',
		'z-(--publy-z-raised)',
		'z-(--publy-z-shell-topbar)',
		'z-[--publy-z-menu]',
		'z-[var(--publy-z-menu)]',
		'md:z-(--publy-z-menu)',
		'!z-(--publy-z-raised)',
		'z-(--publy-z-raised)!',
		'z-[inherit]',
		'z-[AUTO]',
		'z-[InHeRiT]',
		'z-[VAR(--publy-z-raised)]',
		'z-[initial]',
		'z-[unset]',
		'z-[revert]',
		'[z-index:var(--publy-z-menu)]',
		'[z-index:auto]',
	]) {
		assert.equal(classifyZUtility(candidate), 'allowed', candidate);
	}
});

test('classifier: unknown scale token is raw outside the canonical app.css scale', () => {
	const canonicalScaleTokens = new Set(['--publy-z-raised']);
	assert.equal(
		classifyZUtility('z-(--publy-z-raised)', canonicalScaleTokens),
		'allowed',
	);
	assert.equal(
		classifyZUtility('z-(--publy-z-not-declared)', canonicalScaleTokens),
		'raw',
	);
});

test('classifier: undeclared scale tokens are raw without an explicit token set', () => {
	for (const candidate of [
		'z-(--publy-z-not-declared)',
		'z-[--publy-z-not-declared]',
		'z-[var(--publy-z-not-declared)]',
		'[z-index:var(--publy-z-not-declared)]',
	]) {
		assert.equal(classifyZUtility(candidate), 'raw', candidate);
	}
});

test('e2e: unknown scale utility is rejected while canonical utility stays green', async () => {
	const { violations } = await runFixtureGuard({
		'probe.tsx':
			'export const view = <div className="z-(--publy-z-raised) ' +
			'z-(--publy-z-not-declared)" />;',
	});
	assert.ok(
		violations.some(
			({ file, ruleId, source }: {
				file?: string;
				ruleId: string;
				source?: string;
			}) =>
				file != null &&
				file.endsWith('probe.tsx') &&
				ruleId === 'z-index-utility-not-on-scale' &&
				source === 'z-(--publy-z-not-declared)',
		),
		`expected the unknown source utility to red: ${JSON.stringify(violations)}`,
	);
	assert.ok(
		!violations.some(
			({ file, source }: { file?: string; source?: string }) =>
				file != null &&
				file.endsWith('probe.tsx') &&
				source === 'z-(--publy-z-raised)',
		),
		`expected the canonical source utility to stay green: ${JSON.stringify(violations)}`,
	);
});

test('classifier: non-utilities are null', () => {
	for (const candidate of [
		'z-index',
		'--publy-z-menu',
		'block',
		'fixed',
		'px-2',
		'text-foreground',
		'[&>svg]:size-3!',
		'[-z-index:5]',
		'[color:red]',
	]) {
		assert.equal(classifyZUtility(candidate), null, candidate);
	}
});

// ---------------------------------------------------------------------------
// Evasions — the withdrawn guard was green on all of these.
// ---------------------------------------------------------------------------
test('evasion: template literal with substitution still yields the z-50 candidate', () => {
	assertRaw(
		'fixture.tsx',
		'const x = "px-2"; export const view = <div className={`fixed z-50 ${x}`} />;',
	);
});

test('evasion: @apply terminal and mid tokens are scanned directly', () => {
	assertRaw('fixture.css', '.x { @apply block z-50; }');
	assertRaw('fixture.css', '.x { @apply z-50; }');
	assertRaw('fixture.css', '.x { @apply block !z-50; }');
});

test('evasion: cross-module constant class string is a delivery position', () => {
	assertRaw('constants.ts', "export const layers = 'z-50 fixed top-0';");
});

test('evasion: important modifier and variants are stripped before classifying', () => {
	assertRaw(
		'fixture.tsx',
		'<div className="!z-50 z-50! md:z-50 [&:hover]:z-50" />',
	);
	assertRaw('fixture.tsx', '<div className="hover:-z-10" />');
});

test('evasion: utility spanning a substitution boundary has no candidate', () => {
	assertRaw('fixture.tsx', 'const view = <div className={`z-${level}`} />;');
	assertRaw('fixture.tsx', 'const view = <div className={`z-[${value}]`} />;');
	assertRaw('fixture.tsx', 'const view = <div className={`-z-${value}`} />;');
	assertRaw(
		'fixture.tsx',
		'const view = <div className={`${prefix}z-${value}`} />;',
	);
	assertRaw('fixture.tsx', 'const view = <div className={`md:z-${level}`} />;');
	assertRaw(
		'fixture.tsx',
		'const view = <div className={`fixed z-${level} block`} />;',
	);
});

test('evasion: literal stylesheet links cannot ship opaque CSS', () => {
	for (const content of [
		'<link rel="stylesheet" href="data:text/css,.x%7Bz-index%3A99%7D" />',
		"<link href={'https://cdn.example/theme.css'} rel={'StyleSheet'} />",
		'<link rel="alternate stylesheet" href="/theme.css" />',
		[
			"const REL = 'stylesheet';",
			"const HREF = 'data:text/css,.x%7Bz-index%3A99%7D';",
			'<link rel={REL} href={HREF} />;',
		].join('\n'),
		"<link rel={'stylesheet' as const} href={('https://cdn.example/theme.css')} />",
	]) {
		const violations = violationsFor('fixture.tsx', content);
		assert.deepEqual(
			violations.map((violation) => violation.ruleId),
			['z-index-opaque-stylesheet-link'],
			content,
		);
	}
	// The framework-head spellings of the same evasion. A head slot is a
	// link-descriptor sink only when its config object provably reaches a
	// route creator (round-23 I2), so each shape here is a real
	// `createRootRoute(...)` consumer — never a dead object.
	for (const content of [
		"const head = createRootRoute({ head: () => ({ links: [{ rel: 'stylesheet', href: 'data:text/css,.x%7Bz-index%3A99%7D' }] }) });",
		[
			"const REL = 'stylesheet';",
			"const HREF = 'https://cdn.example/theme.css';",
			'const head = createRootRoute({ head: () => ({ links: [{ rel: REL, href: HREF }] }) });',
		].join('\n'),
		[
			"const rel = 'stylesheet';",
			"const href = 'https://cdn.example/theme.css';",
			'const head = createRootRoute({ head: () => ({ links: [{ rel, href }] }) });',
		].join('\n'),
		"const head = createRootRoute({ head: () => ({ links: [{ rel: ('stylesheet' satisfies string), href: 'https://cdn.example/theme.css' as const }] }) });",
	]) {
		const violations = violationsFor('fixture.tsx', content);
		assert.deepEqual(
			violations.map((violation) => violation.ruleId),
			['z-index-opaque-stylesheet-link'],
			content,
		);
	}
});

test('raw sinks: duplicate JSX link attributes obey source-order last-write-wins', () => {
	// Every other attribute reader in the guard mirrors React's props
	// object, where the last duplicate attribute wins;
	// staticJsxAttributeValues was the only find-first reader (round-15 M1).
	// The last occurrence decides the link rule in both directions.
	assertRaw(
		'fixture.tsx',
		'<link rel="preload" rel="stylesheet" href="data:text/css,.x%7Bz-index%3A99%7D" />',
	);
	assertClean(
		'fixture.tsx',
		'<link rel="stylesheet" rel="preload" href="data:text/css,.x%7Bz-index%3A99%7D" />',
	);
});

test('raw sinks (round 17 I1): JSX link attributes follow the source-ordered spread model', () => {
	// Round-16 I1: staticJsxAttributeValues selected the last explicit JSX
	// attribute but ignored every JsxSpreadAttribute, while
	// dangerousHtmlPayloadObject resolved static spreads — the readers
	// disagreed in both directions. A static spread after an explicit `rel`
	// reinstalled the false negative; the reverse order reinstalled the
	// false positive. Link attributes now read through the same shared
	// walker as every other JSX attribute: the last occurrence wins across
	// explicit attributes AND static object-literal spreads, and an opaque
	// spread after the last static fact fails loud by name. Every guard
	// verdict is paired with the artifact React actually renders.
	const href = 'data:text/css,.x%7Bz-index%3A2147483573%7D';
	const render = (rel: string, spread: Record<string, string>) =>
		renderToStaticMarkup(React.createElement('link', { rel, ...spread, href }));
	// False negative direction: the shipped artifact is a stylesheet, the
	// guard must red it — the spread is a later write.
	const fn =
		'<link rel="preload" {...{ rel: "stylesheet" }} href="data:text/css,.x%7Bz-index%3A2147483573%7D" />';
	assertRaw('fixture.tsx', fn);
	assert.match(
		render('preload', { rel: 'stylesheet' }),
		/rel="stylesheet"/,
		'the shipped artifact must be a stylesheet link',
	);
	// False positive direction: the shipped artifact is a preload, the guard
	// must stay green — the spread is an earlier write, the explicit
	// attribute overrides it.
	const fp =
		'<link rel="stylesheet" {...{ rel: "preload" }} href="data:text/css,.x%7Bz-index%3A2147483573%7D" />';
	assertClean('fixture.tsx', fp);
	assert.match(
		render('stylesheet', { rel: 'preload' }),
		/rel="preload"/,
		'the shipped artifact must be a preload link',
	);
	// A later explicit attribute re-establishes the stylesheet fact after a
	// static spread, in both JSX spellings.
	assertRaw(
		'fixture.tsx',
		'<link {...{ rel: "preload" }} rel="stylesheet" href="data:text/css,.x%7Bz-index%3A2147483573%7D" />',
	);
	assertRaw(
		'fixture.tsx',
		'<link rel="preload" {...{ rel: "stylesheet", as: "style" }} href="data:text/css,.x%7Bz-index%3A2147483573%7D" />',
	);
	// A spread const object literal is the same static payload as the
	// literal spelling.
	assertRaw(
		'fixture.tsx',
		[
			"const LINK_REL = { rel: 'stylesheet' };",
			'<link rel="preload" {...LINK_REL} href="data:text/css,.x%7Bz-index%3A2147483573%7D" />',
		].join('\n'),
	);
	// An opaque spread after a static `rel` may carry the final value — the
	// named diagnostic fires and the literal rule must not.
	const opaque = [
		'const probe = (props: Record<string, string>) => <link',
		'  rel="stylesheet"',
		'  {...props}',
		'  href="data:text/css,.x%7Bz-index%3A2147483573%7D"',
		'/>;',
	].join('\n');
	assert.deepEqual(
		violationsFor('fixture.tsx', opaque).map((violation) => violation.ruleId),
		['z-index-unresolved-spread-shadow'],
		'an opaque spread shadowing the stylesheet rel must fail loud by name',
	);
	// An opaque-only spread on a link element is not provably a stylesheet
	// link — the same runtime bucket as `{...props}` on a div.
	assertClean(
		'fixture.tsx',
		[
			'const probe = (props: Record<string, string>) => <link {...props} />;',
		].join('\n'),
	);
});

test('raw sinks (round 19 B1): an overflowing rel/href candidate space is unresolvable, not unknown', () => {
	// Round-19 B1: staticStringValues returns `{ overflow: true }` when a
	// candidate set exceeds the work budget, and staticJsxAttributeValues
	// previously returned only `values` — overflow became `{ values: null,
	// unresolved: false }`, which the link consumer read as an ordinary
	// unknown and reported nothing. The guard is the standing rule: an input
	// it cannot fully analyse must fail loud, never resolve to a compliant
	// default. A rel whose candidate space overflows the work budget is
	// provably static text the guard cannot enumerate, so it may be
	// `stylesheet` pointing at a data URL — the link consumer must report the
	// named diagnostic.
	const flags = [];
	for (let index = 0; index < 20; index += 1) {
		flags.push(`f${index}: boolean`);
	}
	const substitutions = [];
	for (let index = 0; index < 20; index += 1) {
		substitutions.push(`\${f${index} ? 'stylesheet' : 'a'}`);
	}
	const content = [
		`export const probe = (${flags.join(', ')}) => <link`,
		`  rel={\`${substitutions.join('')}\`}`,
		'  href="data:text/css,.x%7Bz-index%3A99%7D"',
		'/>;',
	].join('\n');
	assert.deepEqual(
		violationsFor('fixture.tsx', content).map((violation) => violation.ruleId),
		['z-index-static-candidate-overflow'],
		'an overflowing rel candidate space must fail loud by name, not as unknown',
	);
});

test('raw sinks (round 19 B1): a 131072-candidate rel that evaluates to stylesheet is red', () => {
	// The round-19 B1 reproduction: 17 module-scope `true` constants make a
	// rel expression with 2^17 = 131,072 statically provable values whose
	// actual runtime value is exactly `stylesheet`. Under the round-19 work
	// budget these short candidates enumerate, so `stylesheet` is a member
	// and the link consumer reds it — a working raw stylesheet can no longer
	// ship while the guard is green.
	const decls = [];
	for (let index = 0; index < 17; index += 1) {
		decls.push(`const g${index} = true;`);
	}
	const substitutions = ["${g0 ? 'stylesheet' : 'preload'}"];
	for (let index = 1; index < 17; index += 1) {
		substitutions.push(
			`\${g${index} ? '' : '${String.fromCharCode(96 + index)}'}`,
		);
	}
	const content = [
		...decls,
		'export const probe = <link',
		`  rel={\`${substitutions.join('')}\`}`,
		'  href="data:text/css,.x%7Bz-index%3A99%7D"',
		'/>;',
	].join('\n');
	assert.deepEqual(
		violationsFor('fixture.tsx', content).map((violation) => violation.ruleId),
		['z-index-opaque-stylesheet-link'],
		'a 131072-candidate rel that must evaluate to stylesheet must red',
	);
});

test('raw sinks (round 19 B1): an overflowing descriptor rel candidate space is unresolvable, not unknown', () => {
	// The static link-descriptor object reader drops overflow the same way
	// the JSX link reader used to: `staticStringValues(...)?.values ?? null`
	// made an overflowing candidate space look like an ordinary unknown. A
	// descriptor rel that overflows the work budget is provably static text
	// the guard cannot enumerate, so it may be `stylesheet` — the value must
	// fail loud by name. This fixture is a REAL consumer proof (round-23 I2):
	// it invokes `createRootRoute({ head: ... })`, the route-config slot that
	// `<HeadContent>` renders — the reachability the literal rules require,
	// not just the head-shaped object shape the round-21 test asserted.
	const flags = [];
	for (let index = 0; index < 20; index += 1) {
		flags.push(`f${index}: boolean`);
	}
	const substitutions = [];
	for (let index = 0; index < 20; index += 1) {
		substitutions.push(`\${f${index} ? 'stylesheet' : 'a'}`);
	}
	const content = [
		`export const probe = (${flags.join(', ')}) => createRootRoute({`,
		'  head: () => ({',
		'    links: [{',
		`      rel: \`${substitutions.join('')}\`,`,
		"      href: 'data:text/css,.x%7Bz-index%3A99%7D',",
		'    }],',
		'  }),',
		'});',
	].join('\n');
	assert.deepEqual(
		violationsFor('fixture.tsx', content).map((violation) => violation.ruleId),
		['z-index-static-candidate-overflow'],
		'an overflowing descriptor rel candidate space must fail loud by name',
	);
});

test('evasion (round 23 I2): an identifier-supplied head function is a genuine route path', () => {
	// The reviewer's genuine direction: `head: routeHead` — a head function
	// supplied by identifier, a module-scope const arrow — is a normal
	// TanStack route path, not an exotic one. The guard must follow the
	// identifier to the head function and redden the stylesheet link it
	// returns; the dead head-shaped object in the same fixture must stay
	// green because no route consumes it (round-23 I2).
	const content = [
		'const routeHead = () => ({',
		"	links: [{ rel: 'stylesheet', href: 'data:text/css,.r23-head%7Bz-index%3A2147483645%7D' }],",
		'});',
		'export const Route = createRootRoute({ head: routeHead });',
		'const dead = { head: () => ({',
		"	links: [{ rel: 'stylesheet', href: 'data:text/css,.r23-dead%7Bz-index%3A2147483644%7D' }],",
		'}) };',
	].join('\n');
	assert.deepEqual(
		violationsFor('fixture.tsx', content).map((violation) => violation.ruleId),
		['z-index-opaque-stylesheet-link'],
		'an identifier-supplied head reaching createRootRoute must red, a dead head-shaped object must not',
	);
});

test('evasion (round 23 I2): a block-bodied identifier head function is a genuine route path', () => {
	// The same genuine path through a block-bodied function declaration —
	// `function routeHead() { return {...}; }` — and a const-config object
	// handed to the route creator by identifier.
	const content = [
		'function routeHead() {',
		'	return {',
		"		links: [{ rel: 'stylesheet', href: 'data:text/css,.r23-fn%7Bz-index%3A2147483646%7D' }],",
		'	};',
		'}',
		'const config = { head: routeHead };',
		'export const Route = createRootRoute(config);',
	].join('\n');
	assert.deepEqual(
		violationsFor('fixture.tsx', content).map((violation) => violation.ruleId),
		['z-index-opaque-stylesheet-link'],
		'a function-declaration head through a const config must red',
	);
});

test('evasion (round 23 I2): createRootRouteWithContext config slots are policed like createRootRoute', () => {
	// The real-tree spelling: `createRootRouteWithContext<...>()({...})` — the
	// config object sits in the outer call of the creator chain, and
	// `<HeadContent>` renders its links exactly as for `createRootRoute`.
	assert.deepEqual(
		violationsFor(
			'fixture.tsx',
			[
				'export const Route = createRootRouteWithContext<{ queryClient: unknown }>()({',
				"	head: () => ({ links: [{ rel: 'stylesheet', href: 'data:text/css,.r23-ctx%7Bz-index%3A2147483647%7D' }] }),",
				'});',
			].join('\n'),
		).map((violation) => violation.ruleId),
		['z-index-opaque-stylesheet-link'],
		'a createRootRouteWithContext head slot must red',
	);
});

test('pair (round 23 I2): a dead head-shaped config object no route consumes stays green', () => {
	// The reviewer's false-positive direction: an object with a `head:` slot
	// that is never handed to a route creator is dead — Chromium measured
	// `deadLinkCount: 0`. Shape under a property named `head` proves nothing;
	// the guard must not report it (round-23 I2). The same object becomes a
	// real descriptor the moment a route creator consumes it.
	const dead = [
		'const config = { head: () => ({',
		"	links: [{ rel: 'stylesheet', href: 'data:text/css,.r23-dead%7Bz-index%3A99%7D' }],",
		'}) };',
		'export const probe = config;',
	].join('\n');
	assertClean('fixture.tsx', dead);
	assertClean(
		'fixture.tsx',
		'export const probe = { head: () => ({ links: [{ rel: "stylesheet", href: "data:text/css,.r23-dead%7Bz-index%3A99%7D" }] }) };',
	);
	const consumed = [
		'const config = { head: () => ({',
		"	links: [{ rel: 'stylesheet', href: 'data:text/css,.r23-dead%7Bz-index%3A99%7D' }],",
		'}) };',
		'export const Route = createRootRoute(config);',
	].join('\n');
	assert.deepEqual(
		violationsFor('fixture.tsx', consumed).map((violation) => violation.ruleId),
		['z-index-opaque-stylesheet-link'],
		'the same config consumed by createRootRoute must red',
	);
});

test('pair (round 21 I2): an ordinary metadata factory with a rel and no consumer stays green', () => {
	// Review-r20 I2's false-positive direction: an ordinary metadata factory
	// with a 20-choice static `rel`, `payload: 42`, no `href`, and no
	// consumer is not a link descriptor — it never reaches `<HeadContent>`,
	// a links API, or the DOM. The pre-fix branch scanned every object with a
	// `rel`/`href` property and reddened it from its shape alone; an object
	// that merely has those keys establishes nothing about a sink.
	const flags = [];
	for (let index = 0; index < 20; index += 1) {
		flags.push(`f${index}: boolean`);
	}
	const substitutions = [];
	for (let index = 0; index < 20; index += 1) {
		substitutions.push(`\${f${index} ? 'stylesheet' : 'a'}`);
	}
	const content = [
		`export const probe = (${flags.join(', ')}) => ({`,
		`  rel: \`${substitutions.join('')}\`,`,
		'  payload: 42,',
		'});',
	].join('\n');
	assertClean('fixture.tsx', content);
});

test('pair (round 21 I2): a standalone descriptor object with a literal stylesheet href and no sink stays green', () => {
	// The definite-non-consumer pair for the literal rule: the same
	// rel/href keys, but no provable framework head sink, so the object is
	// not policed as a descriptor at all.
	const content = [
		"const head = { links: [{ rel: 'stylesheet', href: 'data:text/css,.x%7Bz-index%3A99%7D' }] };",
	].join('\n');
	assertClean('fixture.tsx', content);
});

test('pair (round 21 I2): a head-consumed descriptor with a non-stylesheet rel stays green', () => {
	const content = [
		"const head = { head: () => ({ links: [{ rel: 'icon', href: 'data:text/plain,x' }] }) };",
	].join('\n');
	assertClean('fixture.tsx', content);
});

test('pair (round 21 I2): an overflowing href on <link rel="icon"> is inert', () => {
	// The reviewer's I2 aside: an overflowing href on a link whose rel is
	// provably `icon` cannot load a stylesheet, so it must stay green —
	// the overflow rule fires only when the rel is not provably free of the
	// `stylesheet` token.
	const flags = [];
	for (let index = 0; index < 20; index += 1) {
		flags.push(`f${index}: boolean`);
	}
	const substitutions = [];
	for (let index = 0; index < 20; index += 1) {
		substitutions.push(`\${f${index} ? 'a' : 'b'}`);
	}
	const content = [
		`export const probe = (${flags.join(', ')}) => <link`,
		'  rel="icon"',
		`  href={\`x${substitutions.join('')}y\`}`,
		'/>;',
	].join('\n');
	assertClean('fixture.tsx', content);
});

test('evasion (round 21 I2): an overflowing href on a stylesheet-capable rel still reds', () => {
	// The gating control: rel carries the `stylesheet` token, so the
	// overflowing href is not inert — the link may point at a raw CSS data
	// URL, and the overflow fails loud.
	const flags = [];
	for (let index = 0; index < 20; index += 1) {
		flags.push(`f${index}: boolean`);
	}
	const substitutions = [];
	for (let index = 0; index < 20; index += 1) {
		substitutions.push(`\${f${index} ? 'a' : 'b'}`);
	}
	const content = [
		`export const probe = (${flags.join(', ')}) => <link`,
		'  rel="icon stylesheet"',
		`  href={\`x${substitutions.join('')}y\`}`,
		'/>;',
	].join('\n');
	assert.deepEqual(
		violationsFor('fixture.tsx', content).map((violation) => violation.ruleId),
		['z-index-static-candidate-overflow'],
		'an overflowing href on a stylesheet-capable rel must fail loud by name',
	);
});

test('raw sinks (round 19 B1): an overflowing registerProperty name candidate space is unresolvable, not unknown', () => {
	// The CSS.registerProperty() name reader used to drop overflow the same
	// way: `nameResult.values` was null on overflow, so the name silently
	// resolved to nothing — but an over-budget static name may be a reserved
	// `--publy-z-*` token. The unresolvable candidate space must fail loud by
	// name (round-19 B1, "every consumer").
	const flags = [];
	for (let index = 0; index < 20; index += 1) {
		flags.push(`f${index}: boolean`);
	}
	const substitutions = [];
	for (let index = 0; index < 20; index += 1) {
		substitutions.push(`\${f${index} ? '--publy-z-' : 'a'}`);
	}
	const content = [
		`export const probe = (${flags.join(', ')}) => CSS.registerProperty({`,
		`  name: \`${substitutions.join('')}\`,`,
		'  inherits: false,',
		'});',
	].join('\n');
	assert.deepEqual(
		violationsFor('fixture.tsx', content).map((violation) => violation.ruleId),
		['z-index-static-candidate-overflow'],
		'an overflowing registerProperty name must fail loud by name',
	);
});

test('raw sinks (round 19 B1): an overflowing setProperty key candidate space is unresolvable, not unknown', () => {
	// The scale-token-write reader (`recordScaleTokenDefinitionCandidates`)
	// used to drop overflow the same way: `.values ?? null` made an over-budget
	// key look like an ordinary unknown. An over-budget static key may write
	// the reserved `--publy-z-*` namespace, so the unresolvable candidate
	// space must fail loud by name (round-19 B1, "every consumer").
	const flags = [];
	for (let index = 0; index < 20; index += 1) {
		flags.push(`f${index}: boolean`);
	}
	const substitutions = [];
	for (let index = 0; index < 20; index += 1) {
		substitutions.push(`\${f${index} ? '--publy-z-' : 'a'}`);
	}
	const content = [
		`export const probe = (${flags.join(', ')}) => element.style.setProperty(\`${substitutions.join('')}\`, '10');`,
	].join('\n');
	assert.deepEqual(
		violationsFor('fixture.tsx', content).map((violation) => violation.ruleId),
		['z-index-static-candidate-overflow'],
		'an overflowing setProperty key must fail loud by name',
	);
});

test('blocker (round 21 B1): an overflowing computed element-access key is unresolvable, not unknown', () => {
	// The review-r20 B1 reproduction. The computed key is a 20-choice static
	// template whose candidate space (2^20 strings of ~23 characters each) is
	// past the work budget, so `staticString` cannot name a member. The
	// pre-fix reader collapsed that "gave up" into an ordinary `null` and the
	// `<style>` consumer printed OK while the page painted the raw value.
	// UNRESOLVED must now fail loud by name — the key is provably static text
	// whose member read may ship raw CSS.
	const decls = [];
	for (let index = 0; index < 20; index += 1) {
		decls.push(`const g${index} = true;`);
	}
	const substitutions = ["${g0 ? 'css' : 'x'}"];
	for (let index = 1; index < 20; index += 1) {
		substitutions.push(`\${g${index} ? 'a' : 'b'}`);
	}
	const content = [
		...decls,
		"const r21Styles: Record<string, string> = { css: '.r21-overflow-key { z-index: 2147483569; }' };",
		`const r21Key = \`x${substitutions.join('')}y\`;`,
		'export const probe = () => <><style>{r21Styles[r21Key]}</style><div className="r21-overflow-key" /></>;',
	].join('\n');
	assert.deepEqual(
		violationsFor('fixture.tsx', content).map((violation) => violation.ruleId),
		['z-index-static-candidate-overflow'],
		'an overflowing computed element-access key must fail loud by name',
	);
});

test('pair (round 21 B1): a resolvable element-access key still reads the member and still reds on raw CSS', () => {
	// The positive control for the B1 fix: an ordinary static key is NOT an
	// overflow, so the member read must behave exactly as before — the raw
	// declaration walks as shipped CSS.
	const content = [
		"const r21Styles: Record<string, string> = { css: '.r21-control { z-index: 2147483569; }' };",
		"const r21Key = 'css';",
		'export const probe = () => <><style>{r21Styles[r21Key]}</style></>;',
	].join('\n');
	assert.deepEqual(
		violationsFor('fixture.tsx', content).map((violation) => violation.ruleId),
		['z-index-style-element-shipped'],
		'a static element-access key must still resolve the raw member',
	);
});

test('pair (round 21 B1): a runtime computed key stays in the declared runtime bucket', () => {
	// The green pair: a genuinely runtime key (a parameter — provably not a
	// static string, not an overflow) resolves no member and stays green,
	// exactly as #987's runtime bucket declares.
	const content = [
		'export const probe = (key: string) => <><style>{styles[key]}</style></>;',
	].join('\n');
	assertClean('fixture.tsx', content);
});

test('evasion (round 21 I1): bracket-spelled setProperty on a style declaration is red', () => {
	// Review-r20 I1's false-negative direction: the pre-fix matcher accepted
	// only `PropertyAccessExpression`, so `element?.style['setProperty'](...)`
	// walked straight past it and COMPUTED_Z became 2147483647 while the guard
	// printed OK. The receiver is the same CSSStyleDeclaration, so the write
	// must red however it is spelled.
	assert.deepEqual(
		violationsFor(
			'fixture.tsx',
			"export const probe = (element: HTMLElement) => element?.style['setProperty']('--publy-z-raised', '2147483647');",
		).map((violation) => violation.ruleId),
		['z-index-scale-token-redefined'],
	);
});

test('pair (round 21 I1): a method merely named setProperty on an unrelated object stays green', () => {
	// Review-r20 I1's false-positive direction: an ordinary metadata recorder
	// whose method is merely *named* setProperty is not a CSSOM write, because
	// its receiver never reaches a CSSStyleDeclaration. The matcher must read
	// the receiver, not the name — both directions are otherwise unstable.
	const content = [
		'const r21MetadataRecorder = { setProperty: (key: string, value: string) => [key, value] };',
		"export const probe = r21MetadataRecorder.setProperty('--publy-z-raised', 'not CSS');",
	].join('\n');
	assertClean('fixture.tsx', content);
});

test('pair (round 21 I1): a plain object .style member is data, not the CSSOM accessor', () => {
	// The same receiver principle one level deeper: `.style` on a provably
	// plain object literal is an ordinary property, never the CSSOM accessor,
	// so its setProperty is not a real write.
	const content = [
		'const r21Recorder = { style: { setProperty: (k: string, v: string) => [k, v] } };',
		"export const probe = r21Recorder.style.setProperty('--publy-z-raised', 'not CSS');",
	].join('\n');
	assertClean('fixture.tsx', content);
});

test('evasion (round 21 I1): an aliased style-declaration receiver is still red', () => {
	// The module-scope const alias spelling: `const s = element.style` then
	// `s.setProperty(...)` reaches the same CSSStyleDeclaration.
	const content = [
		'const r21Style = element.style;',
		"export const probe = () => r21Style.setProperty('--publy-z-raised', '2147483647');",
	].join('\n');
	assert.deepEqual(
		violationsFor('fixture.tsx', content).map((violation) => violation.ruleId),
		['z-index-scale-token-redefined'],
	);
});

test('evasion (round 21 I1): a function-local aliased receiver is still red', () => {
	const content = [
		'export const probe = (element: HTMLElement) => {',
		'	const style = element.style;',
		"	style.setProperty('--publy-z-raised', '2147483647');",
		'};',
	].join('\n');
	assert.deepEqual(
		violationsFor('fixture.tsx', content).map((violation) => violation.ruleId),
		['z-index-scale-token-redefined'],
	);
});

test('pair (round 23 I1): an unbound destructured setProperty never reaches CSSOM', () => {
	// Round-21 asserted the destructured spelling red: `const { setProperty }
	// = element.style` then `setProperty('--publy-z-raised', '2147483647')`.
	// That assertion pinned a binding-pattern descriptor, not a runtime
	// fact — a Web-IDL method called bare raises `TypeError: Illegal
	// invocation` in Chromium (measured; the computed z-index stays `auto`),
	// so the call never reaches CSSOM, and a data object's destructured
	// method writes to that object. The assertion is corrected to match the
	// measured runtime behaviour: the guard stays silent on the unbound
	// spelling (round-23 I1).
	assertClean(
		'fixture.tsx',
		[
			'const { setProperty } = element.style;',
			"export const probe = () => setProperty('--publy-z-raised', '2147483647');",
		].join('\n'),
	);
});

test('evasion (round 23 I1): a bound setProperty alias reaches CSSOM and is not silent', () => {
	// The false-negative direction the round-21 classifier left open: a bound
	// method alias (`element.style.setProperty.bind(element.style)`) is a
	// real CSSOM write — Chromium measured the computed z-index moving to
	// 2147483643 for the same call. The receiver of the eventual write is the
	// bind's `thisArg`, so the alias is policed exactly like the direct
	// spelling (round-23 I1). The `element` global's identity is unprovable,
	// so the receiver is UNRESOLVED; the reserved key makes the write red by
	// name instead of silent.
	const spellings = [
		[
			'const setter = element.style.setProperty.bind(element.style);',
			"export const probe = () => setter('--publy-z-raised', '2147483647');",
		].join('\n'),
		"export const probe = () => element.style.setProperty.bind(element.style)('--publy-z-raised', '2147483647');",
	];
	for (const content of spellings) {
		assert.deepEqual(
			violationsFor('fixture.tsx', content).map(
				(violation) => violation.ruleId,
			),
			['z-index-scale-token-redefined'],
			content,
		);
	}
});

test('pair (round 23 I1): a bound setProperty alias with a non-reserved key fails loud unresolved', () => {
	// The same UNRESOLVED receiver with a provably non-reserved key: the key
	// analysis reports nothing, so the write cannot be waved through — the
	// named cssom-write-unresolved diagnostic carries the case (round-23
	// B1/I1: absence of proof is not proof of absence).
	assert.deepEqual(
		violationsFor(
			'fixture.tsx',
			[
				'const setter = element.style.setProperty.bind(element.style);',
				"export const probe = () => setter('color', 'red');",
			].join('\n'),
		).map((violation) => violation.ruleId),
		['z-index-cssom-write-unresolved'],
	);
});

test('evasion (round 23 I1): a destructured-then-bound setProperty alias is red', () => {
	// The bound spelling restores the write after the unbound destructure:
	// `setProperty.bind(element.style)` sets the Web-IDL `this`, so the call
	// reaches CSSOM exactly like the direct member spelling.
	assert.deepEqual(
		violationsFor(
			'fixture.tsx',
			[
				'const { setProperty } = element.style;',
				'const boundSetter = setProperty.bind(element.style);',
				"export const probe = () => boundSetter('--publy-z-raised', '2147483647');",
			].join('\n'),
		).map((violation) => violation.ruleId),
		['z-index-scale-token-redefined'],
	);
});

test('pair (round 23 I1): a class instance .style member is data, not the CSSOM accessor', () => {
	// The reviewer's I1 false positive: `class Recorder { style = {...} }`
	// then `recorder.style.setProperty(...)` is a data write on an ordinary
	// class instance — `new Recorder()` never yields the DOM accessor — so
	// the guard must stay silent, not redden from the `.style` spelling
	// (round-23 I1).
	assertClean(
		'fixture.tsx',
		[
			'class Recorder {',
			'	style = { setProperty: (key: string, value: string) => [key, value] };',
			'}',
			'const recorder = new Recorder();',
			"export const probe = recorder.style.setProperty('--publy-z-raised', 'not CSS');",
		].join('\n'),
	);
});

test('evasion (round 23 I1): a CSSStyleDeclaration-typed parameter receiver is provably CSSOM', () => {
	// A type annotation is a static fact of the source: a parameter typed
	// `CSSStyleDeclaration` is the accessor itself, so its setProperty write
	// reds exactly like the direct member spelling (round-23 I1).
	assert.deepEqual(
		violationsFor(
			'fixture.tsx',
			"export const probe = (style: CSSStyleDeclaration) => style.setProperty('--publy-z-raised', '2147483647');",
		).map((violation) => violation.ruleId),
		['z-index-scale-token-redefined'],
	);
});

test('pair (round 23 I1): a DOM-element-typed .style receiver with a benign key stays green', () => {
	// The provable-CSSOM direction must not redden legitimate writes: a
	// parameter typed `HTMLElement` carries the real accessor under `.style`,
	// and a non-reserved key is not a scale-token write — green (round-23
	// I1). The unannotated-parameter spelling of the same call cannot prove
	// the accessor identity and fails loud instead.
	assertClean(
		'fixture.tsx',
		"export const probe = (element: HTMLElement) => element.style.setProperty('color', 'red');",
	);
	assert.deepEqual(
		violationsFor(
			'fixture.tsx',
			"export const probe = (element) => element.style.setProperty('color', 'red');",
		).map((violation) => violation.ruleId),
		['z-index-cssom-write-unresolved'],
	);
});

test('evasion (round 23 I1): an unresolvable receiver is UNRESOLVED, not a benign default', () => {
	// Round-21 stayed green on `(handle: unknown) =>
	// handle.setProperty('--publy-z-raised', ...)` — the receiver's identity
	// could not be tied to a `.style` accessor, so the call was waved
	// through. Round-23's rule is that absence of proof is not proof of
	// absence: a parameter without a DOM/CSSOM annotation is exactly the
	// identity the guard cannot prove either way, so the reserved-key write
	// reds by name, and a non-reserved key on the same unprovable receiver
	// fails loud with the named unresolved diagnostic instead of staying
	// green (round-23 I1).
	assert.deepEqual(
		violationsFor(
			'fixture.tsx',
			"export const probe = (handle: unknown) => handle.setProperty('--publy-z-raised', '2147483647');",
		).map((violation) => violation.ruleId),
		['z-index-scale-token-redefined'],
	);
	assert.deepEqual(
		violationsFor(
			'fixture.tsx',
			"export const probe = (handle: unknown) => handle.setProperty('color', 'red');",
		).map((violation) => violation.ruleId),
		['z-index-cssom-write-unresolved'],
	);
});

test('evasion: script cannot register a reserved scale token', () => {
	for (const content of [
		"CSS.registerProperty({ name: '--publy-z-raised', syntax: '<integer>', inherits: false, initialValue: '2147483647' });",
		[
			"const TOKEN = '--publy-z-raised';",
			"CSS.registerProperty({ name: TOKEN, syntax: '<integer>', inherits: false, initialValue: '2147483647' });",
		].join('\n'),
		[
			"const name = '--publy-z-raised';",
			"CSS.registerProperty({ name, inherits: false, initialValue: '2147483647' });",
		].join('\n'),
		"globalThis.CSS.registerProperty({ name: '--publy-z-raised' as const, inherits: false, initialValue: '2147483647' });",
		"window.CSS.registerProperty({ name: '--publy-z-raised', inherits: false, initialValue: '2147483647' });",
		"self.CSS.registerProperty({ name: '--publy-z-raised', inherits: false, initialValue: '2147483647' });",
		"(CSS).registerProperty({ name: '--publy-z-raised', inherits: false });",
		"(CSS.registerProperty)({ name: '--publy-z-raised', inherits: false });",
		"CSS['registerProperty']({ name: '--publy-z-raised', inherits: false });",
		"globalThis['CSS']['registerProperty']({ name: '--publy-z-raised', inherits: false });",
	]) {
		assert.deepEqual(
			violationsFor('fixture.ts', content).map((violation) => violation.ruleId),
			['z-index-scale-token-registered'],
			content,
		);
	}
	assert.deepEqual(
		violationsFor(
			'fixture.mts',
			"CSS.registerProperty({ name: '--publy-z-raised', inherits: false });",
		).map((violation) => violation.ruleId),
		['z-index-scale-token-registered'],
	);
});

test('innocent: JSX links without a literal stylesheet destination stay clean', () => {
	for (const content of [
		'<link rel="preload" as="style" href="/theme.css" />',
		'<link rel="canonical" href="/" />',
		'<link rel="stylesheet" href={stylesheetHref} />',
		'<Link rel="stylesheet" href="/route" />',
		"const head = { links: [{ rel: 'stylesheet', href: appCss }] };",
		[
			'const CSS = { registerProperty() {} };',
			"CSS.registerProperty({ name: '--publy-z-raised', inherits: false });",
		].join('\n'),
		[
			"const rel = 'stylesheet';",
			"const href = 'https://cdn.example/theme.css';",
			'const descriptor = (rel) => ({ rel, href });',
		].join('\n'),
		[
			"const name = '--publy-z-raised';",
			'const register = (name) => CSS.registerProperty({ name });',
		].join('\n'),
		[
			"const rel = 'stylesheet';",
			"const href = 'https://cdn.example/theme.css';",
			"function descriptor() { if (condition) { var rel = 'preload'; } return { rel, href }; }",
		].join('\n'),
		[
			"const rel = 'stylesheet';",
			"const href = 'https://cdn.example/theme.css';",
			"switch (kind) { case 'preload': const rel = 'preload'; use({ rel, href }); }",
		].join('\n'),
	]) {
		assertClean('fixture.tsx', content);
	}
	assertClean(
		'fixture.jsx',
		'<link rel="preload" as="style" href="/theme.css" />',
	);
});

test('evasion: JSX extensions use a JSX parser', () => {
	assert.deepEqual(
		violationsFor(
			'fixture.jsx',
			'<link rel="stylesheet" href="https://cdn.example/theme.css" />',
		).map((violation) => violation.ruleId),
		['z-index-opaque-stylesheet-link'],
	);
});

test('innocent: custom class with -z- mid-token is not a z-index assembly', () => {
	assertClean(
		'fixture.tsx',
		'const view = <div className={`foo-z-${suffix}`} />;',
	);
	assertClean(
		'fixture.tsx',
		'const view = <div className={`grid-cols-${count}`} />;',
	);
});

// ---------------------------------------------------------------------------
// Innocent constructs — source-component green, honestly scoped. Component 1
// suppresses these positions; the end-to-end test at the bottom proves what
// actually ships through the production scanner (the z-50 literals DO emit a
// `.z-50` rule; only z-auto and the CSS-selector case are green end to end).
// ---------------------------------------------------------------------------
test('innocent (source level): type literal in a .d.ts and interface member', () => {
	assertClean('types.d.ts', "type Layer = 'z-50';");
	assertClean(
		'types.ts',
		"type Layer = 'z-50';\ninterface Foo { layer: 'z-50'; }",
	);
});

test('innocent (source level): non-class JSX attributes', () => {
	assertClean('fixture.tsx', '<div data-example="z-50" aria-label="z-50" />');
});

test('innocent (source level): comparand that can never reach className', () => {
	assertClean(
		'fixture.tsx',
		"const view = <div className={kind === 'z-50' ? 'active' : 'idle'} />;",
	);
	assertClean('fixture.ts', 'export const a = kind !== `z-50`;');
});

test('innocent (source level): CSS attribute-selector value', () => {
	assertClean('fixture.css', '[data-example=".z-50"] { color: red; }');
	assertClean('fixture.css', '[data-example="z-50"] { color: red; }');
});

test('innocent (source level): z-auto is a legitimate non-stacking reset', () => {
	assertClean('fixture.tsx', '<div className="z-auto" />');
	assertClean('fixture.css', '.x { @apply z-auto; }');
});

test('innocent (source level): z-fragment template outside a delivery position', () => {
	assertClean('fixture.tsx', 'const x = <div data-tip={`z-${level}`} />;');
});

test('innocent (source level): production-candidate membership suppresses non-production candidates', () => {
	// `getCandidatesWithPositions` (content mode) is a superset of the disk-mode
	// `scanner.scan()` set the production compiler recognises. The membership
	// filter is a false-positive suppressor — removing it makes the guard
	// stricter, never greener — and this pins its mechanism.
	const content = 'export const view = <div className="z-50" />;';
	assert.deepEqual(
		violationsFor('fixture.tsx', content).map((violation) => violation.ruleId),
		['z-index-utility-not-on-scale'],
	);
	assert.deepEqual(
		scanZIndexFile({
			scanner,
			relativePath: 'fixture.tsx',
			content,
			productionCandidates: new Set([]),
		}),
		[],
	);
	assert.deepEqual(
		scanZIndexFile({
			scanner,
			relativePath: 'fixture.tsx',
			content,
			productionCandidates: new Set(['z-50']),
		}).map((violation) => violation.ruleId),
		['z-index-utility-not-on-scale'],
	);
});

test('innocent (source level): class templates without a z fragment', () => {
	assertClean(
		'fixture.tsx',
		'const view = <div className={`px-${size} mt-${margin}`} />;',
	);
});

// ---------------------------------------------------------------------------
// Comment stripping is string-aware and position-preserving.
// ---------------------------------------------------------------------------
test('stripComments: removes comments but not strings or templates', () => {
	assert.equal(
		stripComments('const a = 1; // z-50\nconst b = 2;'),
		'const a = 1;        \nconst b = 2;',
	);
	assert.equal(stripComments('const s = "z-50";'), 'const s = "z-50";');
	assert.equal(
		stripComments('const t = `z-50 ${x}`;'),
		'const t = `z-50 ${x}`;',
	);
	assert.equal(
		stripComments('const u = "https://x/z-50";'),
		'const u = "https://x/z-50";',
	);
	assert.equal(
		stripComments('/* z-50 */ const c = 3;'),
		'           const c = 3;',
	);
	assert.equal(
		stripComments('const a = `${x // z-50\n}`;'),
		`const a = \`\${x${' '.repeat(1 + '// z-50'.length)}\n}\`;`,
	);
});

// ---------------------------------------------------------------------------
// Compiled-CSS gate — parsed declarations, canonicalised properties, normalised
// !important, selector-bound allowlist.
// ---------------------------------------------------------------------------
test('compiled-CSS gate: scale-routed, inert, and important-spelled declarations pass', () => {
	const css = [
		'.a { z-index: var(--publy-z-menu); }',
		'.b { z-index: var(--publy-z-raised); }',
		'.c { z-index: auto; }',
		'.d { z-index: var(--publy-z-raised) !important; }',
		'.e { z-index: var(--publy-z-raised) ! IMPORTANT; }',
		'.f { z-index: var(--publy-z-raised)!important; }',
		':root { --publy-z-menu: 100; }',
	].join('\n');
	assert.deepEqual(checkCompiledCssZIndex(css), []);
});

test('compiled-CSS gate: unknown scale token references are not on the canonical scale', () => {
	const violations = checkCompiledCssZIndex(
		'.probe { z-index: var(--publy-z-not-declared); }',
		KNOWN_RAW_Z_INDEX_DECLARATIONS,
		'fixture.css',
		{ canonicalScaleTokens: new Set(['--publy-z-raised']) },
	);
	assert.deepEqual(
		violations.map(({ ruleId, source }) => ({ ruleId, source })),
		[
			{
				ruleId: 'z-index-declaration-not-on-scale',
				source: 'z-index: var(--publy-z-not-declared)',
			},
		],
	);
});

test('compiled-CSS gate (round 2): omitted canonical set fails closed for tokens and declarations', () => {
	const undeclaredDeclaration = checkCompiledCssZIndex(
		'.probe { z-index: var(--publy-z-not-declared); }',
	);
	assert.deepEqual(
		undeclaredDeclaration.map(({ ruleId, source }) => ({ ruleId, source })),
		[
			{
				ruleId: 'z-index-declaration-not-on-scale',
				source: 'z-index: var(--publy-z-not-declared)',
			},
		],
	);
	assert.deepEqual(
		checkCompiledCssZIndex('.probe { z-index: var(--publy-z-raised); }'),
		[],
	);

	const undeclaredDefinition = checkCompiledCssZIndex(
		'@layer theme { :root,:host { --publy-z-not-declared: 2147483647; } }',
		KNOWN_RAW_Z_INDEX_DECLARATIONS,
		'fixture.css',
		{ emitted: true },
	);
	assert.deepEqual(
		undeclaredDefinition.map(({ ruleId, source }) => ({ ruleId, source })),
		[
			{
				ruleId: 'z-index-scale-token-unowned',
				source: '--publy-z-not-declared: 2147483647',
			},
		],
	);
	assert.deepEqual(
		checkCompiledCssZIndex(
			'@layer theme { :root,:host { --publy-z-raised: 10; } }',
			KNOWN_RAW_Z_INDEX_DECLARATIONS,
			'fixture.css',
			{ emitted: true },
		),
		[],
	);
});

test('source scan (round 2): static style payload uses the fail-closed canonical fallback', () => {
	const red = violationsFor(
		'fixture.tsx',
		"export const probe = <style>{'.probe { z-index: var(--publy-z-not-declared); }'}</style>;",
	);
	assert.deepEqual(
		red.map(({ ruleId }) => ruleId),
		['z-index-style-element-shipped'],
		`undeclared static style token must red: ${JSON.stringify(red)}`,
	);
	assertClean(
		'fixture.tsx',
		"export const probe = <style>{'.probe { z-index: var(--publy-z-raised); }'}</style>;",
	);
});

test('compiled-CSS gate: raw numeric declarations are flagged', () => {
	const css = '.a { z-index: 50; }\n.b { z-index: 10; }\n.c { z-index: 60; }';
	const violations = checkCompiledCssZIndex(css);
	assert.equal(violations.length, 3);
	assert.ok(
		violations.every(
			(violation) => violation.ruleId === 'z-index-declaration-not-on-scale',
		),
	);
});

const STICKY_HEADER_SELECTOR =
	".publy-data-table thead [data-slot='table-column'], " +
	".publy-data-table thead [data-slot='table-sortable-column-header'], " +
	".publy-data-table thead [data-slot='table-selection-cell']";
// The emitted gate's allowlist entry binds the minified selector that Vite's
// output actually carries (unquoted attribute values, no spaces).
const STICKY_EMITTED_SELECTOR =
	'.publy-data-table thead [data-slot=table-column],' +
	'.publy-data-table thead [data-slot=table-sortable-column-header],' +
	'.publy-data-table thead [data-slot=table-selection-cell]';
const inComponentsLayer = (css: string) => `@layer components { ${css} }`;

test('compiled-CSS gate: allowlist is bound to ancestry, selector, and occurrence count', () => {
	// the one real rule is permitted
	assert.equal(
		checkCompiledCssZIndex(
			inComponentsLayer(`${STICKY_HEADER_SELECTOR} { z-index: 5; }`),
			KNOWN_RAW_Z_INDEX_DECLARATIONS,
		).length,
		0,
	);
	// the same value on any other selector is a violation — including the two
	// reviewer mutations: a generated `.z-5` rule and the `[z-index:5]` shim
	assert.equal(
		checkCompiledCssZIndex(
			'.z-5 { z-index: 5; }',
			KNOWN_RAW_Z_INDEX_DECLARATIONS,
		).length,
		1,
	);
	assert.equal(
		checkCompiledCssZIndex(
			'.\\[z-index\\:5\\] { z-index: 5; }',
			KNOWN_RAW_Z_INDEX_DECLARATIONS,
		).length,
		1,
	);
	assert.equal(
		checkCompiledCssZIndex(
			'.thead { z-index: 5; }',
			KNOWN_RAW_Z_INDEX_DECLARATIONS,
		).length,
		1,
	);
	// a duplicate of the bound rule exceeds the expected occurrence count
	const twice = inComponentsLayer(
		`${STICKY_HEADER_SELECTOR} { z-index: 5; }\n${STICKY_HEADER_SELECTOR} { z-index: 5; }`,
	);
	assert.equal(
		checkCompiledCssZIndex(twice, KNOWN_RAW_Z_INDEX_DECLARATIONS).length,
		1,
	);
	// no allowlist at all still reds the real rule
	assert.equal(
		checkCompiledCssZIndex(
			inComponentsLayer(`${STICKY_HEADER_SELECTOR} { z-index: 5; }`),
			[],
		).length,
		1,
	);
});

test('compiled-CSS gate: property names are canonicalised (case and escapes)', () => {
	// uppercase property is still a z-index declaration
	assert.equal(checkCompiledCssZIndex('.probe { Z-INDEX: 50; }').length, 1);
	// escaped `i` in `z-index` (`\69` is `i`) is still a z-index declaration
	assert.equal(checkCompiledCssZIndex('.probe { z-\\69ndex: 50; }').length, 1);
	// the allowlisted rule is case-insensitive too
	assert.equal(
		checkCompiledCssZIndex(
			inComponentsLayer(`${STICKY_HEADER_SELECTOR} { Z-INDEX: 5; }`),
			KNOWN_RAW_Z_INDEX_DECLARATIONS,
		).length,
		0,
	);
});

test('compiled-CSS gate: only Tailwind exact generated scale selector is accepted', () => {
	const definition = '--publy-z-raised: 10;';
	const generated = `@layer theme { :root, :host { ${definition} } }`;
	assert.deepEqual(checkCompiledCssZIndex(generated), []);
	assert.equal(
		checkCompiledCssZIndex(`@layer theme { :root,:host { ${definition} } }`)
			.length,
		1,
		'authored mode rejects the production-only compact selector',
	);
	for (const selector of [':root, :host', ':root,:host']) {
		assert.deepEqual(
			checkCompiledCssZIndex(
				`@layer theme { ${selector} { ${definition} } }`,
				KNOWN_RAW_Z_INDEX_DECLARATIONS,
				'fixture.css',
				{ emitted: true },
			),
			[],
			`emitted selector ${selector}`,
		);
	}
	for (const css of [
		`@layer theme { :host,:root { ${definition} } }`,
		`@layer components { :root,:host { ${definition} } }`,
		`@media (min-width: 1px) { @layer theme { :root,:host { ${definition} } } }`,
		`:root,:host { ${definition} }`,
	]) {
		assert.equal(
			checkCompiledCssZIndex(
				css,
				KNOWN_RAW_Z_INDEX_DECLARATIONS,
				'fixture.css',
				{ emitted: true },
			).length,
			1,
			css,
		);
	}
});

test('compiled-CSS gate: emitted tiers must belong to the canonical app.css scale', () => {
	const css =
		'@layer theme { :root,:host { --publy-z-dependency-owned: 2147483647; } }';
	assert.deepEqual(
		checkCompiledCssZIndex(css, KNOWN_RAW_Z_INDEX_DECLARATIONS, 'fixture.css', {
			emitted: true,
			canonicalScaleTokens: new Set(['--publy-z-raised', '--publy-z-menu']),
		}).map(({ ruleId, source }) => ({ ruleId, source })),
		[
			{
				ruleId: 'z-index-scale-token-unowned',
				source: '--publy-z-dependency-owned: 2147483647',
			},
		],
	);
});

test('compiled-CSS gate: emitted duplicate scale tier is rejected (cross-asset global counter)', () => {
	// The emitted duplicate branch (`count > 1`) is the sole detector when a
	// dependency re-declares an already-canonical tier in Tailwind's accepted
	// generated form: `canonicalScaleTokens.has()` passes, `isGlobalScaleDefinition`
	// passes, so only the counter reds it. The counter is shared across emitted
	// assets, so a second asset redeclaring the tier must red.
	const canonical = new Set(['--publy-z-raised', '--publy-z-menu']);
	const counts = new Map();
	const first = checkCompiledCssZIndex(
		'@layer theme {:root,:host{--publy-z-raised:10}}',
		KNOWN_RAW_Z_INDEX_DECLARATIONS,
		'dist/first.css',
		{
			emitted: true,
			scaleDefinitionCounts: counts,
			canonicalScaleTokens: canonical,
		},
	);
	assert.deepEqual(first, []);
	const second = checkCompiledCssZIndex(
		'@layer theme {:root,:host{--publy-z-raised:2147483647}}',
		KNOWN_RAW_Z_INDEX_DECLARATIONS,
		'dist/second.css',
		{
			emitted: true,
			scaleDefinitionCounts: counts,
			canonicalScaleTokens: canonical,
		},
	);
	assert.deepEqual(
		second.map(({ ruleId, source }) => ({ ruleId, source })),
		[
			{
				ruleId: 'z-index-scale-token-duplicate',
				source: '--publy-z-raised: 2147483647',
			},
		],
	);
	// two distinct tiers in one asset are fine
	assert.deepEqual(
		checkCompiledCssZIndex(
			'@layer theme {:root,:host{--publy-z-raised:10}}\n' +
				'@layer theme {:root,:host{--publy-z-menu:100}}',
			KNOWN_RAW_Z_INDEX_DECLARATIONS,
			'dist/third.css',
			{ emitted: true, canonicalScaleTokens: canonical },
		),
		[],
	);
});

test('compiled-CSS gate: escaped important identifier is decoded before comparison', () => {
	// PostCSS strips a plain `!important` into `decl.important`, so the guard's
	// `stripImportant` only fires on spellings the parser leaves in the value —
	// the escaped `!\69mportant` form. Green when the value is a scale route,
	// red when the underlying value is raw.
	assert.equal(
		checkCompiledCssZIndex(
			'.a { z-index: var(--publy-z-raised) !\\69mportant; }',
		).length,
		0,
	);
	assert.equal(
		checkCompiledCssZIndex('.b { z-index: 50 !\\69mportant; }').length,
		1,
	);
	assert.equal(
		checkCompiledCssZIndex('.c { z-index: 50 !\\69MPORTANT; }').length,
		1,
	);
});

test('compiled-CSS gate: allowlist occurrence count is global across assets', () => {
	const shared = new Map();
	const sticky = inComponentsLayer(`${STICKY_HEADER_SELECTOR} { z-index: 5; }`);
	assert.equal(
		checkCompiledCssZIndex(
			sticky,
			KNOWN_RAW_Z_INDEX_DECLARATIONS,
			'dist/a.css',
			{
				allowlistCounts: shared,
			},
		).length,
		0,
	);
	// the same bound rule in a *second* asset exceeds the global count of 1
	const second = checkCompiledCssZIndex(
		sticky,
		KNOWN_RAW_Z_INDEX_DECLARATIONS,
		'dist/b.css',
		{ allowlistCounts: shared },
	);
	assert.deepEqual(
		second.map((violation) => violation.ruleId),
		['z-index-declaration-not-on-scale'],
	);
});

test('e2e (round 7 M2): runZIndexGuard threads one allowlist counter through all emitted assets', async () => {
	// The unit test above pins the *parameter*; this pins the wiring: one
	// bound allowlist occurrence is green, the same rule in a second emitted
	// asset reds because runZIndexGuard passes the same Map to every asset.
	// The emitted gate's allowlist binds the minified selector form, so the
	// override must use it.
	const sticky = inComponentsLayer(
		`${STICKY_EMITTED_SELECTOR} { z-index: 5; }`,
	);
	const single = await runFixtureGuard(
		{ 'probe.ts': `export const probe = 'probe';` },
		'',
		[],
		[{ file: 'a.css', content: sticky }],
	);
	assert.deepEqual(
		single.violations,
		[],
		`one allowlisted asset must stay green: ${JSON.stringify(single.violations)}`,
	);
	const duplicated = await runFixtureGuard(
		{ 'probe.ts': `export const probe = 'probe';` },
		'',
		[],
		[
			{ file: 'a.css', content: sticky },
			{ file: 'b.css', content: sticky },
		],
	);
	assert.ok(
		duplicated.violations.some(
			(violation) =>
				violation.ruleId === 'z-index-declaration-not-on-scale' &&
				violation.file === 'dist/b.css',
		),
		`a duplicated bound rule across assets must red: ${JSON.stringify(duplicated.violations)}`,
	);
});

test('e2e (round 7 M3): emitted CSS assets are collected case-insensitively', async () => {
	// `collectCssPaths` folds `.css` names to ASCII lowercase, so an emitted
	// asset with an uppercase extension cannot skip the compiled gate. A
	// clean lowercase asset sits beside `FIXTURE.CSS` so the case-folding
	// mutation fails THIS assertion (the uppercase violation is missing)
	// instead of the empty-output gate (no assets found at all).
	const { violations } = await runFixtureGuard(
		{ 'probe.ts': `export const probe = 'probe';` },
		'',
		[],
		[
			{ file: 'FIXTURE.CSS', content: '.probe { z-index: 2147483641; }' },
			{ file: 'fixture-clean.css', content: '.clean { color: red; }' },
		],
	);
	assert.ok(
		violations.some(
			(violation) =>
				violation.ruleId === 'z-index-declaration-not-on-scale' &&
				violation.file === 'dist/FIXTURE.CSS',
		),
		`an uppercase .CSS asset must be scanned: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 7 M3): productionBuild must return array-valued inline/raw path sets', async () => {
	for (const [field, badValue] of [
		['inlineCssPaths', 'nope'],
		['rawTextPaths', 'nope'],
	]) {
		await assert.rejects(
			runFixtureGuard(
				{ 'probe.ts': `export const probe = 'probe';` },
				'',
				[],
				null,
				async (root) => ({
					emittedCssRoot: root,
					authoredCssPaths: [path.join(root, 'app.css')],
					authoredScriptPaths: [path.join(root, 'src/main.ts')],
					[field]: badValue,
				}),
			),
			/productionBuild must return the exact emittedCssRoot/,
			`a malformed ${field} must fail the contract check`,
		);
	}
});

test('CSS gates: @property cannot register a reserved scale token', () => {
	const registration = [
		'@property --publy-z-raised {',
		"  syntax: '<integer>';",
		'  inherits: false;',
		'  initial-value: 2147483647;',
		'}',
	].join('\n');
	const expected = [
		{
			ruleId: 'z-index-scale-token-registered',
			source: '@property --publy-z-raised',
		},
	];
	for (const emitted of [false, true]) {
		assert.deepEqual(
			checkCompiledCssZIndex(
				registration,
				KNOWN_RAW_Z_INDEX_DECLARATIONS,
				'fixture.css',
				{ emitted },
			).map(({ ruleId, source }) => ({ ruleId, source })),
			expected,
		);
	}
	assert.deepEqual(
		checkAuthoredCssScaleDefinitions({
			css: registration,
			relativePath: 'src/fixture.css',
			isCanonicalAppCss: false,
		}).map(({ ruleId, source }) => ({ ruleId, source })),
		expected,
	);
});

test('CSS gates: non-registering at-rule params may reference the scale', () => {
	const references = [
		'@supports (z-index: var(--publy-z-raised)) {',
		'  .supports-probe { z-index: var(--publy-z-raised); }',
		'}',
		'@container style(--publy-z-raised: 10) {',
		'  .container-probe { z-index: var(--publy-z-raised); }',
		'}',
		'@keyframes --publy-z-raised { from { opacity: 0; } to { opacity: 1; } }',
	].join('\n');
	assert.deepEqual(checkCompiledCssZIndex(references), []);
	assert.deepEqual(
		checkAuthoredCssScaleDefinitions({
			css: references,
			relativePath: 'src/fixture.css',
			isCanonicalAppCss: false,
		}),
		[],
	);
});

// ---------------------------------------------------------------------------
// End-to-end through the production scanner — isolated fixture trees whose
// throwaway `src/` is compiled exactly as production compiles `apps/front/src`.
// ---------------------------------------------------------------------------
test('e2e (round 4 blocker 1): component-imported raw CSS is red in the emitted asset', async () => {
	const { violations, emittedCssAssets } = await runFixtureGuard(
		{
			'component.ts': `import './evil.css';\nexport const component = 'probe';`,
			'evil.css': '.evil { z-index: 993; }',
		},
		'',
		[
			`import { component } from './component';`,
			`document.body.dataset.fixture = component;`,
		],
	);
	assert.ok(
		emittedCssAssets.some((asset) => asset.content.includes('z-index:993')),
		`fixture must emit the raw declaration: ${JSON.stringify(emittedCssAssets)}`,
	);
	assert.deepEqual(
		violations.map((violation) => violation.source),
		['z-index: 993'],
		`component-imported CSS must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 4 blocker 2): residual data-URL imports fail closed', async () => {
	const dataImport =
		'@import url("data:text/css,.evil%7Bposition%3Arelative%3Bz-index%3A997%7D");';
	const { violations, emittedCssAssets } = await runFixtureGuard(
		{ 'probe.ts': `export const probe = 'probe';` },
		'',
		[],
		dataImport,
	);
	assert.ok(
		emittedCssAssets.some((asset) => asset.content.includes('data:text/css')),
		`fixture must retain the opaque import: ${JSON.stringify(emittedCssAssets)}`,
	);
	assert.deepEqual(
		violations.map((violation) => violation.source),
		[dataImport],
		`residual imports must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 4 blocker 2): resolved local relative imports stay clean', async () => {
	const { violations, emittedCssAssets } = await runFixtureGuard(
		{
			'component.ts': `import './parent.css';\nexport const component = 'probe';`,
			'parent.css': `@import './child.css';\n.parent { color: red; }`,
			'child.css': `.child { color: blue; }`,
		},
		'',
		[
			`import { component } from './component';`,
			`document.body.dataset.fixture = component;`,
		],
	);
	assert.ok(
		emittedCssAssets.some(
			(asset) =>
				asset.content.includes('.parent') && asset.content.includes('.child'),
		),
		`fixture must inline both local files: ${JSON.stringify(emittedCssAssets)}`,
	);
	assert.deepEqual(
		violations,
		[],
		`resolved local imports must stay clean: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 5 provenance): nested CSS imports retain authored filenames', async () => {
	const { violations } = await runFixtureGuard(
		{
			'component.ts': `import './parent.css';\nexport const component = 'probe';`,
			'parent.css': `@import './child.css';\n.parent { color: red; }`,
			'child.css':
				'.shadow { --publy-z-raised: 999; z-index: var(--publy-z-raised); }',
		},
		'',
		[
			`import { component } from './component';`,
			`document.body.dataset.fixture = component;`,
		],
	);
	assert.ok(
		violations.some(
			(violation) =>
				violation.file === 'src/child.css' &&
				violation.source === '--publy-z-raised: 999',
		),
		`nested authored provenance must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 5 blocker 2): scans the fresh build result instead of stale dist', async () => {
	const { violations, emittedCssAssets } = await runFixtureGuard(
		{ 'probe.ts': `export const probe = 'probe';` },
		'',
		[],
		null,
		async (root) => {
			const staleRoot = path.join(root, 'dist');
			const freshRoot = path.join(root, 'dist-r5-other');
			await mkdir(staleRoot, { recursive: true });
			await mkdir(freshRoot, { recursive: true });
			await writeFile(
				path.join(staleRoot, 'stale.css'),
				'.stale { z-index: var(--publy-z-raised); }',
			);
			await writeFile(
				path.join(freshRoot, 'fresh.css'),
				'.fresh { z-index: 987654321; }',
			);
			return {
				emittedCssRoot: freshRoot,
				authoredCssPaths: [path.join(root, 'app.css')],
				authoredScriptPaths: [path.join(root, 'src/main.ts')],
				cleanup: async () => {},
			};
		},
	);
	assert.ok(
		emittedCssAssets.some((asset) => asset.path.includes('dist-r5-other')),
		`must inspect this invocation's output: ${JSON.stringify(emittedCssAssets)}`,
	);
	assert.deepEqual(
		violations.map((violation) => violation.source),
		['z-index: 987654321'],
	);
});

test('e2e (round 5 blocker 2): guard-owned output overrides configured Vite outDir', async () => {
	const root = await mkdtemp(path.join(scriptsDir, 'zindex-outdir-'));
	let buildResult;
	try {
		await writeFile(
			path.join(root, 'index.html'),
			'<script type="module" src="/main.js"></script>',
		);
		await writeFile(path.join(root, 'main.js'), "import './probe.css';");
		await writeFile(
			path.join(root, 'probe.css'),
			'.probe { z-index: 987654321; }',
		);
		await writeFile(
			path.join(root, 'vite.config.mjs'),
			"export default { build: { outDir: 'dist-r5-configured' } };",
		);

		buildResult = await buildProductionApp(root);
		assert.ok(
			!buildResult.emittedCssRoot.startsWith(root),
			`output must be guard-owned: ${buildResult.emittedCssRoot}`,
		);
		assert.ok(
			!(await readdir(root)).includes('dist-r5-configured'),
			'configured output directory must not receive this build',
		);
		const emittedFiles = await readdir(buildResult.emittedCssRoot, {
			recursive: true,
		});
		const cssFile = emittedFiles.find((file) => file.endsWith('.css'));
		assert.ok(cssFile != null, 'controlled build must emit CSS');
		const emittedCss = await readFile(
			path.join(buildResult.emittedCssRoot, cssFile),
			'utf8',
		);
		assert.match(emittedCss, /z-index:987654321/);
	} finally {
		await buildResult?.cleanup?.();
		await rm(root, { recursive: true, force: true });
	}
});

test('production-build contract failures still run supplied cleanup', async () => {
	let cleaned = false;
	await assert.rejects(
		runFixtureGuard(
			{ 'probe.ts': `export const probe = 'probe';` },
			'',
			[],
			null,
			async () =>
				({
					cleanup: async () => {
						cleaned = true;
					},
				}) as unknown as ProductionBuildResult,
		),
		/productionBuild must return the exact emittedCssRoot/,
	);
	assert.equal(cleaned, true);
});

test('round 6 M3: an interrupted guard run removes the private build directory', async () => {
	// The `finally` cleanup cannot run when the process is killed, so the CLI
	// installs SIGINT/SIGTERM handlers that remove the live temp dir before
	// exiting. Spawn the real CLI, wait for its private build dir to appear,
	// interrupt it, and assert the dir is gone. Sweep stale dirs first so a
	// previous interrupted run cannot be mistaken for this one.
	for (const stale of (await readdir(tmpdir())).filter((name) =>
		name.startsWith('publy-zindex-guard-'),
	)) {
		await rm(path.join(tmpdir(), stale), { recursive: true, force: true });
	}
	const scriptPath = path.join(scriptsDir, 'check-zindex-guard.mts');
	const child = spawn(process.execPath, [scriptPath], {
		cwd: path.join(scriptsDir, '..'),
		stdio: 'ignore',
	});
	let created: string[] = [];
	const startedAt = Date.now();
	while (Date.now() - startedAt < 20000) {
		created = (await readdir(tmpdir())).filter((name) =>
			name.startsWith('publy-zindex-guard-'),
		);
		if (created.length > 0) {
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	assert.ok(
		created.length > 0,
		'expected the guard to create a private build dir',
	);
	child.kill('SIGINT');
	await new Promise((resolve) => child.once('exit', resolve));
	let remaining = created;
	const sweptAt = Date.now();
	while (remaining.length > 0 && Date.now() - sweptAt < 10000) {
		await new Promise((resolve) => setTimeout(resolve, 100));
		remaining = (await readdir(tmpdir())).filter((name) =>
			name.startsWith('publy-zindex-guard-'),
		);
	}
	assert.deepEqual(remaining, []);
});

test('e2e (round 5 important 2): unimported CSS samples stay green', async () => {
	const { violations, emittedCssAssets } = await runFixtureGuard({
		'probe.ts': `export const probe = 'probe';`,
		'unshipped-sample.css': '.sample { --publy-z-sample-only: 999; }',
	});
	assert.ok(
		emittedCssAssets.every(
			(asset) => !asset.content.includes('--publy-z-sample-only'),
		),
		`sample must not ship: ${JSON.stringify(emittedCssAssets)}`,
	);
	assert.deepEqual(violations, []);
});

test('e2e (round 5 audit): unimported script link samples stay green', async () => {
	const { violations } = await runFixtureGuard({
		'probe.ts': `export const probe = 'probe';`,
		'unshipped-link-sample.tsx': [
			"export const sample = { links: [{ rel: 'stylesheet', href: 'data:text/css,.x%7Bz-index%3A99%7D' }] };",
			"CSS.registerProperty({ name: '--publy-z-raised', inherits: false, initialValue: '99' });",
			"const style = { '--publy-z-raised': 998 };",
			"element.style.setProperty('--publy-z-menu', '997');",
		].join('\n'),
	});
	assert.deepEqual(violations, []);
});

test('e2e (round 6 I1): static JSX <style> element shipping raw z-index is red', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx':
				'export const probe = <style>{`.probe { z-index: 2147483647; }`}</style>;',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-style-element-shipped'],
		`static style element must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 6 I1): static <style> with harmless scale-routed CSS stays green', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx':
				'export const probe = <style>{`.probe { z-index: var(--publy-z-raised); }`}</style>;',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(violations, []);
});

test('e2e: static String.raw style payloads are scanned by the real guard', async () => {
	for (const payload of [
		'export const probe = <style>{String.raw`.probe { z-index: 2147483647; }`}</style>;',
		[
			"const level = '2147483646';",
			'export const probe = <style>{String.raw`.probe { z-index: ${level}; }`}</style>;',
		].join('\n'),
	]) {
		const { violations } = await runFixtureGuard({ 'probe.tsx': payload }, '', [
			"import { probe } from './probe';",
		]);
		assert.deepEqual(
			violations.map(({ ruleId }) => ruleId),
			['z-index-style-element-shipped'],
			`static String.raw style payload must red: ${JSON.stringify(violations)}`,
		);
	}
});

test('e2e (round 2): prefixed globals and const aliases of String.raw are scanned', async () => {
	const redSource = [
		'const R = String.raw;',
		'export const probe = <>',
		'<style>{String.raw`.r2-direct { z-index: 2147483647; }`}</style>',
		'<style>{globalThis.String.raw`.r2-global { z-index: 2147483646; }`}</style>',
		'<style>{window.String.raw`.r2-window { z-index: 2147483645; }`}</style>',
		'<style>{self.String.raw`.r2-self { z-index: 2147483644; }`}</style>',
		'<style>{R`.r2-alias { z-index: 2147483643; }`}</style>',
		'</>;',
	].join('\n');
	const { violations: redViolations } = await runFixtureGuard(
		{ 'probe.tsx': redSource },
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		redViolations.map(({ ruleId }) => ruleId),
		Array(5).fill('z-index-style-element-shipped'),
		`prefixed and aliased String.raw payloads must red: ${JSON.stringify(redViolations)}`,
	);

	const greenSource = [
		'const R = String.raw;',
		'export const probe = <>',
		'<style>{String.raw`.r2-direct { z-index: var(--publy-z-raised); }`}</style>',
		'<style>{globalThis.String.raw`.r2-global { z-index: var(--publy-z-raised); }`}</style>',
		'<style>{window.String.raw`.r2-window { z-index: var(--publy-z-raised); }`}</style>',
		'<style>{self.String.raw`.r2-self { z-index: var(--publy-z-raised); }`}</style>',
		'<style>{R`.r2-alias { z-index: var(--publy-z-raised); }`}</style>',
		'</>;',
	].join('\n');
	const { violations: greenViolations } = await runFixtureGuard(
		{ 'probe.tsx': greenSource },
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		greenViolations,
		[],
		`canonical prefixed and aliased String.raw payloads must stay green: ${JSON.stringify(greenViolations)}`,
	);
});

test('e2e (round 2): String.raw scans raw template text, not cooked text', async () => {
	const escapedSource = [
		'export const probe = <style>{String.raw`.r2-escaped { z-ind\\',
		'ex: 9; }`}</style>;',
	].join('\n');
	const { violations: escapedViolations } = await runFixtureGuard(
		{ 'probe.tsx': escapedSource },
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		escapedViolations.filter(
			({ ruleId }) => ruleId === 'z-index-style-element-shipped',
		),
		[],
		`raw-only escaped newline payload must not red as shipped CSS: ${JSON.stringify(escapedViolations)}`,
	);

	const { violations: rawViolations } = await runFixtureGuard(
		{
			'probe.tsx':
				'export const probe = <style>{String.raw`.r2-real { z-index: 2147483647; }`}</style>;',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		rawViolations.map(({ ruleId }) => ruleId),
		['z-index-style-element-shipped'],
		`real raw z-index payload must red: ${JSON.stringify(rawViolations)}`,
	);
});

test('e2e (issue #1120): shadowed String.raw spellings stay in the runtime bucket — fail-closed through the real guard', async () => {
	// PR #1118 taught the guard to recognize String.raw through
	// globalThis/window/self prefixes and module-scope const alias chains,
	// with the nearestBinding shadow check re-applied at every hop. The
	// FAIL-CLOSED side was unpinned: a refactor that drops a shadow check
	// would silently WIDEN recognition — the shadowed spellings below would
	// start reddening raw CSS they must not be treated as — without any
	// test reddening. Each shape runs the REAL guard end to end
	// (`runFixtureGuard` → `runZIndexGuard` over an isolated fixture tree,
	// exactly like the round-2 positive tests above) and pairs the
	// shadowed tag with a genuine String.raw control in the same file: the
	// control keeps the payload walk provably live (the fixture is not
	// green for the wrong reason), and EXACTLY ONE violation means the
	// shadowed tag was classified as NOT String.raw — the declared runtime
	// bucket. Any recognition-widening regression resolves the shadowed
	// tag too, doubling the violations and reddening this assertion.
	//
	// Which check each shape pins (verified empirically — dropping the
	// check reddens the fixture; both mutations were reverted, leaving the
	// guard byte-identical):
	// - every shadowing-binding shape (param, function-scope const,
	//   function-scope let) pins the `nearestBinding` re-check at every
	//   alias hop in `resolveModuleConstFixpoint`: the module-scope
	//   `const R = String.raw` alias EXISTS in the map, and only that
	//   check keeps the shadowed tag in the runtime bucket;
	// - the locally shadowed `String` pins the `nearestBinding(...) ==
	//   null` check in `isDirectGlobalString`: the module-scope `const
	//   String` IS a recorded module const, but the tag is a member read,
	//   so the hop check is never consulted for it.
	// A module-level `let R` (no shadowing binding) is NOT a shape: it is
	// rejected before any check by the NodeFlags.Const gate while the
	// alias map is built, so dropping the hop check cannot redden it. An
	// object-property tag (`tags.raw`) is NOT a shape either:
	// `isStringRawTag` rejects unmatched non-identifier candidates (such
	// as `tags.raw`) at its member branch, so no check the guard contains
	// is ever consulted for them — only a NEW resolution feature (member
	// reads through const object literals) could make them red, and that
	// is out of scope. (Recognized `String.raw` and prefixed globals are
	// also non-identifier candidates, but those are handled, not rejected.)
	const shadowTestCases = [
		[
			'param-shadowed R',
			// The function parameter `R` shadows the module-scope `const R
			// = String.raw` alias. `resolveModuleConstFixpoint` re-applies
			// `nearestBinding` at every hop; dropping that check would
			// resolve the parameter's tag to the module const.
			[
				'const R = String.raw;',
				'export const probe = (R: typeof String.raw) => (',
				'  <>',
				'    <style>{R`.r1120-param-shadow { z-index: 2147483647; }`}</style>',
				'    <style>{String.raw`.r1120-param-control { z-index: 2147483646; }`}</style>',
				'  </>',
				');',
			].join('\n'),
		],
		[
			'function-scope const R',
			// The module-scope `const R = String.raw` alias exists in the
			// map, but the function-scope `const R = String.raw` shadows it
			// at the tag site. The alias-hop `nearestBinding` check must
			// reject the tag (its nearest binding is the inner const, not
			// the module alias); dropping the check would resolve it to the
			// module alias.
			[
				'const R = String.raw;',
				'export const probe = () => {',
				'  const R = String.raw;',
				'  return (',
				'    <>',
				'      <style>{R`.r1120-fn-shadow { z-index: 2147483645; }`}</style>',
				'      <style>{String.raw`.r1120-fn-control { z-index: 2147483644; }`}</style>',
				'    </>',
				'  );',
				'};',
			].join('\n'),
		],
		[
			'function-scope let R',
			// Same shadow shape with a `let`-declared shadowing binding:
			// the module-scope `const R = String.raw` alias exists, but the
			// function-scope `let R = String.raw` shadows it at the tag
			// site. A reassignable binding is a shadow like any other, so
			// the alias-hop `nearestBinding` check must reject the tag;
			// dropping the check would resolve it to the module alias. (A
			// module-level `let R` never reaches this check — the alias map
			// excludes non-const declarations at build time — so it would
			// pin nothing; the shadowed spelling is the shape that
			// exercises the mechanism.)
			[
				'const R = String.raw;',
				'export const probe = () => {',
				'  let R = String.raw;',
				'  return (',
				'    <>',
				'      <style>{R`.r1120-let-shadow { z-index: 2147483643; }`}</style>',
				'      <style>{String.raw`.r1120-let-control { z-index: 2147483642; }`}</style>',
				'    </>',
				'  );',
				'};',
			].join('\n'),
		],
		[
			'locally shadowed String',
			// A module-scope `const String` shadows the global; only the
			// unshadowed spelling counts as a raw-tag owner. Dropping the
			// `nearestBinding(...) == null` check in `isDirectGlobalString`
			// would treat the local binding as the global — the control
			// spells the real global through `globalThis.String.raw`,
			// because bare `String.raw` IS the shadowed binding here.
			[
				'const String = { raw: (strings: TemplateStringsArray) => strings.join("") };',
				'export const probe = (',
				'  <>',
				'    <style>{String.raw`.r1120-string-shadow { z-index: 2147483641; }`}</style>',
				'    <style>{globalThis.String.raw`.r1120-string-control { z-index: 2147483640; }`}</style>',
				'  </>',
				');',
			].join('\n'),
		],
	];
	for (const [name, content] of shadowTestCases) {
		const { violations } = await runFixtureGuard({ 'probe.tsx': content }, '', [
			"import { probe } from './probe';",
		]);
		assert.deepEqual(
			violations.map(({ ruleId }) => ruleId),
			['z-index-style-element-shipped'],
			`${name}: the shadowed tag must stay in the runtime bucket while the control reds: ${JSON.stringify(violations)}`,
		);
		assert.match(
			violations[0]?.source ?? '',
			/-control/,
			`${name}: the single red must come from the control tag, not the shadowed one: ${JSON.stringify(violations)}`,
		);
	}
});

test('e2e (round 6 I1): ?inline CSS ships as JS and is red via the authored inline walk', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import overlayCss from './overlay.css?inline';`,
				`export const probe = <style>{overlayCss}</style>;`,
			].join('\n'),
			'overlay.css': '.overlay { z-index: 2147483647; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.ok(
		violations.some(
			(violation) =>
				violation.ruleId === 'z-index-declaration-not-on-scale' &&
				violation.file === 'src/overlay.css',
		),
		`inline-shipped CSS must red at its authored file: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 7 I2): ?inline on every Vite CSS language extension is red', async () => {
	// The provenance gate uses Vite's own CSS-language set (`isCSSRequest`),
	// so `.pcss` and `.postcss` — first-class CSS with no preprocessor
	// dependency — cannot smuggle an inline payload past the walk.
	for (const extension of ['pcss', 'postcss']) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': [
					`import overlayCss from './overlay.${extension}?inline';`,
					`export const probe = <style>{overlayCss}</style>;`,
				].join('\n'),
				[`overlay.${extension}`]: '.overlay { z-index: 2147483646; }',
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.ok(
			violations.some(
				(violation) =>
					violation.ruleId === 'z-index-declaration-not-on-scale' &&
					violation.file === `src/overlay.${extension}`,
			),
			`${extension}?inline must red at its authored file: ${JSON.stringify(violations)}`,
		);
	}
	// `.sss` is in Vite's CSS-language set but its preprocessor (`sugarss`) is
	// not installed here, so the import fails the build — fail-closed, and the
	// `isCSSRequest` recording already covers the language if it ever ships.
	await assert.rejects(
		runFixtureGuard(
			{
				'probe.tsx': [
					`import overlayCss from './overlay.sss?inline';`,
					`export const probe = <style>{overlayCss}</style>;`,
				].join('\n'),
				'overlay.sss': '.overlay { z-index: 2147483646; }',
			},
			'',
			["import { probe } from './probe';"],
		),
		/Preprocessor dependency "sugarss" not found/,
	);
});
test('e2e (round 7 I2): ?raw on a non-CSS file holding CSS text is red', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawCss from './overlay.txt?raw';`,
				`export const probe = <style>{rawCss}</style>;`,
			].join('\n'),
			'overlay.txt': '.overlay { z-index: 2147483645; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.ok(
		violations.some(
			(violation) =>
				violation.ruleId === 'z-index-declaration-not-on-scale' &&
				violation.file === 'src/overlay.txt',
		),
		`raw-shipped CSS text must red at its authored file: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 7 I2): ?raw on plain non-CSS text stays green', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import prose from './notes.txt?raw';`,
				`export const probe = <p>{prose}</p>;`,
			].join('\n'),
			'notes.txt': 'plain prose that is not CSS',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations,
		[],
		`non-CSS raw text must stay green: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 8 I3): ?raw CSS-looking text displayed in <pre> stays green', async () => {
	// The imported bytes ARE valid CSS, but the only sink is a text node —
	// the bytes are displayed as escaped text, never shipped as a
	// stylesheet. The guard distinguishes by import binding, not by file
	// contents, so the same bytes in a <style> sink (above) stay red.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import cssCodeSample from './code-sample.txt?raw';`,
				`export const probe = <pre>{cssCodeSample}</pre>;`,
			].join('\n'),
			'code-sample.txt': '.example { z-index: 2147483644; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations,
		[],
		`displayed raw CSS text must stay green: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 8 I2): unparseable browser-valid ?raw CSS in a <style> sink is a named diagnostic', async () => {
	// CSS's legacy top-level `<!--`/`-->` comment tokens are valid for the
	// browser but rejected by PostCSS, so the style-sink walk cannot parse
	// the payload — that is a named diagnostic that fails the guard, never
	// the silent compliant default. Chromium applies the exact payload.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawProbeCss from './raw-probe.txt?raw';`,
				`export const probe = <style>{rawProbeCss}</style>;`,
			].join('\n'),
			'raw-probe.txt':
				'<!-- .publy-r8-raw-probe { position: fixed; z-index: 2147483646; } -->',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map(({ ruleId, file }) => ({ ruleId, file })),
		[{ ruleId: 'z-index-unparseable-static-css', file: 'src/raw-probe.txt' }],
		`unparseable style-sink raw text must be a named diagnostic: ${JSON.stringify(violations)}`,
	);
	assert.match(
		violations[0].message,
		/consumed by a style sink and cannot be parsed as CSS/,
	);
});

test('e2e (round 8 I2/I3): the same unparseable bytes displayed as text stay green', async () => {
	// The paired half of the round-8 I2 fixture: identical imported bytes
	// that red in a <style> sink stay green when the only sink is a text
	// node — the two cases are distinguished by the import binding's sink,
	// never by the bytes themselves.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawProbeText from './raw-probe.txt?raw';`,
				`export const probe = <pre>{rawProbeText}</pre>;`,
			].join('\n'),
			'raw-probe.txt':
				'<!-- .publy-r8-raw-probe { position: fixed; z-index: 2147483646; } -->',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations,
		[],
		`displayed unparseable raw text must stay green: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 11 B2): module-scope const aliases of a raw binding reach a style sink', async () => {
	// Round 10 B2(b): the per-file matcher only fired on the literal import
	// identifier, so a one-line local alias shipped the raw CSS green. The
	// alias (and an alias-of-alias chain) is the same binding, resolved
	// through the module-scope const map with the shadowing check intact.
	for (const [name, aliasLines, sink] of [
		['alias', ['const aliased = rawCss;'], 'aliased'],
		['chain', ['const first = rawCss;', 'const second = first;'], 'second'],
	]) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': [
					`import rawCss from './overlay.txt?raw';`,
					...aliasLines,
					`export const probe = <style>{${sink}}</style>;`,
				].join('\n'),
				'overlay.txt': '.overlay { z-index: 2147483627; }',
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.ok(
			violations.some(
				(violation) =>
					violation.ruleId === 'z-index-declaration-not-on-scale' &&
					violation.file === 'src/overlay.txt',
			),
			`${name} style sink must red: ${JSON.stringify(violations)}`,
		);
	}
});

test('e2e (round 11 B2): a template literal sink ships the raw binding bytes', async () => {
	// Round 10 B2(b): `` <style>{`${rawCss}`}</style> `` ships the same bytes
	// as the bare binding; the sink walk must look through the substitution.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawCss from './overlay.txt?raw';`,
				'export const probe = <style>{`${rawCss}`}</style>;',
			].join('\n'),
			'overlay.txt': '.overlay { z-index: 2147483626; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.ok(
		violations.some(
			(violation) =>
				violation.ruleId === 'z-index-declaration-not-on-scale' &&
				violation.file === 'src/overlay.txt',
		),
		`template-literal style sink must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 11 B2): a Vite root-absolute ?raw specifier resolves against the project root', async () => {
	// Round 10 B2(c): `/src/…?raw` is root-absolute for Vite (project root),
	// but the round-9 resolver treated it as filesystem-absolute, missed the
	// recorded module, and returned silently green. The bytes really ship.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawCss from '/src/overlay.txt?raw';`,
				'export const probe = <style>{rawCss}</style>;',
			].join('\n'),
			'overlay.txt': '.overlay { z-index: 2147483625; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.ok(
		violations.some(
			(violation) =>
				violation.ruleId === 'z-index-declaration-not-on-scale' &&
				violation.file === 'src/overlay.txt',
		),
		`root-absolute style sink must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 11 B2): an alias of a raw binding displayed in a text node stays green', async () => {
	// The paired green half: the alias is the same binding, and its only
	// consumer is a text node — displayed escaped text, never a stylesheet —
	// exactly as the round-8 I3 narrowing protected.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawCss from './code-sample.txt?raw';`,
				'const aliased = rawCss;',
				'export const probe = <pre>{aliased}</pre>;',
			].join('\n'),
			'code-sample.txt': '.example { z-index: 2147483624; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations,
		[],
		`displayed aliased raw text must stay green: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 13 B2): the raw resolver evaluates the transparent expression family', async () => {
	// Round 12 B2: the resolver followed identifiers and template
	// substitutions but silently returned no specifier for an object
	// property, a conditional, or String(rawCss) — all four payloads
	// shipped in the real client and SSR bundles while the guard reported
	// OK. The family now resolves object-member reads through const object
	// literals (nested at any depth), both branches of a conditional,
	// String(...), element-access spellings, and alias chains to a fixpoint
	// — "one step further" is not a spelling anymore because there is no
	// bound to step past.
	const cases: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
		[
			'object property',
			[
				'const o = { css: rawCss };',
				'export const probe = <style>{o.css}</style>;',
			],
		],
		[
			'nested object property',
			[
				'const o = { a: { css: rawCss } };',
				'export const probe = <style>{o.a.css}</style>;',
			],
		],
		[
			'element access',
			[
				'const o = { css: rawCss };',
				"export const probe = <style>{o['css']}</style>;",
			],
		],
		[
			'const conditional',
			[
				"const cond = true ? rawCss : '';",
				'export const probe = <style>{cond}</style>;',
			],
		],
		[
			'inline conditional',
			["export const probe = <style>{flag ? rawCss : ''}</style>;"],
		],
		[
			'String coercion',
			['const s = String(rawCss);', 'export const probe = <style>{s}</style>;'],
		],
		[
			'nested String of conditional',
			[
				"const s = String(flag ? rawCss : '');",
				'export const probe = <style>{s}</style>;',
			],
		],
		[
			'deep alias chain',
			[
				'const first = rawCss;',
				'const second = first;',
				'const third = second;',
				'export const probe = <style>{third}</style>;',
			],
		],
	];
	for (const [name, lines] of cases) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': [`import rawCss from './overlay.txt?raw';`, ...lines].join(
					'\n',
				),
				'overlay.txt': '.overlay { z-index: 2147483611; }',
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.ok(
			violations.some(
				(violation) =>
					violation.ruleId === 'z-index-declaration-not-on-scale' &&
					violation.file === 'src/overlay.txt',
			),
			`${name} style sink must red at the raw file: ${JSON.stringify(violations)}`,
		);
	}
	const { violations: bothBranches } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawCss from './overlay.txt?raw';`,
				`import otherRaw from './other.txt?raw';`,
				'export const probe = <style>{flag ? rawCss : otherRaw}</style>;',
			].join('\n'),
			'overlay.txt': '.overlay { z-index: 2147483610; }',
			'other.txt': '.other { z-index: 2147483609; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		bothBranches
			.filter(
				(violation) => violation.ruleId === 'z-index-declaration-not-on-scale',
			)
			.map((violation) => violation.file)
			.sort(),
		['src/other.txt', 'src/overlay.txt'],
		`both conditional branches must be walked: ${JSON.stringify(bothBranches)}`,
	);
});

test('e2e (round 13 B2): a raw binding inside an unhandled style-sink expression is a named diagnostic', async () => {
	// The fail-loud half of the family: a recorded raw binding inside an
	// expression node the resolver cannot evaluate (a call, a binary) may
	// ship its bytes as CSS unread — that is a named
	// `z-index-unresolved-raw-expression` diagnostic, never the silent green
	// a resolver miss produced. The paired `<pre>` proof keeps the round-8
	// I3 boundary: the same bytes displayed as text are not a stylesheet.
	for (const [name, sink, expected] of [
		[
			'call',
			'<style>{wrap(rawCss)}</style>',
			['z-index-unresolved-raw-expression'],
		],
		[
			'binary',
			"<style>{rawCss + 'x'}</style>",
			// the static operand 'x' ships as unparseable CSS text, and the
			// raw binding in the unhandled expression fails loud — both
			// diagnostics are true
			['z-index-unparseable-static-css', 'z-index-unresolved-raw-expression'],
		],
		[
			'member of call result',
			'<style>{makeCss(rawCss).text}</style>',
			['z-index-unresolved-raw-expression'],
		],
	]) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': [
					`import rawCss from './overlay.txt?raw';`,
					`const wrap = (value: string) => value;`,
					`const makeCss = (value: string) => ({ text: value });`,
					`export const probe = ${sink};`,
				].join('\n'),
				'overlay.txt': '.overlay { z-index: 2147483608; }',
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.deepEqual(
			violations.map((violation) => violation.ruleId),
			expected,
			`${name} must fail loud by name: ${JSON.stringify(violations)}`,
		);
	}
	const { violations: displayed } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawCss from './overlay.txt?raw';`,
				'const wrap = (value: string) => value;',
				'export const probe = <pre>{wrap(rawCss)}</pre>;',
			].join('\n'),
			'overlay.txt': '.overlay { z-index: 2147483607; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		displayed,
		[],
		`the same unhandled expression as displayed text must stay green: ${JSON.stringify(displayed)}`,
	);
});

test('e2e (round 15 B1): a partial element-access key reaching a recorded raw binding fails loud', async () => {
	// 2b0ff1bb returned the static operand of a one-sided `+` as a complete
	// candidate set, so `styles['cs' + suffix]` resolved member `cs`, found
	// it absent, and reported nothing — a silent pass while the raw bytes
	// ship under the runtime key. A partial key is unprovable: the guard
	// resolves no member and fails loud by name whenever a recorded raw
	// binding is reachable, exactly like the fully runtime key control.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawCss from './overlay.txt?raw';`,
				'const styles = { css: rawCss };',
				"const suffix = ['s'].join('');",
				"export const probe = <style>{styles['cs' + suffix]}</style>;",
			].join('\n'),
			'overlay.txt': '.overlay { z-index: 2147483584; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-unresolved-raw-expression'],
		`a partial key over a recorded raw binding must fail loud: ${JSON.stringify(violations)}`,
	);
	const { violations: runtimeKey } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawCss from './overlay.txt?raw';`,
				'const styles = { css: rawCss };',
				'export const probe = (key: string) => <style>{styles[key]}</style>;',
			].join('\n'),
			'overlay.txt': '.overlay { z-index: 2147483583; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		runtimeKey.map((violation) => violation.ruleId),
		['z-index-unresolved-raw-expression'],
		`a fully runtime key over a recorded raw binding must fail loud: ${JSON.stringify(runtimeKey)}`,
	);
});

test('e2e (round 15 B1): a partial element-access key never reads a member the code does not read', async () => {
	// The paired false positive: `o['a' + rt]` provably starts with `'a'`, so
	// 2b0ff1bb read member `a` and red on its raw z-index — a
	// z-index-style-element-shipped violation for CSS that never ships (the
	// runtime key is `'ab'`). A partial key resolves no member; the sink
	// stays in the declared runtime bucket.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				"const rt = ['b'].join('');",
				"const o = { a: '.probe-a { z-index: 2147483582; }', ab: '.probe-ab { color: red; }' };",
				"export const probe = <style>{o['a' + rt]}</style>;",
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations,
		[],
		`a partial element-access key must not read a member: ${JSON.stringify(violations)}`,
	);
});

test('e2e (review B1): a conditional element-access key with a runtime branch never resolves only the static member', async () => {
	// Round-15 taught the one-sided `+` spelling that a partial key must not
	// resolve its static member. The conditional spelling had the same hole:
	// `styles[flag ? 'safe' : runtimeKey]` returned the static branch as a
	// complete singleton, so the guard read member `safe`, found it clean,
	// and printed OK while the runtime branch selected a member whose bytes
	// are a recorded `?raw` import carrying a raw z-index. A conditional with
	// a runtime branch is a partial key: the member cannot be named, so the
	// sink fails loud by name whenever a recorded raw binding is reachable,
	// exactly like the fully runtime key control.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawCss from './overlay.txt?raw';`,
				"const styles = { safe: '.probe-safe { color: red; }', other: rawCss };",
				"export const probe = (flag: boolean, runtimeKey: string) => <style>{styles[flag ? 'safe' : runtimeKey]}</style>;",
			].join('\n'),
			'overlay.txt': '.overlay { z-index: 2147483647; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-unresolved-raw-expression'],
		`a conditional key with a runtime branch over a recorded raw binding must fail loud: ${JSON.stringify(violations)}`,
	);
	// The fully static conditional key keeps its own semantics: two static
	// branches still name no single member, and the reachable raw binding
	// still fails loud by name — the fix must not fold the runtime-branch
	// rule onto the both-static spelling.
	const { violations: staticKey } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawCss from './overlay.txt?raw';`,
				"const styles = { safe: '.probe-safe { color: red; }', other: rawCss };",
				"export const probe = (flag: boolean) => <style>{styles[flag ? 'safe' : 'other']}</style>;",
			].join('\n'),
			'overlay.txt': '.overlay { z-index: 2147483646; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		staticKey.map((violation) => violation.ruleId),
		['z-index-unresolved-raw-expression'],
		`a fully static conditional key over a recorded raw binding must still fail loud: ${JSON.stringify(staticKey)}`,
	);
});

test('e2e (round 15 B2/B3): every import binding shape of a ?raw module is recorded and resolved', async () => {
	// Round-14 B2: rawImportBindings recorded only the default clause or the
	// namespace clause (an else-if), so `{ default as x }` — the default
	// under another spelling — was not a recorded binding at all, and a
	// mixed `import d, * as ns` dropped the namespace half. Round-14 B3: the
	// `?raw` test was a substring sniff, so `?v=1&raw` (raw by Vite's own
	// query-token test) was invisible to the script pass while the build's
	// provenance plugin recorded it. Each spelling now reds at its raw file
	// exactly like the plain default import.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				"import { default as namedDefault } from './named.txt?raw';",
				"import mixedDefault, * as mixedNs from './mixed.txt?raw';",
				"import queried from './queried.txt?v=1&raw';",
				'export const namedProbe = <style>{namedDefault}</style>;',
				'export const mixedProbe = <style>{mixedNs.default}</style>;',
				'export const queriedProbe = <style>{queried}</style>;',
				'void mixedDefault;',
			].join('\n'),
			'named.txt': '.named { z-index: 2147483581; }',
			'mixed.txt': '.mixed { z-index: 2147483580; }',
			'queried.txt': '.queried { z-index: 2147483579; }',
		},
		'',
		["import { namedProbe, mixedProbe, queriedProbe } from './probe';"],
	);
	assert.deepEqual(
		violations
			.filter(
				(violation) => violation.ruleId === 'z-index-declaration-not-on-scale',
			)
			.map((violation) => violation.file)
			.sort(),
		['src/mixed.txt', 'src/named.txt', 'src/queried.txt'],
		`every import binding shape must red at its raw file: ${JSON.stringify(violations)}`,
	);
});

test('raw sinks (round 17 I3): a non-default named element is recorded by name, never by omission', () => {
	// Round-14 B2's other half: a named element that is not `default` is
	// undefined on a raw module (which only has a default export — the build
	// cannot even compile such an import), so it must be recorded by name —
	// the shadowing resolution stays exact — yet resolve to nothing: green
	// by name, never by omission. Round-16 I3: the old assertion only proved
	// the walk stayed green, which it would also do if the binding were
	// silently omitted, so the record itself is asserted directly.
	const baseDir = '/tmp/zindex-r15-unit';
	const record = (content: string) =>
		collectRawImportBindings(
			ts.createSourceFile(
				'probe.tsx',
				content,
				ts.ScriptTarget.Latest,
				true,
				ts.ScriptKind.TSX,
			),
			{
				relativePath: 'probe.tsx',
				baseDir,
				rawTextPaths: new Set([path.join(baseDir, 'other.txt')]),
				queriedPaths: new Set([path.join(baseDir, 'other.txt')]),
			},
		);
	const mixed = record(
		[
			`import { default as aliasedDefault, other, alsoMissing } from './other.txt?raw';`,
			`import * as rawNs from './other.txt?raw';`,
			`import plainDefault from './other.txt?raw';`,
			`import unrelated from './unrelated.txt?raw';`,
			`import plainModule from './helper.ts';`,
		].join('\n'),
	);
	assert.equal(mixed.get('aliasedDefault')?.kind, 'default');
	assert.equal(mixed.get('other')?.kind, 'named-non-default');
	assert.equal(mixed.get('alsoMissing')?.kind, 'named-non-default');
	assert.equal(mixed.get('rawNs')?.kind, 'namespace');
	assert.equal(mixed.get('plainDefault')?.kind, 'default');
	// A queried specifier whose file appears in no build record is the
	// unresolvable-query class (an alias or otherwise unmappable spelling):
	// it is recorded so the sink walk fails loud by name — round-15 was loud
	// for this shape and stays loud (round-17 hard-rule audit).
	assert.equal(mixed.get('unrelated')?.kind, 'default');
	// A specifier with no query is not a binding at all — the record is the
	// source of truth, never the specifier text.
	assert.equal(mixed.has('plainModule'), false);
	assert.deepEqual(
		[...mixed.keys()].sort(),
		[
			'aliasedDefault',
			'alsoMissing',
			'other',
			'plainDefault',
			'rawNs',
			'unrelated',
		],
		'the record must contain every binding of the raw module by name',
	);
	// The walk resolves each binding exactly: the non-default element ships
	// nothing (green), the `{ default as x }` spelling is the default
	// binding and reds at the raw file.
	const walk = (
		content: string,
		files: Record<string, string>,
	) =>
		scanZIndexFile({
			scanner,
			relativePath: 'probe.tsx',
			content,
			baseDir,
			rawTextPaths: new Set(
				Object.keys(files).map((relative) => path.join(baseDir, relative)),
			),
			rawImportTexts: new Map(
				Object.entries(files).map(([relative, text]) => [
					path.join(baseDir, relative),
					text,
				]),
			),
		});
	const cssText = '.other { z-index: 2147483577; }';
	assert.deepEqual(
		walk(
			[
				`import { notDefault } from './other.txt?raw';`,
				'export const probe = <style>{notDefault}</style>;',
			].join('\n'),
			{ 'other.txt': cssText },
		),
		[],
		'a named element that is not default ships nothing and must stay green',
	);
	assert.deepEqual(
		walk(
			[
				`import { default as aliasedDefault, other } from './other.txt?raw';`,
				'export const probe = <style>{aliasedDefault}</style>;',
			].join('\n'),
			{ 'other.txt': cssText },
		).map((violation) => violation.ruleId),
		['z-index-declaration-not-on-scale'],
		'`{ default as x }` is the default binding and must red at the raw file',
	);
});

// ---------------------------------------------------------------------------
// Round-17 B1 — the single module classifier. Classification is decided in
// exactly one function (`classifyModuleKind`), which reads what the build
// itself produced; the tests below pin the mechanism at the source level.
// ---------------------------------------------------------------------------
test('structural (round 17 B1 → round 19 B2): the single classifier and per-ID provenance are asserted behaviourally', async () => {
	// Round-17 B1 claimed the single classifier by scanning the guard's own
	// source for a handful of query-parsing spellings. Round-19 B2 showed
	// that is a source-regex stand-in: it reds for the exact `split('?')`
	// spelling but stays green for an equivalent `replace(/\?.*$/)` +
	// `endsWith('?raw')` classifier, and it cannot tell a query parse that
	// *classifies* from the query extraction that *reconstructs a module ID
	// for a per-ID membership lookup*. The claim is therefore asserted
	// behaviourally, not lexically:
	//   * both ID shapes of one file (`?raw`, `?url`, `?v=1?raw`) feed the
	//     real classification path (`classifyModuleKind`) and classify
	//     exactly as Vite observes them — raw against the raw-export shape,
	//     url-asset against the vite:asset marker;
	//   * the script pass consults per-ID provenance (round-19 I1): a `?url`
	//     specifier for a file the build also recorded as `?raw` is a distinct
	//     module ID and provably not raw text, so it resolves to no binding.
	const txtPath = '/probe/src/named.txt';
	const rawModuleConfig = {
		code: 'export default ".x"',
		meta: {},
		assetPluginLoad: new Set<string>(),
	};
	const urlModuleConfig = {
		code: 'export default "/assets/named.txt"',
		meta: { 'vite:asset': true },
		assetPluginLoad: new Set<string>(),
	};
	assert.equal(
		classifyModuleKind(`${txtPath}?raw`, rawModuleConfig).kind,
		'raw',
	);
	assert.equal(
		classifyModuleKind(`${txtPath}?v=1?raw`, rawModuleConfig).kind,
		'raw',
	);
	assert.equal(
		classifyModuleKind(`${txtPath}?v=2?raw`, rawModuleConfig).kind,
		'raw',
	);
	assert.equal(
		classifyModuleKind(`${txtPath}?url`, urlModuleConfig).kind,
		'url-asset',
	);
	// A `?url` ID for a file the build also recorded as `?raw` is a distinct
	// module: only the `?raw` ID resolves to a raw binding, never the `?url`.
	const baseDir = '/probe';
	const sourceFile = ts.createSourceFile(
		'probe.tsx',
		[
			`import rawText from './named.txt?raw';`,
			`import assetUrl from './named.txt?url';`,
		].join('\n'),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const bindings = collectRawImportBindings(sourceFile, {
		relativePath: 'probe.tsx',
		baseDir,
		rawTextPaths: new Set([path.join(baseDir, 'named.txt')]),
		rawTextIds: new Set([`${path.join(baseDir, 'named.txt')}?raw`]),
		queriedPaths: new Set([path.join(baseDir, 'named.txt')]),
	});
	assert.equal(bindings.get('rawText')?.kind, 'default');
	assert.equal(bindings.has('assetUrl'), false);
	// The round-19 B2 divergence: a hand-written classifier that re-maps only
	// the `?v=2?raw` query (the exact mutation the review demonstrated) would
	// reconstruct the module ID as `…?url` instead of `…?v=2?raw`, miss the
	// recorded ID, and silently drop the raw binding. The per-ID membership is
	// therefore pinned for that spelling too: the recorded `…?v=2?raw` ID must
	// bind its default clause, exactly as Vite observes it.
	const multiQuerySource = ts.createSourceFile(
		'probe.tsx',
		"import rawText from './named.txt?v=2?raw';",
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const multiQueryBindings = collectRawImportBindings(multiQuerySource, {
		relativePath: 'probe.tsx',
		baseDir,
		rawTextPaths: new Set([path.join(baseDir, 'named.txt')]),
		rawTextIds: new Set([`${path.join(baseDir, 'named.txt')}?v=2?raw`]),
		queriedPaths: new Set([path.join(baseDir, 'named.txt')]),
	});
	assert.equal(
		multiQueryBindings.get('rawText')?.kind,
		'default',
		'a recorded ?v=2?raw module ID must bind its default clause',
	);
	// And the green mirror: when the build records the file under a non-raw
	// query only, the `?v=2?raw` specifier is not raw text — the per-ID record
	// is the source of truth, never the specifier text.
	const urlOnlyBindings = collectRawImportBindings(multiQuerySource, {
		relativePath: 'probe.tsx',
		baseDir,
		rawTextPaths: new Set([path.join(baseDir, 'named.txt')]),
		rawTextIds: new Set([`${path.join(baseDir, 'named.txt')}?url`]),
		queriedPaths: new Set([path.join(baseDir, 'named.txt')]),
	});
	assert.equal(
		urlOnlyBindings.has('rawText'),
		false,
		'a ?v=2?raw specifier whose file the build recorded only as ?url stays green',
	);
});

test('structural (round 17 B1): the classifier reads Vite-observable signals, never query tokens', () => {
	// The classifier's raw/inline answer is a pure function of the build's
	// own transform result, module info marker, and load claim — the
	// multi-query spelling `?v=1?raw` is raw because Vite transformed it as
	// raw (same raw-export shape), not because any query token said so.
	// `?url` carries Vite's own asset marker and is never raw text.
	const txtPath = '/probe/src/named.txt';
	const cssPath = '/probe/src/overlay.css';
	assert.equal(
		classifyModuleKind(`${txtPath}?raw`, {
			code: 'export default ".x { color: red; }"',
			meta: {},
			assetPluginLoad: new Set(),
		}).kind,
		'raw',
	);
	assert.equal(
		classifyModuleKind(`${txtPath}?v=1?raw`, {
			code: 'export default ".x { color: red; }"',
			meta: {},
			assetPluginLoad: new Set(),
		}).kind,
		'raw',
	);
	assert.equal(
		classifyModuleKind(`${txtPath}?v=1&raw`, {
			code: 'export default ".x { color: red; }"',
			meta: {},
			assetPluginLoad: new Set(),
		}).kind,
		'raw',
	);
	assert.equal(
		classifyModuleKind(`${txtPath}?raw`, {
			code: 'export default ".x { color: red; }"',
			meta: {},
			// The build's post-order load hook observed the id, so vite:asset
			// did not claim it — a plain module, not a raw one.
			assetPluginLoad: new Set([`${txtPath}?raw`]),
		}).kind,
		'other',
	);
	assert.equal(
		classifyModuleKind(`${txtPath}?url`, {
			code: 'export default "/assets/named-abc123.txt"',
			meta: { 'vite:asset': true },
			assetPluginLoad: new Set(),
		}).kind,
		'url-asset',
	);
	assert.equal(
		classifyModuleKind(`${cssPath}?raw`, {
			code: 'export default ".x { color: red; }"',
			meta: {},
			assetPluginLoad: new Set(),
		}).kind,
		'inline-css',
	);
	assert.equal(
		classifyModuleKind(`${cssPath}?inline`, {
			code: 'export default ".x{color:red}"',
			meta: {},
			assetPluginLoad: new Set([`${cssPath}?inline`]),
		}).kind,
		'inline-css',
	);
	assert.equal(
		classifyModuleKind(cssPath, {
			code: '',
			meta: {},
			assetPluginLoad: new Set([cssPath]),
		}).kind,
		'css',
	);
	assert.equal(
		classifyModuleKind(cssPath, {
			code: '.x { color: red; }',
			meta: {},
			assetPluginLoad: new Set([cssPath]),
		}).kind,
		'css',
	);
	assert.equal(
		classifyModuleKind(`${cssPath}?url`, {
			code: 'export default "/assets/overlay-abc123.css"',
			meta: { 'vite:asset': true },
			assetPluginLoad: new Set(),
		}).kind,
		'css-url',
	);
	assert.equal(
		classifyModuleKind('/probe/src/main.ts', {
			code: "import './app.css';",
			meta: {},
			assetPluginLoad: new Set(['/probe/src/main.ts']),
		}).kind,
		'script',
	);
});

test('e2e (round 17 B1): a second query separator cannot hide a raw module from either classifier', async () => {
	// Round-16 B1's exact reproduction: `./x.txt?v=1?raw` is a raw module to
	// Vite's own `/(?:\?|&)raw(?:&|$)/` test, but the round-15 hand-written
	// `split('?')` discarded the second query segment and neither the build
	// record nor the script pass saw it — the raw bytes shipped green. The
	// build now records the module from its own transform result, and the
	// script pass asks that record, so the multi-query spelling reds at its
	// raw file like every other spelling.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawCss from './overlay.txt?v=1?raw';`,
				`export const probe = <style>{rawCss}</style>;`,
			].join('\n'),
			'overlay.txt': '.overlay { z-index: 2147483575; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.file),
		['src/overlay.txt'],
		`a multi-query-separator ?raw module must red at its raw file: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 17 B1): emitted bytes and recorded provenance agree for multi-query raw modules', async () => {
	// The B1 "real-build test": the module the build transformed as raw (its
	// text is in an emitted JS asset) is exactly the module the provenance
	// record names, for the `?v=1?raw` spelling Vite accepts and the guard
	// previously missed.
	const root = await mkdtemp(path.join(scriptsDir, 'zindex-guard-'));
	try {
		await mkdir(path.join(root, 'src'), { recursive: true });
		await writeFile(path.join(root, 'app.css'), FIXTURE_APP_CSS);
		await writeFile(
			path.join(root, 'index.html'),
			'<div id="app"></div><script type="module" src="/src/main.ts"></script>',
		);
		await writeFile(
			path.join(root, 'vite.config.mjs'),
			"import tailwindcss from '@tailwindcss/vite';\n" +
				'export default { plugins: [tailwindcss()] };\n',
		);
		const marker = '.r17-b1 { z-index: 2147483574; }';
		await writeFile(
			path.join(root, 'src/main.ts'),
			[
				"import '../app.css';",
				"import multiRaw from './overlay.txt?v=1?raw';",
				'document.body.dataset.probe = multiRaw;',
			].join('\n'),
		);
		await writeFile(path.join(root, 'src/overlay.txt'), marker);
		const buildResult = await buildProductionApp(root);
		try {
			const resolved = path.resolve(root, 'src/overlay.txt');
			assert.ok(
				(buildResult.rawTextPaths ?? []).includes(resolved),
				`the build record must contain the multi-query raw module: ` +
					JSON.stringify(buildResult.rawTextPaths),
			);
			const emittedFiles = await readdir(buildResult.emittedCssRoot, {
				recursive: true,
			});
			const jsFiles = emittedFiles.filter((file) => file.endsWith('.js'));
			assert.ok(jsFiles.length > 0, 'the build must emit JS');
			const emitted = await Promise.all(
				jsFiles.map((file) =>
					readFile(path.join(buildResult.emittedCssRoot, file), 'utf8'),
				),
			);
			assert.ok(
				emitted.some((text) => text.includes(marker)),
				'the raw bytes must ship in an emitted asset',
			);
		} finally {
			await buildResult.cleanup?.();
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('e2e (round 19 I1): a ?url import of a file that is also ?raw-imported stays green', async () => {
	// Round-19 I1: the build recorded raw provenance only as a file path, so
	// two distinct Vite module IDs for the same file (`?raw` and `?url`)
	// collapsed to one path and the `?url` binding inherited the `?raw`
	// rawness — the URL string reached a `<style>` sink and the guard walked
	// the file's bytes as CSS, a false positive on legitimate code. The
	// build now records per-ID provenance (path + query), and the script pass
	// consults it: the `?raw` binding is raw, the `?url` binding is a distinct
	// module and provably not raw text, so it resolves to no binding and the
	// fixture stays green. Both halves: the raw bytes displayed as text stay
	// green, and the URL string reaching `<style>` is not walked as CSS.
	const { violations } = await runFixtureGuard(
		{
			'__r18-dual-query.txt': '.r18-displayed-only { z-index: 2147483571; }',
			'probe.tsx': [
				`import r18RawText from './__r18-dual-query.txt?raw';`,
				`import r18AssetUrl from './__r18-dual-query.txt?url';`,
				'export const probe = <><pre>{r18RawText}</pre><style>{r18AssetUrl}</style></>;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations,
		[],
		`a ?url import of a ?raw file must stay green: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 13 B2): the static-string family resolves the same transparent expressions', async () => {
	// The raw resolver's family is also the static-string family: an object
	// property, a conditional, String(...), a template substitution, `+`, or
	// a deep alias chain is just as transparent when the payload is a static
	// literal as when it is a ?raw import. Round 11 resolved only the raw
	// spellings; the same shapes with static text shipped green. Depth does
	// not matter — there is no bound left to step past.
	const cases: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
		[
			'object property',
			[
				"const o = { css: '.probe { z-index: 2147483606; }' };",
				'export const probe = <style>{o.css}</style>;',
			],
		],
		[
			'nested object property',
			[
				"const o = { a: { css: '.probe { z-index: 2147483605; }' } };",
				'export const probe = <style>{o.a.css}</style>;',
			],
		],
		[
			'conditional',
			[
				"const cond = true ? '.probe { z-index: 2147483604; }' : '';",
				'export const probe = <style>{cond}</style>;',
			],
		],
		[
			'String coercion',
			[
				"const s = String('.probe { z-index: 2147483603; }');",
				'export const probe = <style>{s}</style>;',
			],
		],
		[
			'template with static substitution',
			[
				"const level = '2147483602';",
				'export const probe = <style>{`.probe { z-index: ${level}; }`}</style>;',
			],
		],
		[
			'static concatenation',
			[
				"export const probe = <style>{'.probe { z-index: 2147483601; }' + ';'}</style>;",
			],
		],
		[
			'deep alias chain',
			[
				"const a = '.probe { z-index: 2147483600; }';",
				'const b = a;',
				'const c = b;',
				'export const probe = <style>{c}</style>;',
			],
		],
		[
			'element access',
			[
				"const o = { css: '.probe { z-index: 2147483594; }' };",
				"export const probe = <style>{o['css']}</style>;",
			],
		],
		[
			'aliased element access',
			[
				"const o = { css: '.probe { z-index: 2147483593; }' };",
				"const key = 'css';",
				'export const probe = <style>{o[key]}</style>;',
			],
		],
		[
			'nested element access',
			[
				"const o = { a: { css: '.probe { z-index: 2147483592; }' } };",
				"export const probe = <style>{o.a['css']}</style>;",
			],
		],
	];
	for (const [name, lines] of cases) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': lines.join('\n'),
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.deepEqual(
			violations.map((violation) => violation.ruleId),
			['z-index-style-element-shipped'],
			`a ${name} static style payload must red: ${JSON.stringify(violations)}`,
		);
	}
});

test('e2e (round 13 B2): static style text beside runtime children still ships and reds', async () => {
	// Round 12 returned on the first non-static child, discarding the static
	// text before it — a static payload beside a runtime child shipped green.
	// Static JSX text and static expression branches always ship, so each is
	// walked individually; the runtime child stays in the runtime bucket.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				"export const probe = (runtimeCss: string) => <style>{'.probe { z-index: 2147483599; }'}{runtimeCss}</style>;",
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-style-element-shipped'],
		`static text beside a runtime child must red: ${JSON.stringify(violations)}`,
	);
	const { violations: mixed } = await runFixtureGuard(
		{
			'probe.tsx': [
				"export const probe = (runtimeCss: string) => <style>{flag ? '.probe { z-index: 2147483598; }' : runtimeCss}</style>;",
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		mixed.map((violation) => violation.ruleId),
		['z-index-style-element-shipped'],
		`a static conditional branch beside a runtime branch must red: ${JSON.stringify(mixed)}`,
	);
	const { violations: pureRuntime } = await runFixtureGuard(
		{
			'probe.tsx': [
				'export const probe = (runtimeCss: string) => <style>{runtimeCss}</style>;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		pureRuntime,
		[],
		`a purely runtime payload must stay green: ${JSON.stringify(pureRuntime)}`,
	);
	const { violations: mixedBinary } = await runFixtureGuard(
		{
			'probe.tsx': [
				"export const probe = (runtimeCss: string) => <style>{'.probe { z-index: 2147483597; }' + runtimeCss}</style>;",
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		mixedBinary.map((violation) => violation.ruleId),
		['z-index-style-element-shipped'],
		`a static operand of a runtime concatenation must red: ${JSON.stringify(mixedBinary)}`,
	);
	// The class, not one member of it: the offending static part must red at
	// every position — before, between, and after runtime children, at both
	// two and three static parts. A walk that visits only the first static
	// part keeps every case where the offender is not first silent.
	const positions = [
		[
			'two static parts, offender first',
			"{'.probe { z-index: 2147483596; }'}{runtimeCss}{'.harmless { color: red; }'}",
		],
		[
			'two static parts, offender between runtime children',
			"{'.harmless { color: red; }'}{runtimeCss}{'.probe { z-index: 2147483595; }'}{runtimeCss}",
		],
		[
			'two static parts, offender last',
			"{'.harmless { color: red; }'}{runtimeCss}{'.probe { z-index: 2147483594; }'}",
		],
		[
			'three static parts, offender first',
			"{'.probe { z-index: 2147483593; }'}{runtimeCss}{'.harmless { color: red; }'}{runtimeCss}{'.quiet { color: blue; }'}",
		],
		[
			'three static parts, offender between runtime children',
			"{'.harmless { color: red; }'}{runtimeCss}{'.probe { z-index: 2147483592; }'}{runtimeCss}{'.quiet { color: blue; }'}",
		],
		[
			'three static parts, offender last',
			"{'.harmless { color: red; }'}{runtimeCss}{'.quiet { color: blue; }'}{runtimeCss}{'.probe { z-index: 2147483591; }'}",
		],
	];
	for (const [name, children] of positions) {
		const { violations: positioned } = await runFixtureGuard(
			{
				'probe.tsx': [
					'export const probe = (runtimeCss: string) => <style>' +
						children +
						'</style>;',
				].join('\n'),
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.deepEqual(
			positioned.map((violation) => violation.ruleId),
			['z-index-style-element-shipped'],
			`${name} must red: ${JSON.stringify(positioned)}`,
		);
	}
});

test('e2e (round 15 M2): an uncapped Cartesian product is a named diagnostic, not a hang', async () => {
	// cartesianStringJoin multiplies substitution candidate sets without a
	// bound, so a template with several multi-candidate substitutions would
	// hang the guard. The product has a *work* budget (round-19 I2): a
	// payload whose total candidate characters exceed the budget is provably
	// static text the guard cannot enumerate, so it fails loud by name
	// instead of silently dropping into the runtime bucket — and never hangs.
	// 2^20 = 1,048,576 candidates of ~40 characters each is ~42M characters,
	// well past the 20M budget.
	const flags = [];
	for (let index = 0; index < 20; index += 1) {
		flags.push(`f${index}: boolean`);
	}
	const substitutions = [];
	for (let index = 0; index < 20; index += 1) {
		substitutions.push(`\${f${index} ? 'a' : 'b'}`);
	}
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`export const probe = (${flags.join(', ')}) => <style>{\`x${substitutions.join('')}y\`}</style>;`,
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-static-candidate-overflow'],
		`an overflowing static candidate space must fail loud: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 17 I2): the Cartesian bound gates the work, not the legitimacy', async () => {
	// Round-16 I2: the 4096 cap reddened harmless, valid CSS at 13
	// independent binary choices (2^13 = 8192 candidates) — a bound that
	// reddens real code is a false positive. The round-19 I2 fix replaces the
	// count cap with a *work* budget (total candidate characters, checked
	// before allocation), so a payload with many short candidates is
	// enumerable and stays green even at 131,072 candidates, and only a
	// payload whose enumeration would genuinely exceed the work budget is an
	// unresolvable payload that fails loud by name. Paired valid-CSS proofs:
	// a 16-choice (65536 candidates), a 17-choice (131072 candidates), and a
	// 20-choice (2^20 = 1,048,576 candidates, ~42M characters — past the
	// 20M work budget) payload, each with nothing but harmless CSS.
	const build = (count: number, cssText: string) => {
		const flags = [];
		for (let index = 0; index < count; index += 1) {
			flags.push(`f${index}: boolean`);
		}
		const substitutions = [];
		for (let index = 0; index < count; index += 1) {
			substitutions.push(`\${f${index} ? 'a' : 'b'}`);
		}
		return runFixtureGuard(
			{
				'probe.tsx': [
					`export const probe = (${flags.join(', ')}) => <style>{\`.r17-${substitutions.join('')} { ${cssText} }\`}</style>;`,
				].join('\n'),
			},
			'',
			["import { probe } from './probe';"],
		);
	};
	// Well under the budget: every candidate is valid CSS with no z-index —
	// the enumeration is the work, the payload is legitimate, and it stays
	// green.
	const { violations: below } = await build(16, 'color: red;');
	assert.deepEqual(
		below,
		[],
		`a 65536-candidate harmless payload must stay green: ${JSON.stringify(below)}`,
	);
	// The round-19 I2 boundary: 131,072 candidates of short payloads sum to
	// ~5M characters, well under the 20M work budget, so the same legitimate
	// shape enumerates and stays green — the old count cap reddened it.
	const { violations: mid } = await build(17, 'color: red;');
	assert.deepEqual(
		mid,
		[],
		`a 131072-candidate harmless payload must stay green: ${JSON.stringify(mid)}`,
	);
	// Past the budget: the same legitimate shape is an unresolvable payload —
	// the named diagnostic, never a silent pass and never a hang. This is the
	// honest boundary (round-21 I4): the 20M-character ceiling is a measured
	// resource ceiling, not a legitimacy cap. The guard walks every enumerated
	// candidate through a PostCSS parse (~3µs/candidate measured), so a payload
	// at the budget costs ~2s and one past it costs many seconds to minutes and
	// tens of megabytes for a single static payload — more than the rest of the
	// run combined. Exceeding a resource ceiling does not make the payload
	// compliant; per round-21 B1 the give-up reports by name, so a legitimately
	// harmless payload that exceeds the ceiling fails loud rather than passing
	// unread. Real code (a handful of flag substitutions) is microseconds.
	const { violations: above } = await build(20, 'color: red;');
	assert.deepEqual(
		above.map((violation) => violation.ruleId),
		['z-index-static-candidate-overflow'],
		`a 1048576-candidate payload must fail loud by name: ${JSON.stringify(above)}`,
	);
	assert.match(above[0].message, /unresolvable payload/);
});

test('e2e (round 17 B2): overflow is monotone through every expression-family combinator', async () => {
	// Round-16 B2: the Cartesian cap is loud only at the top level — an
	// overflowing candidate set nested in one branch of a conditional was
	// replaced by the other branch's compliant value, so loud became quiet
	// by a path the hard rule was written to prevent. Overflow must now
	// propagate through every combinator: a nested conditional, a template
	// substitution, a `+` operand, an object-member read, and a const alias
	// each keep the enclosing result overflowing, and both style sinks
	// (`<style>` children and a dangerouslySetInnerHTML payload) surface the
	// named diagnostic. Every case pairs the overflowing branch with a
	// harmless compliant sibling — the exact shape that used to go quiet.
	const buildFlags = (count: number, prefix: string) => {
		const flags = [];
		for (let index = 0; index < count; index += 1) {
			flags.push(`${prefix}${index}: boolean`);
		}
		return flags;
	};
	const buildSubstitutions = (count: number, prefix: string) => {
		const substitutions = [];
		for (let index = 0; index < count; index += 1) {
			substitutions.push(`\${${prefix}${index} ? 'a' : 'b'}`);
		}
		return substitutions;
	};
	// 20 independent binary choices: 2^20 = 1,048,576 candidates of ~22
	// characters each is ~23M characters, past the round-19 20M work budget.
	const substitutionCount = 20;
	const flags = buildFlags(substitutionCount, 'f');
	const subs = buildSubstitutions(substitutionCount, 'f');
	const bigPayload = `\`x${subs.join('')}y\``;
	const safeLiteral = "'.r17-safe { color: red; }'";
	// The member-read proof needs module-scope consts (the alias resolver
	// follows module-scope bindings only), so its substitutions use their own
	// module-scope boolean constants.
	const moduleFlagDecls = [];
	for (let index = 0; index < substitutionCount; index += 1) {
		moduleFlagDecls.push(`const g${index} = true;`);
	}
	const bigMemberPayload = `\`x${buildSubstitutions(substitutionCount, 'g').join('')}y\``;
	const cases: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
		[
			'nested conditional',
			[
				`export const probe = (cond: boolean, ${flags.join(', ')}) => <style>{cond ? ${bigPayload} : ${safeLiteral}}</style>;`,
			],
		],
		[
			'template substitution',
			[
				`export const probe = (cond: boolean, ${flags.join(', ')}) => <style>{\`p\${cond ? ${bigPayload} : ${safeLiteral}}q\`}</style>;`,
			],
		],
		[
			'binary operand',
			[
				`export const probe = (cond: boolean, ${flags.join(', ')}) => <style>{${bigPayload} + 'suffix'}</style>;`,
			],
		],
		[
			'object-member read',
			[
				...moduleFlagDecls,
				`const o = { css: ${bigMemberPayload} };`,
				'export const probe = <style>{o.css}</style>;',
			],
		],
		[
			'const alias chain',
			[
				...moduleFlagDecls,
				`const first = (0 === 1 ? ${bigMemberPayload} : ${safeLiteral});`,
				'const alias = first;',
				'export const probe = <style>{alias}</style>;',
			],
		],
		[
			'dangerouslySetInnerHTML payload',
			[
				`export const probe = (cond: boolean, ${flags.join(', ')}) => <style`,
				`  dangerouslySetInnerHTML={{ __html: cond ? ${bigPayload} : ${safeLiteral} }}`,
				'/>;',
			],
		],
	];
	for (const [name, lines] of cases) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': lines.join('\n'),
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.deepEqual(
			violations.map((violation) => violation.ruleId),
			['z-index-static-candidate-overflow'],
			`an overflowing branch nested in a ${name} must stay loud: ${JSON.stringify(violations)}`,
		);
	}
});

test('e2e (round 13 B2): conditional rel/href and reserved-token keys are candidate-aware', async () => {
	// The same family at the remaining string sites: a conditional `rel` can
	// provably evaluate to `stylesheet`, a conditional setProperty key or
	// registerProperty name can provably write a reserved token — each reds
	// because any candidate may ship.
	const { violations: linkViolations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'export const probe = (flag: boolean) => <link',
				"  rel={flag ? 'stylesheet' : 'preload'}",
				"  href='data:text/css,.x%7Bz-index%3A99%7D'",
				'/>;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		linkViolations.map((violation) => violation.ruleId),
		['z-index-opaque-stylesheet-link'],
		`a conditional stylesheet rel must red: ${JSON.stringify(linkViolations)}`,
	);
	const { violations: setPropertyViolations } = await runFixtureGuard(
		{
			'probe.tsx': [
				"export const probe = (flag: boolean) => element.style.setProperty(flag ? '--publy-z-raised' : 'color', '997');",
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		setPropertyViolations.map((violation) => violation.ruleId),
		['z-index-scale-token-redefined'],
		`a conditional setProperty key must red: ${JSON.stringify(setPropertyViolations)}`,
	);
	const { violations: registrationViolations } = await runFixtureGuard(
		{
			'probe.tsx': [
				"export const probe = (flag: boolean) => CSS.registerProperty({ name: flag ? '--publy-z-raised' : 'color', inherits: false });",
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		registrationViolations.map((violation) => violation.ruleId),
		['z-index-scale-token-registered'],
		`a conditional registerProperty name must red: ${JSON.stringify(registrationViolations)}`,
	);
});

test('e2e (round 13 B2): a style sink with no raw binding stays in the runtime bucket', async () => {
	// The resolver family must not turn ordinary runtime payloads red: a
	// plain runtime identifier or a member of a runtime owner contains no
	// recorded raw binding, so the guard reports nothing — the declared
	// runtime bucket for `z-index` assembled from data.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'export const probe = (cssFromProps: string) => <style>{cssFromProps}</style>;',
				'export const memberProbe = (obj: { css: string }) => <style>{obj.css}</style>;',
			].join('\n'),
		},
		'',
		["import { probe, memberProbe } from './probe';"],
	);
	assert.deepEqual(
		violations,
		[],
		`runtime style payloads must stay green: ${JSON.stringify(violations)}`,
	);
});

test("raw sinks: the import binding's sink, never the bytes, decides the walk", () => {
	// Unit-level pair over `scanZIndexFile`'s sink walk: the same bytes red
	// through a <style> sink, stay green through a <pre> sink, and red as a
	// named diagnostic when the style-sink bytes cannot be parsed. A shadowed
	// binding is never mistaken for the raw import, and the namespace import
	// spelling resolves through `.default`.
	const baseDir = '/tmp/zindex-r9-unit';
	const walk = (
		content: string,
		files: Record<string, string>,
	) =>
		scanZIndexFile({
			scanner,
			relativePath: 'probe.tsx',
			content,
			baseDir,
			rawTextPaths: new Set(
				Object.keys(files).map((relative) => path.join(baseDir, relative)),
			),
			rawImportTexts: new Map(
				Object.entries(files).map(([relative, text]) => [
					path.join(baseDir, relative),
					text,
				]),
			),
		});
	const cssText = '.overlay { z-index: 2147483642; }';
	assert.deepEqual(
		walk(
			[
				`import rawCss from './overlay.txt?raw';`,
				'export const probe = <style>{rawCss}</style>;',
			].join('\n'),
			{ 'overlay.txt': cssText },
		).map((violation) => violation.ruleId),
		['z-index-declaration-not-on-scale'],
		'style-sink raw CSS must red',
	);
	assert.deepEqual(
		walk(
			[
				`import rawCss from './overlay.txt?raw';`,
				'export const probe = <pre>{rawCss}</pre>;',
			].join('\n'),
			{ 'overlay.txt': cssText },
		),
		[],
		'text-sink raw CSS must stay green',
	);
	const legacyText = '<!-- .legacy { z-index: 2147483641; } -->';
	assert.deepEqual(
		walk(
			[
				`import rawCss from './legacy.txt?raw';`,
				'export const probe = <style>{rawCss}</style>;',
			].join('\n'),
			{ 'legacy.txt': legacyText },
		).map((violation) => violation.ruleId),
		['z-index-unparseable-static-css'],
		'unparseable style-sink raw text must be a named diagnostic',
	);
	assert.deepEqual(
		walk(
			[
				`import rawCss from './legacy.txt?raw';`,
				'export const probe = <pre>{rawCss}</pre>;',
			].join('\n'),
			{ 'legacy.txt': legacyText },
		),
		[],
		'the same unparseable bytes as displayed text must stay green',
	);
	assert.deepEqual(
		walk(
			[
				`import rawCss from './overlay.txt?raw';`,
				'function show(rawCss: string) { return <style>{rawCss}</style>; }',
				'export const probe = show("literal");',
			].join('\n'),
			{ 'overlay.txt': cssText },
		),
		[],
		'a shadowed identifier must not resolve to the raw import',
	);
	assert.deepEqual(
		walk(
			[
				`import * as rawStyles from './overlay.txt?raw';`,
				'export const probe = <style>{rawStyles.default}</style>;',
			].join('\n'),
			{ 'overlay.txt': cssText },
		).map((violation) => violation.ruleId),
		['z-index-declaration-not-on-scale'],
		'namespace-import style sink must red',
	);
	assert.deepEqual(
		walk(
			[
				`import * as rawStyles from './overlay.txt?raw';`,
				'export const probe = <style>{rawStyles.other}</style>;',
			].join('\n'),
			{ 'overlay.txt': cssText },
		),
		[],
		'a namespace member other than default must not resolve to the raw text',
	);
	assert.deepEqual(
		walk(
			[
				`import rawHtml from './page.html?raw';`,
				'export const probe = <div',
				'  dangerouslySetInnerHTML={{ __html: rawHtml }}',
				'/>;',
			].join('\n'),
			{ 'page.html': '<style>.evil { z-index: 2147483643; }</style>' },
		).map((violation) => violation.ruleId),
		['z-index-style-element-shipped'],
		'a raw HTML payload reaching innerHTML must be walked as HTML',
	);
});

test('e2e (round 13 I1/A2): every PostCSS failure shape is a named diagnostic', async () => {
	// Round 12 I1-A2: a mutation that keyed the raw style-sink catch on a
	// single `error.reason` (even the 'Unclosed comment' one) kept all 113
	// tests green while restoring a silent failure for every other parse
	// shape. The class assertion is a table spanning the reasons PostCSS can
	// produce — comment, block, bracket, string, and unknown-word failures —
	// so no single-reason narrowing can land green. The guard keys on
	// nothing: any parse failure is the named diagnostic.
	const failures = [
		['unclosed comment', '/*'],
		['unclosed block', '.probe { z-index: 2147483629'],
		['unclosed bracket', '.probe { z-index: calc(2147483629 }'],
		['unclosed string', '.probe { content: "2147483629 }'],
		['unknown word', '{{ brandColor }}'],
	];
	for (const [name, css] of failures) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': [
					`import rawProbeCss from './raw-probe.txt?raw';`,
					'export const probe = <style>{rawProbeCss}</style>;',
				].join('\n'),
				'raw-probe.txt': css,
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.deepEqual(
			violations.map(({ ruleId, file }) => ({ ruleId, file })),
			[{ ruleId: 'z-index-unparseable-static-css', file: 'src/raw-probe.txt' }],
			`${name} style-sink payload must be a named diagnostic: ${JSON.stringify(violations)}`,
		);
	}
});

test('e2e (round 11 I1/A3): a <style> raw sink with the binding after other children stays red', async () => {
	// The round-10 A3 mutation walked only the first child of a `<style>`
	// element's raw-sink scan. A binding that is not the first child — the
	// second or third — must still red, so a `children.slice(0, 1)`
	// simplification cannot land green.
	const cases: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
		['second', ["'{ .safe { color: red; } }'", 'rawCss']],
		[
			'third',
			[
				"'{ .safe { color: red; } }'",
				"'{ .cleaner { color: blue; } }'",
				'rawCss',
			],
		],
	];
	for (const [position, children] of cases) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': [
					`import rawCss from './overlay.txt?raw';`,
					'export const probe = <style>{',
					children.join('}{'),
					'}</style>;',
				].join('\n'),
				'overlay.txt': '.overlay { z-index: 2147483628; }',
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.ok(
			violations.some(
				(violation) =>
					violation.ruleId === 'z-index-declaration-not-on-scale' &&
					violation.file === 'src/overlay.txt',
			),
			`a ${position}-child raw sink must red: ${JSON.stringify(violations)}`,
		);
	}
});

test('raw sinks: a style-sink specifier resolving to no recorded module is a named diagnostic', () => {
	// The round-10 B2 half: the resolver's miss must fail loud by name, never
	// the silent compliant default. The build's record contains the module
	// (the binding exists), but the text map is missing its bytes — the
	// guard cannot inspect what ships.
	const baseDir = '/tmp/zindex-r11-unit';
	const violations = scanZIndexFile({
		scanner,
		relativePath: 'probe.tsx',
		content: [
			`import rawCss from './missing.txt?raw';`,
			'export const probe = <style>{rawCss}</style>;',
		].join('\n'),
		baseDir,
		rawTextPaths: new Set([path.join(baseDir, 'missing.txt')]),
		rawImportTexts: new Map([[path.join(baseDir, 'other.txt'), 'x']]),
	});
	assert.deepEqual(
		violations.map(({ ruleId, source }) => ({ ruleId, source })),
		[{ ruleId: 'z-index-unresolved-raw-import', source: './missing.txt?raw' }],
		`an unresolvable style-sink specifier must be a named diagnostic: ${JSON.stringify(violations)}`,
	);
});

test('raw sinks (round 17 audit): an unmappable queried specifier still fails loud by name', () => {
	// Round-15 was loud for a `?raw`-carrying specifier the guard cannot
	// resolve to a recorded module (an alias or otherwise unmappable
	// spelling): z-index-unresolved-raw-import at the style sink. The
	// round-17 hard rule forbids converting that loud failure into silence,
	// so the queried-but-unmappable class is recorded as an
	// unresolvable-query binding and stays loud — while a queried file the
	// build DID record under a non-raw query (`?url`, `?v=1`, …) is provably
	// not raw text and stays quiet, and a plain specifier is never a binding.
	const baseDir = '/tmp/zindex-r17-audit';
	const walk = (content: string) =>
		scanZIndexFile({
			scanner,
			relativePath: 'probe.tsx',
			content,
			baseDir,
			rawTextPaths: new Set([path.join(baseDir, 'other.txt')]),
			queriedPaths: new Set([path.join(baseDir, 'other.txt')]),
			rawImportTexts: new Map([
				[path.join(baseDir, 'other.txt'), '.other { color: red; }'],
			]),
		});
	assert.deepEqual(
		walk(
			[
				`import rawCss from '@aliased/other.txt?raw';`,
				'export const probe = <style>{rawCss}</style>;',
			].join('\n'),
		).map((violation) => violation.ruleId),
		['z-index-unresolved-raw-import'],
		'an unmappable queried specifier at a style sink must fail loud by name',
	);
	assert.deepEqual(
		walk(
			[
				`import rawCss from '@aliased/other.txt?raw';`,
				'export const probe = <pre>{rawCss}</pre>;',
			].join('\n'),
		),
		[],
		'displayed text stays green even for an unmappable queried specifier',
	);
	// A queried file the build recorded under a non-raw query is provably
	// not raw text.
	assert.deepEqual(
		walk(
			[
				`import assetUrl from './other.txt?url';`,
				'export const probe = <style>{assetUrl}</style>;',
			].join('\n'),
		),
		[],
		'a recorded non-raw queried import stays green',
	);
	// A plain specifier is never a binding.
	assert.deepEqual(
		walk(
			[
				`import helper from './helper.ts';`,
				'export const probe = <style>{helper}</style>;',
			].join('\n'),
		),
		[],
		'a plain import stays green',
	);
});

test('e2e (round 6 M2): scanner over an empty source root fails closed', async () => {
	await assert.rejects(
		runFixtureGuard(
			{ 'probe.ts': `export const probe = 'probe';` },
			'',
			[],
			null,
			null,
			`@import 'tailwindcss' source('./empty');`,
			['empty'],
		),
		/z-index guard scanned 0 files/,
	);
});

test('e2e (round 6 M2): no emitted CSS assets fails closed', async () => {
	await assert.rejects(
		runFixtureGuard(
			{ 'probe.ts': `export const probe = 'probe';` },
			'',
			[],
			null,
			async (root) => {
				await mkdir(path.join(root, 'dist'), { recursive: true });
				await writeFile(path.join(root, 'dist/not-css.txt'), 'x');
				return {
					emittedCssRoot: path.join(root, 'dist'),
					authoredCssPaths: [path.join(root, 'app.css')],
					authoredScriptPaths: [path.join(root, 'src/main.ts')],
					cleanup: async () => {},
				};
			},
		),
		/z-index guard found 0 emitted CSS assets/,
	);
});

test('e2e (round 6 M2): app.css missing from build provenance fails closed', async () => {
	await assert.rejects(
		runFixtureGuard(
			{ 'probe.ts': `export const probe = 'probe';` },
			'',
			[],
			null,
			async (root) => {
				await mkdir(path.join(root, 'dist'), { recursive: true });
				await writeFile(
					path.join(root, 'dist/fixture.css'),
					':root { --publy-z-raised: 10; }',
				);
				return {
					emittedCssRoot: path.join(root, 'dist'),
					authoredCssPaths: [],
					authoredScriptPaths: [path.join(root, 'src/main.ts')],
					cleanup: async () => {},
				};
			},
		),
		/build provenance did not include/,
	);
});

test('e2e (round 6 I1): static dangerouslySetInnerHTML payload with a <style> is red', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'export const probe = <div',
				'  dangerouslySetInnerHTML={{',
				"    __html: '<style>.probe { z-index: 2147483647; }</style>'",
				'  }}',
				'/>;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-style-element-shipped'],
		`dangerous HTML <style> payload must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 19 B3): an EOF-closed <style> in static HTML is walked, not silently skipped', async () => {
	// Browser fragment parsing closes an open raw-text style element at EOF
	// and applies its declarations, so omitting the closing `</style>` does
	// not make the CSS inert. The static-HTML scanner previously required a
	// closing tag; an unterminated `<style>` shipped its raw declaration
	// while the guard was green — an unparseable/partial input silently
	// treated as compliant (round-19 B3). It is now walked exactly like a
	// closed one.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'export const probe = <div',
				'  dangerouslySetInnerHTML={{',
				"    __html: '<style>.r18-eof-style { z-index: 2147483572; }'",
				'  }}',
				'/>;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-style-element-shipped'],
		`an EOF-closed <style> payload must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 6 I1): static dangerouslySetInnerHTML payload with a stylesheet <link> is red', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'export const probe = <div',
				'  dangerouslySetInnerHTML={{',
				'    __html: \'<link rel="stylesheet" href="data:text/css,.x%7Bz-index%3A99%7D">\'',
				'  }}',
				'/>;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-opaque-stylesheet-link'],
		`dangerous HTML <link> payload must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 6 I1): static dangerouslySetInnerHTML with harmless HTML stays green', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'export const probe = <div',
				'  dangerouslySetInnerHTML={{',
				'    __html: \'<p class="publy-probe-banner">probe</p>\',',
				'  }}',
				'/>;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(violations, []);
});

test('e2e (round 7 I1/I4): static <style dangerouslySetInnerHTML> is red in both JSX spellings', async () => {
	// The `dangerouslySetInnerHTML` spelling of a static `<style>` payload
	// ships the same raw CSS as the children spelling — including the
	// self-closing form, whose attributes live on a JsxSelfClosingElement.
	for (const element of [
		[
			'<style',
			'  dangerouslySetInnerHTML={{',
			"    __html: '.probe { z-index: 2147483643; }',",
			'  }}',
			'/>;',
		],
		[
			'<style',
			'  dangerouslySetInnerHTML={{',
			"    __html: '.probe { z-index: 2147483642; }',",
			'  }}',
			'></style>;',
		],
	]) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': ['export const probe = ', ...element].join('\n'),
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.deepEqual(
			violations.map((violation) => violation.ruleId),
			['z-index-style-element-shipped'],
			`dangerouslySetInnerHTML style payload must red: ${JSON.stringify(violations)}`,
		);
	}
});

test('e2e (round 7 I1): self-closing <style> with scale-routed CSS stays green', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'export const probe = <style',
				'  dangerouslySetInnerHTML={{',
				"    __html: '.probe { z-index: var(--publy-z-raised); }',",
				'  }}',
				'/>;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(violations, []);
});

test('e2e (round 7 audit): a static literal spread cannot smuggle a style payload', async () => {
	// `{...{dangerouslySetInnerHTML: {__html: …}}}` is the same static
	// payload spelled through a spread attribute; a static object literal is
	// transparent through the spread, exactly as the object-literal
	// descriptor rules already treat non-spread members. Round 8 I1 adds the
	// parenthesized payload spelling — `({__html: …})` is the same static
	// object behind a transparent parenthesis, and the spread member is
	// unwrapped before the object-literal test.
	for (const element of [
		[
			'<style',
			'  {...{ dangerouslySetInnerHTML: { __html:',
			"    '.probe { z-index: 2147483640; }',",
			'  } }}',
			'/>;',
		],
		[
			'<style',
			'  {...{ dangerouslySetInnerHTML: ({',
			"    __html: '.probe { z-index: 2147483637; }',",
			'  }) }}',
			'/>;',
		],
		[
			'<div',
			'  {...{ dangerouslySetInnerHTML: { __html:',
			"    '<style>.probe { z-index: 2147483639; }</style>',",
			'  } }}',
			'/>;',
		],
		[
			'<div',
			'  {...{ dangerouslySetInnerHTML: ({',
			"    __html: '<style>.probe { z-index: 2147483636; }</style>',",
			'  }) }}',
			'/>;',
		],
	]) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': ['export const probe = ', ...element].join('\n'),
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.deepEqual(
			violations.map((violation) => violation.ruleId),
			['z-index-style-element-shipped'],
			`spread-spelled style payload must red: ${JSON.stringify(violations)}`,
		);
	}
	const { violations: descriptorViolations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'export const probe = createRootRoute({ head: () => ({ links: [{',
				"  ...{ rel: 'stylesheet' },",
				"  href: 'data:text/css,.x%7Bz-index%3A99%7D',",
				'}] }) });',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		descriptorViolations.map((violation) => violation.ruleId),
		['z-index-opaque-stylesheet-link'],
		`spread-spelled descriptor rel must red: ${JSON.stringify(descriptorViolations)}`,
	);
});

test('e2e (round 11 B1): a module-scope const object-literal spread resolves like the literal spelling', async () => {
	// `{...props}` whose source is a module-scope `const` bound to an object
	// literal is the same static payload spelled through a binding — the
	// payload is raw, so it reds exactly like the non-spread spelling. Round
	// 9 treated every identifier spread as opaque; round 11 resolves the
	// resolvable one (the guard already follows module-scope string
	// constants) and names the genuinely opaque one instead of staying green.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'const props = { dangerouslySetInnerHTML: { __html:',
				"  '.probe { z-index: 2147483638; }',",
				'} };',
				'export const probe = <style {...props} />;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-style-element-shipped'],
		`a resolvable const spread must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 13 B1): an opaque-only spread in a provably style-capable position is a named diagnostic', async () => {
	// Round 13 policy: an opaque spread fails loud by name wherever the
	// position is *provably* style-capable — a `<style>` element (any
	// attribute could be dangerouslySetInnerHTML shipping CSS), a
	// dangerouslySetInnerHTML payload object, or a CSS.registerProperty()
	// descriptor — even when the spread is the only source, because "only
	// source" previously meant "no static fact to shadow" and therefore a
	// silent green for a payload the guard cannot inspect. The `<div
	// {...props}/>` shape is NOT provably a style host in this guard's
	// knowledge, so it stays in the runtime bucket — that is the paired
	// legitimate proof.
	const files = {
		'probe.tsx': [
			'export const probe = (props: any) => <style {...props} />;',
			'export const descriptor = (props: any) => ({ links: [{ ...props }] });',
			'export const plain = (props: any) => <div {...props} />;',
		].join('\n'),
	};
	const { violations } = await runFixtureGuard(files, '', [
		"import { probe, descriptor, plain } from './probe';",
	]);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-unresolved-spread-shadow'],
		`only the style element may fail loud: ${JSON.stringify(violations)}`,
	);
	const { violations: payloadViolations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'export const probe = (props: any) => <style',
				'  dangerouslySetInnerHTML={{ ...props }}',
				'/>;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		payloadViolations.map((violation) => violation.ruleId),
		['z-index-unresolved-spread-shadow'],
		`an opaque-only dSIH payload spread must fail loud: ${JSON.stringify(payloadViolations)}`,
	);
	const { violations: registrationViolations } = await runFixtureGuard(
		{
			'probe.ts': [
				'export const probe = (props: any) => CSS.registerProperty({ ...props });',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		registrationViolations.map((violation) => violation.ruleId),
		['z-index-unresolved-spread-shadow'],
		`an opaque-only registerProperty spread must fail loud: ${JSON.stringify(registrationViolations)}`,
	);
});

test('e2e (round 8 I4): a later unresolved spread shadows an earlier static style payload', async () => {
	// Source-order last-write-wins, mirrored from real object/JSX semantics:
	// `{...props}` may carry the attribute, so the earlier raw attribute no
	// longer reaches the rendered element — the payload moves to the runtime
	// bucket, where the guard cannot read it.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'const safeStyleProps = { dangerouslySetInnerHTML: { __html:',
				"  '.probe { z-index: var(--publy-z-raised); }',",
				'} };',
				'export const probe = <style',
				'  dangerouslySetInnerHTML={{',
				"    __html: '.probe { z-index: 2147483647; }',",
				'  }}',
				'  {...safeStyleProps}',
				'/>;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(violations, []);
});

test('e2e (round 8 I4): descriptor spreads obey source-order last-write-wins', async () => {
	// A later unresolved spread may carry `rel`, so the earlier static
	// `stylesheet` fact is invalidated and the descriptor leaves the guarded
	// class. The same spread BEFORE an explicit member does not hide it — the
	// explicit member establishes the fact again and the link stays red.
	const { violations: safeViolations } = await runFixtureGuard(
		{
			'probe.tsx': [
				"const runtimeLinkProps = { rel: 'preload' as const };",
				'export const probe = createRootRoute({ head: () => ({ links: [{',
				"  rel: 'stylesheet' as const,",
				'  ...runtimeLinkProps,',
				"  href: 'data:text/css,.probe%7Bz-index%3A2147483647%7D',",
				'}] }) });',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(safeViolations, []);
	const { violations: rawViolations } = await runFixtureGuard(
		{
			'probe.tsx': [
				"const runtimeLinkProps = { rel: 'preload' as const };",
				'export const probe = createRootRoute({ head: () => ({ links: [{',
				'  ...runtimeLinkProps,',
				"  rel: 'stylesheet' as const,",
				"  href: 'data:text/css,.probe%7Bz-index%3A2147483647%7D',",
				'}] }) });',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		rawViolations.map((violation) => violation.ruleId),
		['z-index-opaque-stylesheet-link'],
		`an explicit member after an unknown spread must red: ${JSON.stringify(rawViolations)}`,
	);
});

test('e2e (round 8 I4): an explicit raw payload after an unresolved spread stays red', async () => {
	// The reverse ordering: the explicit attribute comes after `{...props}`
	// and wins in JSX semantics, so the raw payload still ships.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				"const props = { className: 'probe' };",
				'export const probe = <style',
				'  {...props}',
				'  dangerouslySetInnerHTML={{',
				"    __html: '.probe { z-index: 2147483647; }',",
				'  }}',
				'/>;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-style-element-shipped'],
		`an explicit payload after an unknown spread must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 11 B1): registerProperty with a resolvable const spread stays red', async () => {
	// Round 9's shared-member clearing disarmed the token-registration rule
	// with five trailing characters: `{ name: … , ...runtime }` where
	// `runtime` is a module-scope const object literal. The spread resolves,
	// the `name` fact survives, and the registration stays red — the
	// round-10 reviewer's exact probe shape.
	const { violations } = await runFixtureGuard(
		{
			'probe.ts': [
				'const runtime = { inherits: false };',
				"export const probe = () => CSS.registerProperty({ name: '--publy-z-raised', syntax: '<integer>', ...runtime });",
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-scale-token-registered'],
		`a resolvable const spread must not disarm the registration rule: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 11 B1): a descriptor with a resolvable const spread stays red', async () => {
	// The same shared-member clearing disarmed the stylesheet-link rule: a
	// module-scope const object literal spread after static `rel`/`href`
	// facts must not hide them.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'const runtime = { id: 1 };',
				'export const probe = createRootRoute({ head: () => ({ links: [{',
				"  rel: 'stylesheet' as const,",
				"  href: 'data:text/css,.x%7Bz-index%3A99%7D',",
				'  ...runtime,',
				'}] }) });',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-opaque-stylesheet-link'],
		`a resolvable const spread must not disarm the link rule: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 11 B1): an unresolvable spread shadowing static facts is a named diagnostic', async () => {
	// The paired proof for the genuinely opaque spread: it may carry or
	// override the member, so the guard cannot verify what ships — that is a
	// named `z-index-unresolved-spread-shadow` diagnostic, never the silent
	// green the round-9 clearing produced. Parameterized over all three sites
	// the clearing reached: the `<style>` attribute list, the link
	// descriptor, and the CSS.registerProperty() argument object.
	const cases: ReadonlyArray<{
		name: string;
		files: Record<string, string>;
		expected: ReadonlyArray<string>;
	}> = [
		{
			name: 'style element',
			files: {
				'probe.tsx': [
					'export const probe = (props: any) => <style',
					"  dangerouslySetInnerHTML={{ __html: '.probe { z-index: 2147483647; }' }}",
					'  {...props}',
					'/>;',
				].join('\n'),
			},
			expected: ['z-index-unresolved-spread-shadow'],
		},
		{
			name: 'link descriptor',
			files: {
				'probe.tsx': [
					'export const probe = (props: any) => createRootRoute({ head: () => ({ links: [{',
					"  rel: 'stylesheet' as const,",
					"  href: 'data:text/css,.x%7Bz-index%3A99%7D',",
					'  ...props,',
					'}] }) });',
				].join('\n'),
			},
			expected: ['z-index-unresolved-spread-shadow'],
		},
		{
			name: 'registerProperty',
			files: {
				'probe.ts': [
					"export const probe = (props: any) => CSS.registerProperty({ name: '--publy-z-raised', ...props });",
				].join('\n'),
			},
			expected: ['z-index-unresolved-spread-shadow'],
		},
		{
			name: 'dSIH payload member',
			files: {
				'probe.tsx': [
					'export const probe = (props: any) => <div',
					'  dangerouslySetInnerHTML={{',
					"    __html: '<style>.probe { z-index: 9; }</style>',",
					'    ...props,',
					'  }}',
					'/>;',
				].join('\n'),
			},
			expected: ['z-index-unresolved-spread-shadow'],
		},
		{
			name: 'style-element dSIH payload member',
			files: {
				'probe.tsx': [
					'export const probe = (props: any) => <style',
					'  dangerouslySetInnerHTML={{',
					"    __html: '.probe { z-index: 2147483623; }',",
					'    ...props,',
					'  }}',
					'/>;',
				].join('\n'),
			},
			expected: ['z-index-unresolved-spread-shadow'],
		},
	];
	for (const { name, files, expected } of cases) {
		const { violations } = await runFixtureGuard(files, '', [
			"import { probe } from './probe';",
		]);
		assert.deepEqual(
			violations.map((violation) => violation.ruleId),
			expected,
			`${name} must fail loud by name: ${JSON.stringify(violations)}`,
		);
	}
});

test('e2e (round 11 B1): an opaque spread before an explicit member stays red without a diagnostic', async () => {
	// Last-write-wins cuts both ways: the explicit member after the spread
	// re-establishes the fact, so the link is provably a stylesheet and the
	// guard reports exactly that — no spread diagnostic on a provable value.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'export const probe = (props: any) => createRootRoute({ head: () => ({ links: [{',
				'  ...props,',
				"  rel: 'stylesheet' as const,",
				"  href: 'data:text/css,.x%7Bz-index%3A99%7D',",
				'}] }) });',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-opaque-stylesheet-link'],
		`explicit members after an opaque spread must stay red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 13 B1): const-object alias chains resolve to a fixpoint at any depth', async () => {
	// Round 12 B1: a two-hop const-object spread (`const b = a; <style
	// {...b} />` where `a` is a static object literal) looked "genuinely
	// opaque" to the one-hop resolver and shipped the raw payload green when
	// the spread was the only source. The resolver follows the alias chain to
	// a cycle-guarded fixpoint, so depth does not matter: 0, 1, 2, and 4 hops
	// red exactly like the literal spelling. "One step further" cannot defeat
	// the assertion because there is no bound left to step past.
	const payloadLines = [
		'const payload = { dangerouslySetInnerHTML: { __html:',
		"  '.probe { z-index: 2147483614; }',",
		'} };',
	];
	const chains = [
		['direct', [], 'payload'],
		['one hop', ['const last = payload;'], 'last'],
		['two hops', ['const second = payload;', 'const last = second;'], 'last'],
		[
			'four hops',
			[
				'const second = payload;',
				'const third = second;',
				'const fourth = third;',
				'const last = fourth;',
			],
			'last',
		],
	];
	for (const [name, aliasLines, sink] of chains) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': [
					...payloadLines,
					...aliasLines,
					`export const probe = <style {...${sink}} />;`,
				].join('\n'),
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.deepEqual(
			violations.map((violation) => violation.ruleId),
			['z-index-style-element-shipped'],
			`a ${name} const-object spread must red as the literal spelling: ${JSON.stringify(violations)}`,
		);
	}
});

test('e2e (round 13 B1): a spread const cycle terminates as an opaque named diagnostic', async () => {
	// A const-alias cycle (`const a = b; const b = a`) and an object-literal
	// spread cycle (`const a = {...b}; const b = {...a}`) must terminate —
	// the resolver treats the cycle as opaque and the provably style-capable
	// `<style>` host fails loud by name. Neither hangs the guard nor goes
	// quiet.
	for (const [name, lines, sink] of [
		['alias cycle', ['const a = b;', 'const b = a;'], 'a'],
		[
			'object spread cycle',
			['const a = { ...b };', 'const b = { ...a };'],
			'a',
		],
	]) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': [
					...lines,
					`export const probe = <style {...${sink}} />;`,
				].join('\n'),
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.deepEqual(
			violations.map((violation) => violation.ruleId),
			['z-index-unresolved-spread-shadow'],
			`a ${name} must terminate and fail loud by name: ${JSON.stringify(violations)}`,
		);
	}
});

test('e2e (round 13 B1): a shadowed module-scope const is not a spread source', async () => {
	// `nearestBinding` gates the const resolution: the parameter shadows the
	// module-scope `const`, so the spread inside the function is genuinely
	// opaque. Round 11 kept the opaque-only style-element spread green; round
	// 13 makes it fail loud by name, and the ruleId distinguishes the two —
	// removing the shadowing check would resolve the spread to the module
	// const and red `z-index-style-element-shipped` instead.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'const props = { dangerouslySetInnerHTML: { __html:',
				"  '.probe { z-index: 2147483647; }',",
				'} };',
				'export const probe = (props: any) => <style {...props} />;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-unresolved-spread-shadow'],
		`a shadowed const must stay opaque and fail loud by name: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 11 B1): the round-8 safe-payload reproduction stays green through resolution', async () => {
	// The legitimate case round 9 was narrowing for: a later resolvable
	// spread whose payload is scale-routed wins last-write-wins, so the
	// element ships safe CSS. Round 9 kept it green by clearing; round 11
	// keeps it green by actually resolving the payload.
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'const safeStyleProps = { dangerouslySetInnerHTML: { __html:',
				"  '.probe { z-index: var(--publy-z-raised); }',",
				'} };',
				'export const probe = <style',
				'  dangerouslySetInnerHTML={{',
				"    __html: '.probe { z-index: 2147483647; }',",
				'  }}',
				'  {...safeStyleProps}',
				'/>;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(violations, []);
});

test('e2e (round 11 M1): a non-static dangerouslySetInnerHTML suppresses children inspection', async () => {
	// The round-10 M1 probe: the code comment says a non-static dSIH payload
	// is the runtime bucket — React ignores children whenever dSIH is
	// present, so the children never ship as CSS. The code now matches the
	// comment. The second spelling pins that the *raw-sink walk* is
	// suppressed too: the binding would red as a style sink if the children
	// were inspected at all.
	const { violations: staticChildren } = await runFixtureGuard(
		{
			'probe.tsx': [
				'const runtime = {};',
				"export const probe = <style dangerouslySetInnerHTML={runtime}>{'.probe { z-index: 2147483626; }'}</style>;",
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		staticChildren,
		[],
		`children of a non-static dSIH <style> must not be inspected: ${JSON.stringify(staticChildren)}`,
	);
	const { violations: rawChild } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawCss from './overlay.txt?raw';`,
				'const runtime = {};',
				'export const probe = <style dangerouslySetInnerHTML={runtime}>{rawCss}</style>;',
			].join('\n'),
			'overlay.txt': '.overlay { z-index: 2147483625; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		rawChild,
		[],
		`a raw-binding child of a non-static dSIH <style> must not be walked: ${JSON.stringify(rawChild)}`,
	);
});

test('e2e (round 11 I1/A1): the transparent wrapper set at the spread member is equivalent', async () => {
	// The round-9 fix unwraps the spread member with the full transparent set
	// (parentheses, `as`, type assertions, non-null, `satisfies`). The round-7
	// test pins the parenthesized spelling only; this parameterizes the
	// remaining spellings of the same class, so a future simplification to a
	// parentheses-only unwrap (the round-10 A1 mutation) cannot land green.
	for (const payload of [
		"({ __html: '.probe { z-index: 2147483635; }' }) as never",
		"({ __html: '.probe { z-index: 2147483634; }' }) as const",
		"({ __html: '.probe { z-index: 2147483633; }' }) satisfies { __html: string }",
		"({ __html: '.probe { z-index: 2147483632; }' })!",
	]) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': [
					'export const probe = <style',
					`  {...{ dangerouslySetInnerHTML: ${payload} }}`,
					'/>;',
				].join('\n'),
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.deepEqual(
			violations.map((violation) => violation.ruleId),
			['z-index-style-element-shipped'],
			`transparent wrapper ${payload} must red: ${JSON.stringify(violations)}`,
		);
	}
});

test('e2e (round 13 I1/A1): nested transparent wrappers are unwrapped to a fixpoint', async () => {
	// Round 12 I1-A1: a mutation that unwrapped at most one semantic wrapper
	// plus parentheses at the spread-member site kept all 113 tests green
	// while `((object as const)!)` went silent. The unwrap loops until the
	// node stops changing, so the class assertion is depth: 2, 3, and 5
	// nested wrappers of mixed kinds red exactly like a single wrapper, on
	// the dSIH payload object, a static style child, and a ?raw style child.
	// "One step further" is not a spelling because there is no bound to step
	// past.
	const wrap = (payload: string, depth: number) => {
		let expression = payload;
		for (let index = 0; index < depth; index += 1) {
			expression = `(${expression})`;
		}
		return expression;
	};
	const wrappers = [
		['two parentheses', wrap('PAYLOAD', 2)],
		['three mixed', wrap('(PAYLOAD as const)!', 2)],
		[
			'five mixed',
			wrap('(((PAYLOAD satisfies { __html: string }) as never)!) as const', 3),
		],
	];
	for (const [name, wrapped] of wrappers) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': [
					'export const probe = <style',
					`  dangerouslySetInnerHTML={${wrapped.replace('PAYLOAD', "{ __html: '.probe { z-index: 2147483596; }' }")}}`,
					'/>;',
				].join('\n'),
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.deepEqual(
			violations.map((violation) => violation.ruleId),
			['z-index-style-element-shipped'],
			`nested ${name} on a dSIH payload must red: ${JSON.stringify(violations)}`,
		);
	}
	for (const [name, wrapped] of wrappers) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': [
					`export const probe = <style>{${wrapped.replace('PAYLOAD', "'.probe { z-index: 2147483595; }'")}}</style>;`,
				].join('\n'),
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.deepEqual(
			violations.map((violation) => violation.ruleId),
			['z-index-style-element-shipped'],
			`nested ${name} on a static style child must red: ${JSON.stringify(violations)}`,
		);
	}
	const { violations: rawViolations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawCss from './overlay.txt?raw';`,
				`export const probe = <style>{${wrap('rawCss', 6)}}</style>;`,
			].join('\n'),
			'overlay.txt': '.overlay { z-index: 2147483593; }',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.ok(
		rawViolations.some(
			(violation) =>
				violation.ruleId === 'z-index-declaration-not-on-scale' &&
				violation.file === 'src/overlay.txt',
		),
		`six nested wrappers on a raw style child must red: ${JSON.stringify(rawViolations)}`,
	);
});

test('e2e (round 13 I1/A3): a raw binding at the last child position reds for any child count', async () => {
	// Round 12 I1-A3: a mutation that walked `node.children.slice(0, 3)`
	// kept all 113 tests green while a raw binding in child four went
	// silent. The walk iterates every child, so the class assertion
	// generates the binding at the LAST position for child counts that
	// extend beyond any fixed slice — 3, 4, 6, and 9 children. The last
	// position moves with the count, so no slice bound of any size can pass.
	const safeChildren = (count: number) =>
		Array.from(
			{ length: count - 1 },
			(_, index) => `'{ .safe-${index} { color: red; } }'`,
		);
	for (const count of [3, 4, 6, 9]) {
		const { violations } = await runFixtureGuard(
			{
				'probe.tsx': [
					`import rawCss from './overlay.txt?raw';`,
					'export const probe = <style>{',
					[...safeChildren(count), 'rawCss'].join('}{'),
					'}</style>;',
				].join('\n'),
				'overlay.txt': '.overlay { z-index: 2147483592; }',
			},
			'',
			["import { probe } from './probe';"],
		);
		assert.ok(
			violations.some(
				(violation) =>
					violation.ruleId === 'z-index-declaration-not-on-scale' &&
					violation.file === 'src/overlay.txt',
			),
			`a ${count}-child raw sink with the binding last must red: ${JSON.stringify(violations)}`,
		);
	}
});

test('e2e (round 7 M1): unparseable static <style> payload is a named diagnostic, not a crash', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'export const probe = <style>{`{{ brandColor }}`}</style>;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map(({ ruleId, file }) => ({ ruleId, file })),
		[{ ruleId: 'z-index-unparseable-static-css', file: 'src/probe.tsx' }],
	);
	assert.match(
		violations[0].message,
		/cannot be parsed as CSS \(Unknown word brandColor\)/,
	);
});

test('e2e (round 7 M1): unparseable static HTML <style> payload is a named diagnostic', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				'export const probe = <div',
				'  dangerouslySetInnerHTML={{',
				"    __html: '<style>{{ brandColor }}</style>',",
				'  }}',
				'/>;',
			].join('\n'),
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.deepEqual(
		violations.map(({ ruleId, file }) => ({ ruleId, file })),
		[{ ruleId: 'z-index-unparseable-static-css', file: 'src/probe.tsx' }],
	);
	assert.match(violations[0].message, /cannot be parsed as CSS \(Unknown word/);
});

test('e2e (round 7 M1): ?raw CSS that cannot be parsed is a named diagnostic', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`import rawCss from './overlay.css?raw';`,
				`export const probe = <style>{rawCss}</style>;`,
			].join('\n'),
			'overlay.css': '{{ brandColor }}',
		},
		'',
		["import { probe } from './probe';"],
	);
	assert.ok(
		violations.some(
			(violation) =>
				violation.ruleId === 'z-index-unparseable-static-css' &&
				violation.file === 'src/overlay.css',
		),
		`unparseable raw-shipped CSS must be a named diagnostic: ${JSON.stringify(violations)}`,
	);
	// A CSS-language `?raw` module is recorded as inline CSS and walked by the
	// inline gate; the sink walk must not double-report it as unresolved.
	assert.ok(
		!violations.some(
			(violation) => violation.ruleId === 'z-index-unresolved-raw-import',
		),
		`inline-recorded ?raw CSS must not be reported unresolved: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 5 audit): build-reachable static script escapes are red', async () => {
	const { violations } = await runFixtureGuard(
		{
			'../shared/escape.ts': [
				"export const head = createRootRoute({ head: () => ({ links: [{ rel: 'stylesheet' as const, href: 'data:text/css,.x%7Bz-index%3A99%7D' }] }) });",
				"globalThis.CSS.registerProperty({ name: '--publy-z-raised' as const, inherits: false, initialValue: '99' });",
			].join('\n'),
		},
		'',
		["import '../shared/escape';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['z-index-opaque-stylesheet-link', 'z-index-scale-token-registered'],
	);
});

test('e2e (round 5 policy): a build-reachable second scale stylesheet stays red', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.ts': `export const probe = 'probe';`,
			'second-scale.css': ':root { --publy-z-second-sheet: 130; }',
		},
		'',
		[`import './second-scale.css';`],
	);
	assert.ok(
		violations.some(
			(violation) =>
				violation.file === 'src/second-scale.css' &&
				violation.source === '--publy-z-second-sheet: 130',
		),
		`reachable split scale must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 5 minor 2): identical authored text cannot hide a distinct shipped violation', async () => {
	const source = '--publy-z-suppression: 999';
	const { violations } = await runFixtureGuard(
		{ 'probe.ts': `export const probe = 'probe';` },
		`.authored-probe { ${source}; }\n`,
		[],
		`.dependency-probe { ${source}; z-index: var(--publy-z-suppression); }`,
	);
	assert.deepEqual(
		violations.map(({ file, source: violationSource }) => ({
			file,
			source: violationSource,
		})),
		[
			{ file: 'app.css', source },
			{ file: 'dist/fixture.css', source },
			{
				file: 'dist/fixture.css',
				source: 'z-index: var(--publy-z-suppression)',
			},
		],
	);
});

test('e2e (blocker 1): @source inline("z-5") + \'z-\' + 5 concatenation is red via the compiled gate', async () => {
	const { violations } = await runFixtureGuard(
		{ 'concat.tsx': `export const view = <div className={'z-' + 5} />;` },
		`@source inline("z-5");\n`,
	);
	assert.ok(violations.length > 0, 'expected the generated .z-5 rule to red');
	// the concatenation itself is source-invisible (no literal candidate); the
	// red is the shipped `.z-5 { z-index: 5 }` rule, which the selector-bound
	// allowlist no longer exempts.
	assert.ok(
		violations.every((violation) => isCompiledCssFile(violation.file)),
		`unexpected source violations: ${JSON.stringify(violations)}`,
	);
	assert.deepEqual(
		violations.map((violation) => violation.source),
		['z-index: 5'],
	);
});

test('e2e (blocker 1): [z-index:5] arbitrary property is red at source and in the compiled gate', async () => {
	const { violations } = await runFixtureGuard({
		'arbitrary.tsx': `export const view = <div className="[z-index:5]" />;`,
	});
	const sourceViolations = violations.filter((violation) =>
		(violation.file ?? '').includes('arbitrary.tsx'),
	);
	const compiledViolations = violations.filter((violation) =>
		isCompiledCssFile(violation.file),
	);
	assert.ok(
		sourceViolations.some((violation) => violation.source === '[z-index:5]'),
		`expected a source violation for the shim: ${JSON.stringify(violations)}`,
	);
	assert.ok(
		compiledViolations.some((violation) => violation.source === 'z-index: 5'),
		`expected a compiled violation for the shim: ${JSON.stringify(violations)}`,
	);
});

test('e2e (blocker 2): uppercase Z-INDEX property in an @utility is red', async () => {
	const { violations } = await runFixtureGuard(
		{ 'probe.tsx': `export const view = <div className="layer-probe" />;` },
		'@utility layer-probe { Z-INDEX: 50; }\n',
	);
	assert.ok(
		violations.some(
			(violation) =>
				isCompiledCssFile(violation.file) && violation.source === 'z-index: 50',
		),
		`expected the uppercase property to red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (blocker 2): escaped z-\\69ndex property in an @utility is red', async () => {
	const { violations } = await runFixtureGuard(
		{ 'probe.tsx': `export const view = <div className="layer-probe" />;` },
		'@utility layer-probe { z-\\69ndex: 50; }\n',
	);
	assert.ok(
		violations.some(
			(violation) =>
				isCompiledCssFile(violation.file) && violation.source === 'z-index: 50',
		),
		`expected the escaped property to red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (blocker 3): both !important spellings of a scale utility stay green', async () => {
	const { violations } = await runFixtureGuard({
		'important-suffix.tsx': `export const view = <div className="z-(--publy-z-raised)!" />;`,
		'important-prefix.tsx': `export const view = <div className="!z-(--publy-z-raised)" />;`,
	});
	assert.deepEqual(
		violations,
		[],
		`scale utilities with !important must stay green: ${JSON.stringify(violations)}`,
	);
});

const assertAncestryMutationIsRed = async (mutation: string) => {
	const { violations } = await runFixtureGuard(
		{ 'probe.tsx': 'export const probe = <div />;' },
		`${mutation}\n`,
	);
	assert.deepEqual(
		violations.map((violation) => violation.source),
		['z-index: 5'],
		`expected the changed ancestry to red: ${JSON.stringify(violations)}`,
	);

	const cleanRule = `${STICKY_HEADER_SELECTOR} { z-index: 5; }`;
	const { violations: cleanViolations } = await runFixtureGuard(
		{ 'probe.tsx': 'export const probe = <div />;' },
		`@layer components { ${cleanRule} }\n`,
	);
	assert.deepEqual(
		cleanViolations,
		[],
		`expected only the real @layer ancestry to stay green: ${JSON.stringify(cleanViolations)}`,
	);
};

test('e2e (round 3 blocker 1): an outer rule changes the allowlisted ancestry', async () => {
	const cleanRule = `${STICKY_HEADER_SELECTOR} { z-index: 5; }`;
	await assertAncestryMutationIsRed(
		`@layer components { .evil { ${cleanRule} } }`,
	);
});

test('e2e (round 3 blocker 1): @media changes the allowlisted ancestry', async () => {
	const cleanRule = `${STICKY_HEADER_SELECTOR} { z-index: 5; }`;
	await assertAncestryMutationIsRed(
		`@layer components { @media (min-width: 1px) { ${cleanRule} } }`,
	);
});

test('e2e (round 3 blocker 1): @supports changes the allowlisted ancestry', async () => {
	const cleanRule = `${STICKY_HEADER_SELECTOR} { z-index: 5; }`;
	await assertAncestryMutationIsRed(
		`@layer components { @supports (display: grid) { ${cleanRule} } }`,
	);
});

test('e2e (round 3 blocker 1): the allowance requires the expected @layer', async () => {
	const cleanRule = `${STICKY_HEADER_SELECTOR} { z-index: 5; }`;
	await assertAncestryMutationIsRed(`@layer utilities { ${cleanRule} }`);
});

test('e2e (round 3 blocker 2): CSS // custom-property value cannot hide the next declaration', async () => {
	const { violations } = await runFixtureGuard(
		{ 'probe.tsx': 'export const probe = <div />;' },
		'.probe { --marker: //; z-index: 50; }\n',
	);
	assert.deepEqual(
		violations.map((violation) => violation.source),
		['z-index: 50'],
		`expected exactly one compiled violation: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 3 important 1): braces in a custom-property value stay clean', async () => {
	const { violations } = await runFixtureGuard(
		{ 'probe.tsx': 'export const probe = <div />;' },
		'.probe { --payload: { z-index: 50; }; }\n',
	);
	assert.deepEqual(
		violations,
		[],
		`custom-property payload is not a z-index declaration: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 3 important 2): CSS keywords and function names are ASCII-case-insensitive', async () => {
	const { violations } = await runFixtureGuard({
		'probe.tsx':
			'export const probe = <div className="z-[AUTO] z-[InHeRiT] z-[VAR(--publy-z-raised)]" />;',
	});
	assert.deepEqual(
		violations,
		[],
		`case variants must stay green: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 3 important 3): escaped important is decoded before comparison', async () => {
	const { violations } = await runFixtureGuard(
		{ 'probe.tsx': 'export const probe = <div />;' },
		'.probe { z-index: var(--publy-z-raised) !\\69mportant; }\n',
	);
	assert.deepEqual(
		violations,
		[],
		`escaped important must stay green: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 3 audit): local scale-token definitions cannot smuggle raw stacking values', async () => {
	const { violations } = await runFixtureGuard(
		{ 'probe.tsx': 'export const probe = <div />;' },
		[
			'.shadow { --publy-z-raised: 999; z-index: var(--publy-z-raised); }',
			'.rogue { --publy-z-rogue: 998; z-index: var(--publy-z-rogue); }',
		].join('\n'),
	);
	assert.deepEqual(
		violations.map((violation) => violation.source),
		[
			'--publy-z-raised: 999',
			'--publy-z-rogue: 998',
			'--publy-z-raised: 999',
			'--publy-z-rogue: 998',
			'z-index: var(--publy-z-rogue)',
		],
		`local scale-token definitions must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 3 audit): adding a tier in the global scale stays clean', async () => {
	const { violations } = await runFixtureGuard(
		{ 'probe.tsx': 'export const probe = <div />;' },
		':root { --publy-z-new-tier: 130; }\n.probe { z-index: var(--publy-z-new-tier); }\n',
	);
	assert.deepEqual(
		violations,
		[],
		`a global scale tier must stay green: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 3 audit): script code cannot shadow a scale token', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx':
				'export const probe = <div className="z-(--publy-z-raised)" style={{ "--publy-z-raised": 999 }} />;\nelement.style.setProperty("--publy-z-menu", "997");',
		},
		'',
		["import './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.source),
		['--publy-z-raised', '--publy-z-menu'],
		`script scale-token definitions must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 4 blocker 3): module const setProperty key cannot shadow a scale token', async () => {
	const { violations } = await runFixtureGuard(
		{
			'probe.tsx': [
				`const TOKEN = '--publy-z-raised';`,
				`export const probe = <div className="z-(--publy-z-raised)" />;`,
				`element.style.setProperty(TOKEN, '990');`,
			].join('\n'),
		},
		'',
		["import './probe';"],
	);
	assert.deepEqual(
		violations.map((violation) => violation.source),
		['--publy-z-raised'],
		`module const token writes must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 4 important 1): imported root token override is rejected by provenance', async () => {
	const { violations } = await runFixtureGuard(
		{
			'component.ts': `import './override.css';\nexport const component = 'probe';`,
			'override.css': ':root { --publy-z-raised: 998; }',
		},
		'',
		[
			`import { component } from './component';`,
			`document.body.dataset.fixture = component;`,
		],
	);
	assert.ok(
		violations.some(
			(violation) =>
				violation.file === 'src/override.css' &&
				violation.source === '--publy-z-raised: 998',
		),
		`imported token definitions must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 4 important 1): duplicate canonical tiers are rejected', async () => {
	const { violations } = await runFixtureGuard(
		{ 'probe.ts': `export const probe = 'probe';` },
		':root { --publy-z-raised: 998; }\n',
	);
	assert.ok(
		violations.some(
			(violation) =>
				violation.ruleId === 'z-index-scale-token-duplicate' &&
				violation.source === '--publy-z-raised: 998',
		),
		`duplicate tiers must red: ${JSON.stringify(violations)}`,
	);
});

test('e2e (round 3 audit): escaped and spaced safe values stay clean', async () => {
	const { violations } = await runFixtureGuard(
		{ 'probe.tsx': 'export const probe = <div />;' },
		[
			'.escaped-keyword { z-index: \\61uto; }',
			'.spaced-var { z-index: VAR( --publy-z-raised ); }',
			'.escaped-var { z-index: v\\61r(--publy-z-r\\61ised); }',
		].join('\n'),
	);
	assert.deepEqual(
		violations,
		[],
		`CSS-equivalent safe values must stay green: ${JSON.stringify(violations)}`,
	);
});

test('e2e (innocent #987 scoping): component 1 stays green on the innocent constructs; their shipped pollution is a compiled-gate true positive', async () => {
	// Issue #987's "no false positive on the innocent case" acceptance is
	// scoped to the SOURCE pass, and the round-21 report must say so (I5): a
	// `z-50` literal in a type literal, a `data-example` attribute, or a
	// comparand still makes the production scanner emit a `.z-50` rule into
	// the shipped stylesheet, because the extractor is blind to context. That
	// pollution is a true positive at the compiled gate, not a false positive
	// on the source construct — the test keeps this expectation explicit so
	// "innocent" never again implies "fully green end to end".
	const innocentFiles = {
		'type-literal.d.ts': `export type Layer = 'z-50';`,
		'data-example.tsx':
			'export const view = <div data-example="z-50" aria-label="z-50" />;',
		'comparand.tsx': `export const view = <div className={kind === 'z-50' ? 'active' : 'idle'} />;`,
		'z-auto.tsx': `export const view = <div className="z-auto" />;`,
		'css-selector.css': `[data-example=".z-50"] { color: red; }`,
		'clean-template.tsx': `export const view = <div className={\`px-\${size} mt-\${margin}\`} />;`,
		'data-tip-template.tsx': `export const view = <div data-tip={\`z-\${level}\`} />;`,
	};
	const { violations } = await runFixtureGuard(innocentFiles);
	// component 1 stays green on every innocent construct — every violation is
	// a compiled-gate emission, none names a fixture file.
	assert.ok(
		violations.every((violation) => isCompiledCssFile(violation.file)),
		`innocent construct produced a source violation: ${JSON.stringify(violations)}`,
	);
	// the three z-50 literals collapse into one shipped `.z-50` rule, which the
	// selector-bound allowlist does NOT exempt — proving a rule generated from
	// an innocent literal cannot activate the allowlist (blocker 1).
	assert.deepEqual(
		violations.map((violation) => violation.source),
		['z-index: 50'],
		`unexpected compiled violations: ${JSON.stringify(violations)}`,
	);
	// the same tree minus the z-50 literals is fully green end to end — z-auto
	// and the CSS-selector case genuinely pass through the production scanner.
	const clean = Object.fromEntries(
		Object.entries(innocentFiles).filter(
			([relative]) =>
				relative !== 'type-literal.d.ts' &&
				relative !== 'data-example.tsx' &&
				relative !== 'comparand.tsx',
		),
	) as Record<string, string>;
	const { violations: cleanViolations } = await runFixtureGuard(clean);
	assert.deepEqual(
		cleanViolations,
		[],
		`expected the z-50-free innocent tree to stay green: ${JSON.stringify(cleanViolations)}`,
	);
});

// ---------------------------------------------------------------------------
// The live repository check — zero violations on the tree under test.
// ---------------------------------------------------------------------------
test('unmodified repository passes with zero violations', async () => {
	// The live-tree check runs one real production build (this is the suite's
	// "one full scan per run"). The same invocation also pins the round-6 I2
	// invariant — the build must record both the client and the SSR entry, or
	// SSR-only modules (src/server.ts) silently drop out of the script pass —
	// reusing this build instead of paying for a second one.
	const frontDir = path.resolve(scriptsDir, '..');
	let capturedBuild: ProductionBuildResult | null = null;
	const { violations, candidateCount, fileCount } = await runZIndexGuard({
		productionBuild: async () => {
			capturedBuild = await buildProductionApp(frontDir);
			return capturedBuild;
		},
	});
	assert.deepEqual(
		violations,
		[],
		`unexpected violations: ${JSON.stringify(violations, null, 2)}`,
	);
	assert.ok(fileCount > 300, `expected a real scan, got ${fileCount} files`);
	assert.ok(
		candidateCount > 10000,
		`expected real candidates, got ${candidateCount}`,
	);
	const recordedBuild: ProductionBuildResult | null = capturedBuild;
	assert.ok(recordedBuild != null, 'the production build must be captured');
	const scripts = recordedBuild.authoredScriptPaths.map((filePath: string) =>
		path.resolve(filePath),
	);
	assert.ok(
		scripts.includes(path.resolve(frontDir, 'src/server.ts')),
		'src/server.ts must be recorded as build-reachable (SSR environment)',
	);
	assert.ok(
		scripts.includes(path.resolve(frontDir, 'src/client.tsx')),
		'src/client.tsx must be recorded as build-reachable (client environment)',
	);
});
