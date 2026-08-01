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

import {
	buildProductionApp,
	classifyZUtility,
	checkAuthoredCssScaleDefinitions,
	checkCompiledCssZIndex,
	KNOWN_RAW_Z_INDEX_DECLARATIONS,
	runZIndexGuard,
	scanZIndexFile,
	stripComments,
} from './check-zindex-guard.mjs';

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
const buildViteFixture = async (root) => buildProductionApp(root);

const runFixtureGuard = async (
	files,
	appCssExtra = '',
	entryImports = [],
	emittedCssOverride = null,
	productionBuildOverride = null,
	appCssOverride = null,
	extraDirectories = [],
) => {
	// `emittedCssOverride` is a single `{ file, content }` entry or an array
	// of them, so tests can pin gates that only fire across assets.
	const emittedOverrides = Array.isArray(emittedCssOverride)
		? emittedCssOverride
		: emittedCssOverride == null
			? []
			: [{ file: 'fixture.css', content: emittedCssOverride }];
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

const violationsFor = (relativePath, content) =>
	scanZIndexFile({ scanner, relativePath, content });

const assertRaw = (relativePath, content) => {
	const violations = violationsFor(relativePath, content);
	assert.ok(
		violations.length > 0,
		`expected a violation for ${relativePath}: ${JSON.stringify(content)}`,
	);
	return violations;
};

const assertClean = (relativePath, content) => {
	const violations = violationsFor(relativePath, content);
	assert.deepEqual(
		violations.map((violation) => violation.source),
		[],
		`expected no violations for ${relativePath}: ${JSON.stringify(content)}`,
	);
};

// Compiled-gate violations come from the emitted assets of the real build
// (`emitted/<relative>` display paths, since the guard-owned output directory
// lives in the OS temp root) or from an override fixture under `dist/`.
const isCompiledCssFile = (file) =>
	file === 'compiled stylesheet' ||
	file.startsWith('dist/') ||
	file.startsWith('emitted/');

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
		"const head = { links: [{ rel: 'stylesheet', href: 'data:text/css,.x%7Bz-index%3A99%7D' }] };",
		[
			"const REL = 'stylesheet';",
			"const HREF = 'https://cdn.example/theme.css';",
			'const head = { links: [{ rel: REL, href: HREF }] };',
		].join('\n'),
		[
			"const rel = 'stylesheet';",
			"const href = 'https://cdn.example/theme.css';",
			'const head = { links: [{ rel, href }] };',
		].join('\n'),
		"<link rel={'stylesheet' as const} href={('https://cdn.example/theme.css')} />",
		"const head = { links: [{ rel: ('stylesheet' satisfies string), href: 'https://cdn.example/theme.css' as const }] };",
	]) {
		const violations = violationsFor('fixture.tsx', content);
		assert.deepEqual(
			violations.map((violation) => violation.ruleId),
			['z-index-opaque-stylesheet-link'],
			content,
		);
	}
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
const inComponentsLayer = (css) => `@layer components { ${css} }`;

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
	// asset with an uppercase extension cannot skip the compiled gate.
	const { violations } = await runFixtureGuard(
		{ 'probe.ts': `export const probe = 'probe';` },
		'',
		[],
		[{ file: 'FIXTURE.CSS', content: '.probe { z-index: 2147483641; }' }],
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
			async () => ({
				cleanup: async () => {
					cleaned = true;
				},
			}),
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
	const scriptPath = path.join(scriptsDir, 'check-zindex-guard.mjs');
	const child = spawn(process.execPath, [scriptPath], {
		cwd: path.join(scriptsDir, '..'),
		stdio: 'ignore',
	});
	let created = [];
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
	// descriptor rules already treat non-spread members.
	for (const element of [
		[
			'<style',
			'  {...{ dangerouslySetInnerHTML: { __html:',
			"    '.probe { z-index: 2147483640; }',",
			'  } }}',
			'/>;',
		],
		[
			'<div',
			'  {...{ dangerouslySetInnerHTML: { __html:',
			"    '<style>.probe { z-index: 2147483639; }</style>',",
			'  } }}',
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
				'export const probe = { links: [{',
				"  ...{ rel: 'stylesheet' },",
				"  href: 'data:text/css,.x%7Bz-index%3A99%7D',",
				'}] };',
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

test('e2e (round 7 audit): a spread whose source is not a static literal stays in the runtime bucket', async () => {
	// `{...props}` with a module-scope object is the declared data-flow
	// boundary (the guard does not trace object identifiers), so it stays
	// green — matching the helper/import-produced spread exemption.
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
	assert.deepEqual(violations, []);
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
});

test('e2e (round 5 audit): build-reachable static script escapes are red', async () => {
	const { violations } = await runFixtureGuard(
		{
			'../shared/escape.ts': [
				"export const head = { links: [{ rel: 'stylesheet' as const, href: 'data:text/css,.x%7Bz-index%3A99%7D' }] };",
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
		violation.file.includes('arbitrary.tsx'),
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

const assertAncestryMutationIsRed = async (mutation) => {
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

test('e2e (innocent): innocent constructs through the production scanner', async () => {
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
	const clean = { ...innocentFiles };
	delete clean['type-literal.d.ts'];
	delete clean['data-example.tsx'];
	delete clean['comparand.tsx'];
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
	let capturedBuild = null;
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
	const scripts = capturedBuild.authoredScriptPaths.map((filePath) =>
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
