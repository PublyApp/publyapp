import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import {
	countExactSelectorRules,
	resolveEffectiveDeclarations,
} from './css-cascade-test-support';

// #992 review follow-up: the pencil-pin affordance's fill/glyph tokens must
// clear the repo's non-text contrast floor against the surface it sits on,
// in both themes. A test that hardcodes the two hex values would prove
// nothing about the actual shipped CSS (it would still pass after someone
// changed the rule to use a different, non-compliant token) — this reads
// the real `.publy-profile-detail-tile-pin` rule out of app.css, resolves
// whichever `--publy-*` token it actually references for `color` in each
// theme, and computes contrast against the real `--publy-surface` token.
//
// IMPORTANT finding A (review round 2): the original version of this file
// used a non-global regex that only ever looked at the FIRST
// `.publy-profile-detail-tile-pin { ... }` block, so a later, equal-
// specificity rule silently overriding it was invisible here. Token
// resolution now goes through `resolveEffectiveDeclarations()`
// (css-cascade-test-support.ts), which collects every top-level rule that
// exactly matches the selector and resolves last-declaration-wins per
// property — the "at minimum" cascade-aware fix. The stronger, "better
// where observable" fix is a real-browser check: this is a plain rendered
// DOM element with ordinary CSS (unlike #975's unrenderable
// `::-webkit-search-cancel-button` pseudo-element), so a real Chromium
// `getComputedStyle()` reading is fully achievable here — see
// `e2e/profile-icon-picker-pin-contrast.spec.ts`, which is the actual
// authority on the effective cascade — closing round 3's specificity blind
// spot completely, since it measures the LIVE component's real class list.
// This file is a fast defense-in-depth companion; the shared resolver
// (css-cascade-test-support.ts) now also handles selector specificity,
// `!important`, and conditional-`@media`/`@supports`/`@container` nesting
// within a deliberately bounded scope — see that module's doc comment for
// exactly what remains out of scope.
const rootDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const appCss = readFileSync(path.join(rootDir, 'app.css'), 'utf8');
const NON_TEXT_CONTRAST_FLOOR = 3.0;

type Rgb = { r: number; g: number; b: number };

const extractBlock = (header: ':root' | 'html.dark'): string => {
	const start = appCss.indexOf(`${header} {`);
	if (start === -1) {
		throw new Error(`Missing ${header} theme block`);
	}

	let depth = 0;
	for (let index = start; index < appCss.length; index += 1) {
		if (appCss[index] === '{') {
			depth += 1;
		} else if (appCss[index] === '}') {
			depth -= 1;
			if (depth === 0) {
				return appCss.slice(start, index + 1);
			}
		}
	}

	throw new Error(`Unclosed ${header} theme block`);
};

const findHexToken = (block: string, token: string): string | undefined => {
	const match = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6});`).exec(block);
	return match?.[1];
};

/** `html.dark` only overrides the tokens that actually differ from `:root`
 * (mirrors the real cascade — an un-overridden token falls back to `:root`). */
const resolveThemeHexToken = (
	header: ':root' | 'html.dark',
	token: string,
): string => {
	if (header === 'html.dark') {
		const darkValue = findHexToken(extractBlock(header), token);
		if (darkValue) {
			return darkValue;
		}
	}

	const rootValue = findHexToken(extractBlock(':root'), token);
	if (!rootValue) {
		throw new Error(`Missing hex token ${token}`);
	}
	return rootValue;
};

const parseHex = (hex: string): Rgb => ({
	r: Number.parseInt(hex.slice(1, 3), 16),
	g: Number.parseInt(hex.slice(3, 5), 16),
	b: Number.parseInt(hex.slice(5, 7), 16),
});

const relativeLuminance = ({ r, g, b }: Rgb): number => {
	const linearize = (channel: number): number => {
		const value = channel / 255;
		if (value <= 0.04045) {
			return value / 12.92;
		}
		return ((value + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrastRatio = (
	foregroundHex: string,
	backgroundHex: string,
): number => {
	const foregroundLuminance = relativeLuminance(parseHex(foregroundHex));
	const backgroundLuminance = relativeLuminance(parseHex(backgroundHex));
	const lighter = Math.max(foregroundLuminance, backgroundLuminance);
	const darker = Math.min(foregroundLuminance, backgroundLuminance);

	return (lighter + 0.05) / (darker + 0.05);
};

const PIN_SELECTOR = '.publy-profile-detail-tile-pin';

/** Resolves the EFFECTIVE (last-declaration-wins across every matching
 * rule block — see css-cascade-test-support.ts) `--publy-*` token that
 * `.publy-profile-detail-tile-pin`'s `color` declaration actually
 * references — fails loudly if the rule is missing or its effective
 * `color` is not a plain `var(--publy-*)` reference, rather than silently
 * falling back to an assumed token name. */
const resolvePinForegroundToken = (): string => {
	const declarations = resolveEffectiveDeclarations(appCss, PIN_SELECTOR);
	const color = declarations.get('color');
	const colorMatch = color ? /^var\((--publy-[\w-]+)\)$/.exec(color) : null;
	if (!colorMatch) {
		throw new Error(
			'.publy-profile-detail-tile-pin has no resolvable effective `color: var(--publy-*)` declaration',
		);
	}
	return colorMatch[1];
};

const resolvePinBackgroundToken = (): string => {
	const declarations = resolveEffectiveDeclarations(appCss, PIN_SELECTOR);
	const background = declarations.get('background');
	const backgroundMatch = background
		? /^var\((--publy-[\w-]+)\)$/.exec(background)
		: null;
	if (!backgroundMatch) {
		throw new Error(
			'.publy-profile-detail-tile-pin has no resolvable effective `background: var(--publy-*)` declaration',
		);
	}
	return backgroundMatch[1];
};

describe('profile icon-picker pencil-pin contrast (#992)', () => {
	const foregroundToken = resolvePinForegroundToken();
	const backgroundToken = resolvePinBackgroundToken();

	test('the rule references resolvable --publy-* tokens for both color and background (sanity: not hardcoded values)', () => {
		expect(foregroundToken).toMatch(/^--publy-[\w-]+$/);
		expect(backgroundToken).toMatch(/^--publy-[\w-]+$/);
	});

	test.each([
		['light', ':root'],
		['dark', 'html.dark'],
	] as const)(
		`pin foreground/background token pair clears the ${NON_TEXT_CONTRAST_FLOOR}:1 non-text floor in the %s theme`,
		(_theme, header) => {
			const foreground = resolveThemeHexToken(header, foregroundToken);
			const background = resolveThemeHexToken(header, backgroundToken);

			expect(
				contrastRatio(foreground, background),
				`${foregroundToken} (${foreground}) on ${backgroundToken} (${background})`,
			).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST_FLOOR);
		},
	);

	// Evasion proof: confirms this test would actually have caught the
	// reviewed regression — the pin's original foreground token,
	// --publy-foreground-subtle, does NOT clear the floor against
	// --publy-surface in the light theme (~2.56:1).
	test('the previously-used --publy-foreground-subtle token would NOT have cleared the floor on --publy-surface in light mode (regression proof)', () => {
		const foreground = resolveThemeHexToken(
			':root',
			'--publy-foreground-subtle',
		);
		const background = resolveThemeHexToken(':root', '--publy-surface');

		expect(contrastRatio(foreground, background)).toBeLessThan(
			NON_TEXT_CONTRAST_FLOOR,
		);
	});

	test('exactly one rule currently targets .publy-profile-detail-tile-pin (sanity check for the cascade regression proof below)', () => {
		expect(countExactSelectorRules(appCss, PIN_SELECTOR)).toBe(1);
	});

	// IMPORTANT finding A regression proof (review round 2): reproduces the
	// reviewer's exact mutation — appending a LATER, equal-specificity rule
	// for the same exact selector that reverts `color` to the non-compliant
	// `--publy-foreground-subtle` token. The original first-match
	// implementation stayed green (4/4 pass) under this exact mutation
	// against the real app.css. `resolveEffectiveDeclarations()` must report
	// the later (winning) declaration, and the resulting effective contrast
	// must fall below the floor.
	test('a later duplicate rule for the exact same selector overrides the effective colour (cascade regression proof)', () => {
		const mutatedCss = `${appCss}\n.publy-profile-detail-tile-pin {\n\tcolor: var(--publy-foreground-subtle);\n}\n`;

		expect(countExactSelectorRules(mutatedCss, PIN_SELECTOR)).toBe(2);

		const declarations = resolveEffectiveDeclarations(mutatedCss, PIN_SELECTOR);
		expect(declarations.get('color')).toBe('var(--publy-foreground-subtle)');

		const foreground = resolveThemeHexToken(
			':root',
			'--publy-foreground-subtle',
		);
		const background = resolveThemeHexToken(':root', '--publy-surface');
		expect(contrastRatio(foreground, background)).toBeLessThan(
			NON_TEXT_CONTRAST_FLOOR,
		);
	});

	// Prefix-leak guard (same defect family as the design-system radius
	// allowlist): an unrelated selector merely starting with this class name
	// must not be mistaken for the real rule.
	test('does not match a longer selector that merely starts with the same class name', () => {
		const decoyOnlyCss =
			'.publy-profile-detail-tile-pin-impostor {\n\tcolor: var(--publy-foreground-subtle);\n\tbackground: var(--publy-surface);\n}\n';

		expect(countExactSelectorRules(decoyOnlyCss, PIN_SELECTOR)).toBe(0);
		expect(() =>
			resolveEffectiveDeclarations(decoyOnlyCss, PIN_SELECTOR),
		).toThrow();
	});

	// Round 3 review: the real-browser spec
	// (e2e/profile-icon-picker-pin-contrast.spec.ts) now measures the LIVE
	// component and is the actual authority on these three cascade shapes for
	// the pin. These are a defense-in-depth supplement proving the shared
	// resolver (css-cascade-test-support.ts) itself now handles them too —
	// see search-input.test.tsx for the same three proofs against the one
	// selector that has NO browser backstop at all.

	// Specificity regression proof: the reviewer's exact mutation — a
	// higher-specificity compound selector appending the pin's own
	// `ring-background` class.
	test('a higher-specificity compound selector overrides the effective colour regardless of source order (specificity regression proof)', () => {
		const mutatedCss = `.publy-profile-detail-tile-pin.ring-background {\n\tcolor: var(--publy-foreground-subtle);\n}\n${appCss}`;

		const declarations = resolveEffectiveDeclarations(mutatedCss, PIN_SELECTOR);
		expect(declarations.get('color')).toBe('var(--publy-foreground-subtle)');

		const foreground = resolveThemeHexToken(
			':root',
			'--publy-foreground-subtle',
		);
		const background = resolveThemeHexToken(':root', '--publy-surface');
		expect(contrastRatio(foreground, background)).toBeLessThan(
			NON_TEXT_CONTRAST_FLOOR,
		);
	});

	// `!important` regression proof: an earlier `!important` declaration must
	// beat the real rule's later plain declaration for the same property.
	test('an earlier !important declaration beats the real rule (importance regression proof)', () => {
		const mutatedCss = `${PIN_SELECTOR} {\n\tcolor: var(--publy-foreground-subtle) !important;\n}\n${appCss}`;

		const declarations = resolveEffectiveDeclarations(mutatedCss, PIN_SELECTOR);
		expect(declarations.get('color')).toBe('var(--publy-foreground-subtle)');
		// `background` is untouched by the `!important` rule.
		expect(declarations.get('background')).toBe('var(--publy-surface)');
	});

	// `@media` regression proof: reproduces the reviewer's exact mutation —
	// the sole rule wrapped in a non-matching `@media` query — using a
	// synthetic decoy (mirroring the prefix-leak test above), since the real
	// app.css legitimately keeps this rule inside `@layer components`
	// (unconditional grouping, not gated) and this proof is specifically
	// about conditional at-rules, not `@layer`.
	test('a sole rule wrapped in a non-matching @media query is not resolved as unconditional (media regression proof)', () => {
		const decoyCss = `@media (max-width: 0px) {\n${PIN_SELECTOR} {\n\tcolor: var(--publy-foreground-muted);\n\tbackground: var(--publy-surface);\n}\n}\n`;

		expect(() =>
			resolveEffectiveDeclarations(decoyCss, PIN_SELECTOR),
		).toThrow();
	});
});
