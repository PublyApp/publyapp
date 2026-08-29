/** @vitest-environment jsdom */
/**
 * Contrast guard for the marketing shell's text-on-surface pairs (#1038).
 *
 * This test checks what the shell actually renders and resolves painted token
 * classes to concrete values from `app.css`. It is intentionally concrete so a
 * JSX-level token mutation to `text-(--publy-foreground-subtle)` in a rendered
 * node fails this guard.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createElement } from 'react';
import { describe, expect, test } from 'vitest';
import { MarketingShell } from '~/components/marketing/marketing-shell';
import { renderMarketing } from '~/components/marketing/marketing.test-helper';

import { resolveEffectiveDeclarations } from './css-cascade-test-support';

const appCssPath = path.resolve(process.cwd(), 'src/styles/app.css');
const appCssSource = readFileSync(appCssPath, 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	'',
);

const AA_NORMAL_TEXT = 4.5;

const readTokens = (
	source: string,
	header: ':root' | 'html.dark',
): Map<string, string> => {
	const lines = source.split('\n');
	const headerLine = lines.findIndex((line) => line.includes(header + ' {'));
	if (headerLine === -1) {
		throw new Error(`Theme block not found for ${header}`);
	}

	const tokens = new Map<string, string>();
	for (let index = headerLine + 1; index < lines.length; index += 1) {
		const line = lines[index];
		if (line.includes('}') && line.trim().startsWith('}')) {
			break;
		}

		const match = /(--publy-[\w-]+):\s*([^;]+);/.exec(line);
		if (match) {
			tokens.set(match[1], match[2].trim());
		}
	}

	return tokens;
};

const LIGHT_TOKENS = readTokens(appCssSource, ':root');
const DARK_TOKENS = readTokens(appCssSource, 'html.dark');

const resolve = (name: string, theme: 'light' | 'dark'): string => {
	const value =
		theme === 'dark'
			? (DARK_TOKENS.get(name) ?? LIGHT_TOKENS.get(name))
			: LIGHT_TOKENS.get(name);
	if (value === undefined) {
		throw new Error(`Token ${name} is not declared for ${theme}`);
	}
	return value;
};

const toRgb = (value: string): [number, number, number] => {
	const hex = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
	if (hex) {
		return [
			Number.parseInt(hex[1].slice(0, 2), 16),
			Number.parseInt(hex[1].slice(2, 4), 16),
			Number.parseInt(hex[1].slice(4, 6), 16),
		];
	}
	throw new Error(`Unsupported colour for contrast maths: ${value}`);
};

const channel = (value: number): number => {
	const c = value / 255;
	if (c <= 0.03928) {
		return c / 12.92;
	}
	return ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]: [number, number, number]): number =>
	0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

const contrast = (a: string, b: string): number => {
	const [l1, l2] = [luminance(toRgb(a)), luminance(toRgb(b))];
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const tokenFromColorDeclaration = (declaration: string | undefined): string => {
	if (declaration === undefined) {
		throw new Error('No color declaration found for this selector');
	}
	const match = /var\((--publy-[\w-]+)\)/.exec(declaration);
	if (!match) {
		throw new Error(
			`Color declaration is not a --publy-* token: ${declaration}`,
		);
	}
	return match[1];
};

const inferForegroundToken = (element: Element): string => {
	let current: Element | null = element;
	while (current) {
		const classes = Array.from(current.classList);
		const inheritsCurrent = classes.includes('text-current');

		for (const tokenClass of classes) {
			// The prefix stops at `--publy-foreground`, a declared token, on
			// purpose: carrying the trailing hyphen would leave a literal that
			// the design-system scanner reads as a reference to a token nothing
			// declares — and that scanner reads comments too, so this note has
			// to avoid it as well. The capture is unchanged; `[^)]*` still takes
			// the full token name.
			const tokenMatch = /text-\((--publy-foreground[^)]*)\)/.exec(tokenClass);
			if (tokenMatch) {
				return tokenMatch[1];
			}
			if (tokenClass === 'text-foreground') {
				return '--publy-foreground';
			}
		}

		if (!inheritsCurrent && classes.includes('publy-type-helper')) {
			return tokenFromColorDeclaration(
				resolveEffectiveDeclarations(appCssSource, '.publy-type-helper').get(
					'color',
				),
			);
		}

		if (!inheritsCurrent && classes.includes('publy-marketing-eyebrow')) {
			return tokenFromColorDeclaration(
				resolveEffectiveDeclarations(
					appCssSource,
					'.publy-marketing-eyebrow',
				).get('color'),
			);
		}

		current = current.parentElement;
	}

	throw new Error(
		`No marketing-relevant foreground token source on ${element.tagName}`,
	);
};

const inferBackgroundToken = (element: Element): string => {
	let current: Element | null = element;
	while (current) {
		for (const tokenClass of Array.from(current.classList)) {
			const tokenMatch = /bg-\((--publy-[^)]+)\)/.exec(tokenClass);
			if (tokenMatch) {
				return tokenMatch[1];
			}
		}
		current = current.parentElement;
	}

	return '--publy-background';
};

const renderMarketingShell = () =>
	renderMarketing(
		// `children` goes in the props object, not the positional slot: the
		// shell declares it required, and `createElement`'s overload checks the
		// props argument against the full prop type before it ever looks at the
		// variadic children.
		createElement(MarketingShell, {
			pathname: '/',
			// react-doctor-disable-next-line react-doctor/no-children-prop -- children is a required prop of MarketingShell; passing positionally fails createElement's overload check.
			children: createElement('p', null, 'page body'),
		}),
	);

describe('marketing shell text contrast', () => {
	test('every rendered small marketing text element clears AA against its painted background', async () => {
		await renderMarketingShell();

		const shell = document.querySelector('[data-testid="marketing-shell"]');
		expect(shell).toBeTruthy();

		const roots = [
			'[data-testid="marketing-announcement-bar"]',
			'[data-testid="marketing-cta-band"]',
			'[data-testid="marketing-social-proof"]',
			'[data-testid="marketing-footer"]',
		];

		const testedElements = new Set<HTMLElement>();

		for (const rootSelector of roots) {
			const root = shell!.querySelector(rootSelector);
			if (!root) {
				continue;
			}

			const elements = Array.from(
				root.querySelectorAll<HTMLElement>('*'),
			).filter((element) => {
				if (element.className === '') {
					return false;
				}
				const hasExplicitToken = Array.from(element.classList).some(
					(tokenClass) => /text-\(--publy-foreground/.test(tokenClass),
				);
				return (
					hasExplicitToken ||
					element.classList.contains('publy-type-helper') ||
					element.classList.contains('publy-marketing-eyebrow')
				);
			});

			for (const element of elements) {
				testedElements.add(element);
			}
		}

		for (const element of testedElements) {
			const foregroundToken = inferForegroundToken(element);
			const backgroundToken = inferBackgroundToken(element);

			for (const theme of ['light', 'dark'] as const) {
				expect(
					contrast(
						resolve(foregroundToken, theme),
						resolve(backgroundToken, theme),
					),
				).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
			}
		}

		expect(testedElements.size).toBeGreaterThan(0);
	});

	test('a direct `--publy-foreground-subtle` on a rendered marketing text element remains visible-only if AA would fail', async () => {
		await renderMarketingShell();

		expect(shellHasRenderTimeSubtleTokens()).toBe(false);
	});
});

function shellHasRenderTimeSubtleTokens(): boolean {
	const shell = document.querySelector('[data-testid="marketing-shell"]');
	if (!shell) {
		return false;
	}

	return Array.from(shell.querySelectorAll<HTMLElement>('*')).some((element) =>
		Array.from(element.classList).some((tokenClass) =>
			/\btext-\(--publy-foreground-subtle\)/.test(tokenClass),
		),
	);
}
