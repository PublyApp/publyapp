import { describe, expect, test } from 'vitest';

import { assertFocusRingUtilitiesPinned } from './compiled-focus-ring-pins';

/**
 * #1415 — the OUTLINE_TOKEN_ALLOWLIST tells the rendered guard an allowlisted
 * primitive may paint NO outline because its `:focus-visible` contract is the
 * box-shadow RING (`focus-visible:ring-3`/`ring-2` + `focus-visible:border-ring`
 * over `outline-none`, DESIGN.md "Focus rings"). Until now nothing asserted the
 * OTHER half of that bargain: the compiled production stylesheet must actually
 * carry those ring rules. A primitive could keep `outline: none` and silently
 * lose the ring — focus invisible, guard green (#1415's exact defect report).
 *
 * These pins target the node-side structural gate that runs on EVERY read of
 * the compiled asset (same fail-loud slot as `assertUsableCompiledCss`):
 *
 * - ZERO `:focus-visible` rules declaring `--tw-ring-shadow` must fail loud,
 *   never degrade into "0 rules → pass".
 * - The 3px family (`button`, `badge`, `input`, `textarea`, `select`,
 *   `switch`) and the 2px family (`checkbox`) must each survive in compiled
 *   form: at least one rule whose `--tw-ring-shadow` reaches the pinned
 *   spread. Tailwind v4 emits the spread inside `calc(<N>px +
 *   var(--tw-ring-offset-width))`, so a `ring-0`/`ring-1` regression parses
 *   out BELOW the pin and goes red.
 * - Resting chrome shadows (card elevation etc.) declare `box-shadow` without
 *   `:focus-visible` and must never satisfy the pin.
 */

const RING_RULE_3PX =
	'@layer utilities{.focus-visible\\:ring-3:focus-visible{' +
	'--tw-ring-shadow:var(--tw-ring-inset,)0 0 0 calc(3px + var(--tw-ring-offset-width))var(--tw-ring-color,currentColor);' +
	'box-shadow:var(--tw-inset-shadow),var(--tw-inset-ring-shadow),var(--tw-ring-offset-shadow),var(--tw-ring-shadow),var(--tw-shadow)}}';

const RING_RULE_2PX =
	'@layer utilities{.focus-visible\\:ring-2:focus-visible{' +
	'--tw-ring-shadow:var(--tw-ring-inset,)0 0 0 calc(2px + var(--tw-ring-offset-width))var(--tw-ring-color,currentColor);' +
	'box-shadow:var(--tw-inset-shadow),var(--tw-inset-ring-shadow),var(--tw-ring-offset-shadow),var(--tw-ring-shadow),var(--tw-shadow)}}';

describe('assertFocusRingUtilitiesPinned', () => {
	test('accepts a compiled sheet carrying both pinned ring families', () => {
		const sheet = [
			'@property --tw-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}',
			RING_RULE_3PX,
			RING_RULE_2PX,
		].join('\n');
		expect(() => assertFocusRingUtilitiesPinned(sheet)).not.toThrow();
	});

	test('fails loud when the sheet has NO :focus-visible ring rule at all', () => {
		// Balanced, marker-carrying CSS whose only focus-visible rule paints an
		// outline — the box-shadow-ring family the allowlist cites is GONE.
		const sheet = [
			':root{--publy-focus-ring:#a16207}',
			'a:focus-visible{outline:2px solid var(--publy-focus-ring)}',
		].join('\n');
		expect(() => assertFocusRingUtilitiesPinned(sheet)).toThrow(
			/no :focus-visible.*ring rule|0 rules/i,
		);
	});

	test('fails loud when the widest focus-visible ring tops out below 3px', () => {
		// The `ring-0`/`ring-1` hole: the rule EXISTS but its spread regressed.
		const shrunk3px = RING_RULE_3PX.replaceAll('calc(3px ', 'calc(1px ');
		const sheet = [
			'@property --tw-ring-shadow{syntax:"*"}',
			shrunk3px,
			RING_RULE_2PX,
		].join('\n');
		expect(() => assertFocusRingUtilitiesPinned(sheet)).toThrow(
			/widest.*1px|below the pinned 3px/i,
		);
	});

	test('ignores resting chrome shadows without :focus-visible', () => {
		const sheet = [
			'@property --tw-ring-shadow{syntax:"*"}',
			'.bg-card{box-shadow:0 12px 12px -3px #0005}',
			'[data-slot=input]{box-shadow:0 1px 2px #0008}',
			RING_RULE_2PX,
		].join('\n');
		// The 2px rule alone satisfies the 2px family pin but the 3px family
		// pin still finds nothing focus-visible-shaped at 3px.
		expect(() => assertFocusRingUtilitiesPinned(sheet)).toThrow(
			/no :focus-visible.*ring rule|below the pinned 3px|widest/i,
		);
	});
});
