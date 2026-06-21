/**
 * Harness test for `publy/no-raw-img-in-product-surfaces` (issue #350 JS.8,
 * PR #526).
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into Node's
 * built-in `node:test` runner.
 *
 * What this proves:
 * - Plugin wiring: `index.js` exposes rules["no-raw-img-in-product-surfaces"].
 * - `valid`: marketing surfaces, `<Image ratio="...">`, inline SVG, brand
 *   wordmark paths, and explicit full-bleed background opt-outs report nothing.
 * - `invalid`: raw `<img>` and Box-like `component="img"` usage in product
 *   TSX files reports with Image primitive guidance and no autofix.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin from '../index.js';
import * as noRawImgRuleModule from './no-raw-img-in-product-surfaces.js';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'no-raw-img-in-product-surfaces';
const { noRawImgInProductSurfaces } = noRawImgRuleModule;

describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], noRawImgInProductSurfaces);
	});
});

const ruleTester = new RuleTester();

const runCases = (rule, label) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
			valid: [
				{
					code: 'const Hero = () => <img alt="Hero" src="/hero.png" />;',
					filename: 'apps/front/src/routes/marketing/home/hero.tsx',
				},
				{
					code: [
						'import { Image } from "#app/components/image/image.tsx";',
						'const Avatar = () => <Image alt="User" src="/user.png" ratio="1/1" />;',
					].join('\n'),
					filename: 'apps/front/src/components/user-avatar.tsx',
				},
				{
					code: 'const Icon = () => <svg><path d="M0 0h1v1z" /></svg>;',
					filename: 'apps/front/src/components/icon.tsx',
				},
				{
					code: 'const Logo = () => <img alt="Publy" src="/logo.svg" />;',
					filename: 'apps/front/src/components/brand/publy-wordmark.tsx',
				},
				{
					code: 'const Logo = () => <Box component="img" alt="Publy" src="/logo.svg" />;',
					filename: 'apps/front/src/components/logo/logo.tsx',
				},
				{
					code: 'const Preview = () => <img alt="Front 2 preview" src="/front-2.png" />;',
					filename: 'apps/front-2/src/components/upload-preview.tsx',
				},
				{
					code: 'const Preview = () => <img alt="Front 2 preview" src="/front-2.png" />;',
					filename: 'apps/front-2/src/components/upload-preview.jsx',
				},
				{
					code: [
						'const Hero = () => (',
						'\t<>',
						'\t\t{/* publy-allow full-bleed-background */}',
						'\t\t<Box component="img" alt="" src="/hero.jpg" />',
						'\t</>',
						');',
					].join('\n'),
					filename: 'apps/front/src/layouts/auth-split/section.tsx',
				},
			],
			invalid: [
				{
					code: 'const Preview = () => <img alt="Preview" src="/preview.png" />;',
					filename: 'apps/front/src/components/upload-preview.tsx',
					errors: [{ messageId: 'rawImg' }],
				},
				{
					code: 'const Preview = () => <img alt="Preview" src="/preview.png" />;',
					filename: 'apps/front/src/components/upload-preview.jsx',
					errors: [{ messageId: 'rawImg' }],
				},
				{
					code: 'const Preview = () => <Box component="img" alt="Preview" src="/preview.png" />;',
					filename: 'apps/front/src/components/upload-preview.tsx',
					errors: [{ messageId: 'rawImg' }],
				},
				{
					code: 'const Preview = () => <CardMedia component="img" alt="Preview" src="/preview.png" />;',
					filename: 'apps/front/src/routes/authed/staff/preview.tsx',
					errors: [{ messageId: 'rawImg' }],
				},
			],
		});
	});
};

runCases(noRawImgInProductSurfaces, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
