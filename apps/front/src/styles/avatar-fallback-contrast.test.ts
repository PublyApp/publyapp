import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { resolveThemeToken } from './theme-token-test-support';

const rootDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const appCss = readFileSync(path.join(rootDir, 'app.css'), 'utf8');
const SMALL_TEXT_CONTRAST_FLOOR = 4.5;
const AVATAR_BACKGROUND_TOKENS = [
	'--publy-avatar-1',
	'--publy-avatar-2',
	'--publy-avatar-3',
	'--publy-avatar-4',
	'--publy-avatar-5',
	'--publy-avatar-6',
	'--publy-avatar-7',
	'--publy-avatar-8',
] as const;

type Rgb = { r: number; g: number; b: number };

const resolveThemeHexToken = (
	header: ':root' | 'html.dark',
	token: string,
): string => {
	// #2360: tokens may be aliases onto radan-ui; resolve through both sheets.
	return resolveThemeToken(token, header === 'html.dark' ? 'dark' : 'light');
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

const contrastRatio = (foreground: string, background: string): number => {
	const foregroundLuminance = relativeLuminance(parseHex(foreground));
	const backgroundLuminance = relativeLuminance(parseHex(background));
	const lighter = Math.max(foregroundLuminance, backgroundLuminance);
	const darker = Math.min(foregroundLuminance, backgroundLuminance);

	return (lighter + 0.05) / (darker + 0.05);
};

const mixOver = (top: string, alpha: number, under: string): string => {
	const a = parseHex(top);
	const b = parseHex(under);
	const channel = (x: number, y: number): string =>
		Math.round(x * alpha + y * (1 - alpha))
			.toString(16)
			.padStart(2, '0');
	return `#${channel(a.r, b.r)}${channel(a.g, b.g)}${channel(a.b, b.b)}`;
};

// #2360: pairs whose colours now come from radan-ui through aliases (and
// through `--color-input`, which app.css deliberately keeps on the field
// hairline). Measured on the page surface; a field on a card is a pre-existing
// 4.44:1 light / 4.48:1 dark and is not part of this pin.
describe('radan-ui aliased text pairs', () => {
	test.each(['light', 'dark'] as const)(
		'input placeholder clears AA on a bg-input/50 field over the page in the %s theme',
		(theme) => {
			const inputToken = /--color-input:\s*var\((--[\w-]+)\)/.exec(appCss)?.[1];
			expect(inputToken).toBeDefined();
			const page = resolveThemeToken('--radan-ui-background', theme);
			const fill = mixOver(
				resolveThemeToken(inputToken as string, theme),
				0.5,
				page,
			);
			const placeholder = resolveThemeToken(
				'--radan-ui-muted-foreground',
				theme,
			);

			expect(contrastRatio(placeholder, fill)).toBeGreaterThanOrEqual(
				SMALL_TEXT_CONTRAST_FLOOR,
			);
		},
	);

	test.each([
		['light', '--radan-ui-background'],
		['light', '--radan-ui-card'],
		['dark', '--radan-ui-background'],
		['dark', '--radan-ui-card'],
	] as const)(
		'success alert text clears AA on its tint over %s %s',
		(theme, surfaceToken) => {
			const surface = resolveThemeToken(surfaceToken, theme);
			const tint =
				/color-mix\(\s*in srgb,\s*(#[0-9a-f]{6})\s+(\d+)%,\s*transparent\s*\)/i.exec(
					resolveThemeToken('--publy-alert-success-bg', theme),
				);
			expect(tint).not.toBeNull();
			const fill = mixOver(tint![1], Number(tint![2]) / 100, surface);
			const text = resolveThemeToken('--publy-alert-success-text', theme);

			expect(contrastRatio(text, fill)).toBeGreaterThanOrEqual(
				SMALL_TEXT_CONTRAST_FLOOR,
			);
		},
	);
});

describe('avatar fallback contrast', () => {
	test.each([
		['light', ':root'],
		['dark', 'html.dark'],
	] as const)(
		'keeps secondary foreground legible on the muted surface in the %s theme',
		(_theme, header) => {
			const foreground = resolveThemeHexToken(
				header,
				'--publy-foreground-secondary',
			);
			const background = resolveThemeHexToken(header, '--publy-surface-muted');

			expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(
				SMALL_TEXT_CONTRAST_FLOOR,
			);
		},
	);

	test.each([
		['light', ':root'],
		['dark', 'html.dark'],
	] as const)(
		'keeps every BrandTile and person avatar palette option legible in the %s theme',
		(_theme, header) => {
			const foreground = resolveThemeHexToken(
				header,
				'--publy-avatar-foreground',
			);

			for (const backgroundToken of AVATAR_BACKGROUND_TOKENS) {
				const background = resolveThemeHexToken(header, backgroundToken);
				expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(
					SMALL_TEXT_CONTRAST_FLOOR,
				);
			}
		},
	);

	test('wires person and invitation avatar tiles to every guarded palette option', () => {
		expect(appCss).toMatch(
			/\.publy-avatar-initials\s*\{[^}]*color:\s*var\(--publy-avatar-foreground\);[^}]*\}/s,
		);

		for (const [index, backgroundToken] of AVATAR_BACKGROUND_TOKENS.entries()) {
			expect(appCss).toContain(
				`.publy-avatar-initials[data-palette='${index + 1}']`,
			);
			expect(appCss).toMatch(
				new RegExp(
					`\\.publy-avatar-initials\\[data-palette='${index + 1}'\\]\\s*\\{[^}]*background:\\s*var\\(${backgroundToken}\\);[^}]*\\}`,
					's',
				),
			);
		}
	});
});
