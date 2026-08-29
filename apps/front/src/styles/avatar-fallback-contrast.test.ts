import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

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

const extractHexToken = (block: string, token: string): string => {
	const value = findHexToken(block, token);
	if (!value) {
		throw new Error(`Missing hex token ${token}`);
	}
	return value;
};

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

	return extractHexToken(extractBlock(':root'), token);
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

describe('avatar fallback contrast', () => {
	test.each([
		['light', ':root'],
		['dark', 'html.dark'],
	] as const)(
		'keeps secondary foreground legible on the muted surface in the %s theme',
		(_theme, header) => {
			const block = extractBlock(header);
			const foreground = extractHexToken(block, '--publy-foreground-secondary');
			const background = extractHexToken(block, '--publy-surface-muted');

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
