/**
 * Harness test for `publy/no-native-html-in-mui-surfaces` (issue #350, PR JS.5,
 * tracking #500).
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into Node's
 * built-in `node:test` runner — same approach as `prefer-specific-lodash-imports`.
 *
 * What this proves:
 * - Plugin wiring: `index.js` exposes `rules['no-native-html-in-mui-surfaces']`
 *   pointing at the same rule object exported from the rule module.
 * - `valid`: MUI components in product TSX, native HTML in marketing surfaces,
 *   non-JSX `.ts` files, and inline SVG elements report nothing.
 * - `invalid`: native HTML elements in product-surface TSX files report with
 *   MUI replacement guidance and no autofix.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin from '../index.js';
import * as noNativeHtmlRuleModule from './no-native-html-in-mui-surfaces.js';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'no-native-html-in-mui-surfaces';
const { noNativeHtmlInMuiSurfaces } = noNativeHtmlRuleModule;

const EXPECTED_SVG_ELEMENTS = [
	'svg',
	'path',
	'circle',
	'g',
	'rect',
	'line',
	'polyline',
	'polygon',
	'ellipse',
	'text',
	'use',
	'defs',
	'clipPath',
	'mask',
	'symbol',
	'tspan',
	'linearGradient',
	'radialGradient',
	'stop',
	'pattern',
	'marker',
	'image',
	'foreignObject',
];

const remainingNativeHtmlCases = [
	{ tagName: 'span', jsx: '<span>Inline</span>' },
	{ tagName: 'h2', jsx: '<h2>Heading</h2>' },
	{ tagName: 'h3', jsx: '<h3>Heading</h3>' },
	{ tagName: 'h4', jsx: '<h4>Heading</h4>' },
	{ tagName: 'h5', jsx: '<h5>Heading</h5>' },
	{ tagName: 'h6', jsx: '<h6>Heading</h6>' },
	{ tagName: 'p', jsx: '<p>Copy</p>' },
	{ tagName: 'select', jsx: '<select name="status" />' },
	{ tagName: 'textarea', jsx: '<textarea name="notes" />' },
	{ tagName: 'label', jsx: '<label>Email</label>' },
	{ tagName: 'ul', jsx: '<ul />' },
	{ tagName: 'ol', jsx: '<ol />' },
	{ tagName: 'li', jsx: '<li />' },
	{ tagName: 'nav', jsx: '<nav />' },
	{ tagName: 'header', jsx: '<header />' },
	{ tagName: 'footer', jsx: '<footer />' },
	{ tagName: 'section', jsx: '<section />' },
	{ tagName: 'article', jsx: '<article />' },
	{ tagName: 'aside', jsx: '<aside />' },
	{ tagName: 'main', jsx: '<main />' },
	{ tagName: 'a', jsx: '<a href="/settings">Settings</a>' },
	{ tagName: 'img', jsx: '<img alt="Preview" src="/preview.png" />' },
].map(({ tagName, jsx }) => ({
	code: `const Component = () => ${jsx};`,
	filename: `apps/old-front/src/components/native-${tagName}.tsx`,
	errors: [{ messageId: tagName }],
}));

const marketingExceptionCases = [
	{
		code: 'const Hero = () => <div />;',
		filename: 'apps/old-front/src/components/marketing/hero.tsx',
	},
	{
		code: 'const Front2 = () => <div />;',
		filename: 'apps/front/src/components/page-card.tsx',
	},
	{
		code: 'const Banner = () => <section><h2>Marketing</h2></section>;',
		filename: 'apps/old-front/src/components/_marketing-banner.tsx',
	},
];

const svgExceptionCases = [
	{
		code: 'const Icon = () => <svg><circle cx="1" cy="1" r="1" /></svg>;',
		filename: 'apps/old-front/src/components/icon-circle.tsx',
	},
	{
		code: 'const Icon = () => <svg><g /></svg>;',
		filename: 'apps/old-front/src/components/icon-group.tsx',
	},
	{
		code: 'const Icon = () => <svg><rect width="1" height="1" /></svg>;',
		filename: 'apps/old-front/src/components/icon-rect.tsx',
	},
	{
		code: 'const Icon = () => <svg><line x1="0" y1="0" x2="1" y2="1" /></svg>;',
		filename: 'apps/old-front/src/components/icon-line.tsx',
	},
	{
		code: 'const Icon = () => <svg><polyline points="0,0 1,1" /></svg>;',
		filename: 'apps/old-front/src/components/icon-polyline.tsx',
	},
	{
		code: 'const Icon = () => <svg><polygon points="0,0 1,1 1,0" /></svg>;',
		filename: 'apps/old-front/src/components/icon-polygon.tsx',
	},
	{
		code: 'const Icon = () => <svg><ellipse cx="1" cy="1" rx="1" ry="1" /></svg>;',
		filename: 'apps/old-front/src/components/icon-ellipse.tsx',
	},
	{
		code: 'const Icon = () => <svg><text>Label</text></svg>;',
		filename: 'apps/old-front/src/components/icon-text.tsx',
	},
	{
		code: 'const Icon = () => <svg><use href="#shape" /></svg>;',
		filename: 'apps/old-front/src/components/icon-use.tsx',
	},
	{
		code: 'const Icon = () => <svg><defs /></svg>;',
		filename: 'apps/old-front/src/components/icon-defs.tsx',
	},
	{
		code: 'const Icon = () => <svg><clipPath id="clip" /></svg>;',
		filename: 'apps/old-front/src/components/icon-clip-path.tsx',
	},
	{
		code: 'const Icon = () => <svg><mask id="mask" /></svg>;',
		filename: 'apps/old-front/src/components/icon-mask.tsx',
	},
	{
		code: 'const Icon = () => <svg><symbol id="shape" /></svg>;',
		filename: 'apps/old-front/src/components/icon-symbol.tsx',
	},
	{
		code: 'const Icon = () => <svg><text><tspan>Label</tspan></text></svg>;',
		filename: 'apps/old-front/src/components/icon-tspan.tsx',
	},
];

// ── SVG allowlist guard ─────────────────────────────────────────────────────
describe('SVG_ELEMENTS guard', () => {
	it('lists inline SVG tags explicitly exempted from native HTML reporting', () => {
		assert.ok(
			noNativeHtmlRuleModule.SVG_ELEMENTS instanceof Set,
			'SVG_ELEMENTS should be exported as a Set',
		);
		assert.deepEqual(
			[...noNativeHtmlRuleModule.SVG_ELEMENTS],
			EXPECTED_SVG_ELEMENTS,
		);
	});
});

// ── Plugin entrypoint wiring assertion ──────────────────────────────────────
describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], noNativeHtmlInMuiSurfaces);
	});
});

// ── RuleTester cases ────────────────────────────────────────────────────────
const ruleTester = new RuleTester();

const runCases = (rule, label) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
			valid: [
				{
					code: 'const Component = () => <Box />;',
					filename: 'apps/old-front/src/components/page-card.tsx',
				},
				{
					code: 'const Hero = () => <div />;',
					filename: 'apps/old-front/src/routes/marketing/home.tsx',
				},
				{
					code: 'const Hero = () => <div />;',
					filename: 'apps/old-front/src/routes/marketing/home.jsx',
				},
				{
					code: "const template = '<div></div>';",
					filename: 'apps/old-front/src/components/template.ts',
				},
				{
					code: 'const Icon = () => <svg><path d="M0 0h1v1z" /></svg>;',
					filename: 'apps/old-front/src/components/icon.tsx',
				},
				...marketingExceptionCases,
				...svgExceptionCases,
			],
			invalid: [
				{
					code: 'const Component = () => <div />;',
					filename: 'apps/old-front/src/components/page-card.tsx',
					errors: [{ messageId: 'div' }],
				},
				{
					code: 'const Component = () => <h1>Title</h1>;',
					filename: 'apps/old-front/src/components/page-heading.tsx',
					errors: [{ messageId: 'h1' }],
				},
				{
					code: 'const Component = () => <h1>Title</h1>;',
					filename: 'apps/old-front/src/components/page-heading.jsx',
					errors: [{ messageId: 'h1' }],
				},
				{
					code: 'const Component = () => <button type="button" />;',
					filename: 'apps/old-front/src/routes/staff/users.tsx',
					errors: [{ messageId: 'button' }],
				},
				{
					code: 'const Component = () => <input name="email" />;',
					filename: 'apps/old-front/src/layouts/authenticated-shell.tsx',
					errors: [{ messageId: 'input' }],
				},
				...remainingNativeHtmlCases,
			],
		});
	});
};

runCases(noNativeHtmlInMuiSurfaces, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
