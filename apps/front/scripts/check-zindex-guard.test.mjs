import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Scanner } from '@tailwindcss/oxide';
import tailwindcss from '@tailwindcss/vite';
import { build as viteBuild } from 'vite';

import {
	classifyZUtility,
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

const FIXTURE_APP_CSS = `@import 'tailwindcss' source('./src');
@theme inline {
  --publy-z-raised: 10;
  --publy-z-menu: 100;
}
`;

// Runs the full guard against an isolated fixture tree. The tree lives under
// `scripts/` so `@import 'tailwindcss'` resolves from `apps/front/node_modules`
// (it would not resolve from the OS tmpdir) while staying invisible to the real
// guard, whose scanner only watches `src/**`.
const buildViteFixture = async (root) => {
	await viteBuild({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [tailwindcss()],
		build: { outDir: 'dist' },
	});
};

const runFixtureGuard = async (files, appCssExtra = '', entryImports = []) => {
	const root = await mkdtemp(path.join(scriptsDir, 'zindex-guard-'));
	try {
		await mkdir(path.join(root, 'src'), { recursive: true });
		await writeFile(path.join(root, 'app.css'), FIXTURE_APP_CSS + appCssExtra);
		for (const [relativePath, content] of Object.entries(files)) {
			const absolutePath = path.join(root, 'src', relativePath);
			await mkdir(path.dirname(absolutePath), { recursive: true });
			await writeFile(absolutePath, content);
		}
		await writeFile(
			path.join(root, 'index.html'),
			'<div id="app"></div><script type="module" src="/src/main.ts"></script>',
		);
		await writeFile(
			path.join(root, 'src/main.ts'),
			[`import '../app.css';`, ...entryImports].join('\n'),
		);
		const result = await runZIndexGuard({
			baseDir: root,
			appCssPath: path.join(root, 'app.css'),
			emittedCssRoot: path.join(root, 'dist'),
			productionBuild: () => buildViteFixture(root),
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

const isCompiledCssFile = (file) =>
	file === 'compiled stylesheet' || file.startsWith('dist/');

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
		['--publy-z-raised: 999', '--publy-z-rogue: 998'],
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
	const { violations } = await runFixtureGuard({
		'probe.tsx':
			'export const probe = <div className="z-(--publy-z-raised)" style={{ "--publy-z-raised": 999 }} />;\nelement.style.setProperty("--publy-z-menu", "997");',
	});
	assert.deepEqual(
		violations.map((violation) => violation.source),
		['--publy-z-raised', '--publy-z-menu'],
		`script scale-token definitions must red: ${JSON.stringify(violations)}`,
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
	const { violations, candidateCount, fileCount } = await runZIndexGuard();
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
});
