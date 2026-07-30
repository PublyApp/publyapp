import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

// #992 review follow-up: the pencil-pin affordance's fill/glyph tokens must
// clear the repo's non-text contrast floor against the surface it sits on,
// in both themes. A test that hardcodes the two hex values would prove
// nothing about the actual shipped CSS (it would still pass after someone
// changed the rule to use a different, non-compliant token) — this reads
// the real `.publy-profile-detail-tile-pin` rule out of app.css, resolves
// whichever `--publy-*` token it actually references for `color` in each
// theme, and computes contrast against the real `--publy-surface` token.
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
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
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

/** Extracts the real `.publy-profile-detail-tile-pin { ... }` rule body from
 * app.css and pulls out the `--publy-*` token its `color` declaration
 * actually references — fails loudly if the rule is missing or its `color`
 * is not a plain `var(--publy-*)` reference, rather than silently falling
 * back to an assumed token name. */
const resolvePinForegroundToken = (): string => {
	const ruleMatch = /\.publy-profile-detail-tile-pin\s*\{([^}]*)\}/.exec(
		appCss,
	);
	if (!ruleMatch) {
		throw new Error('Missing .publy-profile-detail-tile-pin rule in app.css');
	}
	const colorMatch = /\bcolor:\s*var\((--publy-[\w-]+)\)/.exec(ruleMatch[1]);
	if (!colorMatch) {
		throw new Error(
			'.publy-profile-detail-tile-pin has no resolvable `color: var(--publy-*)` declaration',
		);
	}
	return colorMatch[1];
};

const resolvePinBackgroundToken = (): string => {
	const ruleMatch = /\.publy-profile-detail-tile-pin\s*\{([^}]*)\}/.exec(
		appCss,
	);
	if (!ruleMatch) {
		throw new Error('Missing .publy-profile-detail-tile-pin rule in app.css');
	}
	const backgroundMatch = /\bbackground:\s*var\((--publy-[\w-]+)\)/.exec(
		ruleMatch[1],
	);
	if (!backgroundMatch) {
		throw new Error(
			'.publy-profile-detail-tile-pin has no resolvable `background: var(--publy-*)` declaration',
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
});
