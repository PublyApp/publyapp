import { describe, expect, test } from 'vitest';

import { assertUsableCompiledCss } from './compiled-app-css';

/**
 * #1405 — the guard must fail LOUD on unparseable input, never measure a
 * half-delivered stylesheet. These pins target the node-side structural
 * gate that runs on EVERY read of the compiled asset, before any browser
 * session is spent on it: empty output, truncation (unbalanced braces),
 * and output that is valid CSS but plainly not the Tailwind v4 production
 * stylesheet this guard's contract is written against.
 */
describe('assertUsableCompiledCss', () => {
	test('accepts a structurally sound production-shaped stylesheet', () => {
		const sound = [
			'@property --tw-outline-style{syntax:"*";inherits:false;initial-value:solid}',
			'@layer theme{:root{--publy-focus-ring:#a16207}}',
			'@layer utilities{.focus-visible\\:ring-3:focus-visible{--tw-ring-shadow:var(--tw-empty,)!important;box-shadow:var(--tw-ring-shadow)}}',
		].join('\n');
		expect(() => assertUsableCompiledCss(sound)).not.toThrow();
	});

	test('throws on empty output', () => {
		expect(() => assertUsableCompiledCss('')).toThrow(/empty/i);
		expect(() => assertUsableCompiledCss('   \n  ')).toThrow(/empty/i);
	});

	test('throws on truncated output (unbalanced braces)', () => {
		const truncated =
			'@layer theme{:root{--publy-focus-ring:#a16207}}\n@layer utilities{.focus-visible\\:ring-3:focus-visible{box-shadow:var(--tw-ring-shadow)';
		expect(() => assertUsableCompiledCss(truncated)).toThrow(
			/truncated|unbalanced/i,
		);
	});

	test('throws on output that carries none of the production markers', () => {
		// Balanced, non-empty, but unmistakably not the app stylesheet.
		expect(() => assertUsableCompiledCss('a{color:red}')).toThrow(
			/not .*production|marker/i,
		);
	});
});
