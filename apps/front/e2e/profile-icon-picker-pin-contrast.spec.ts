import { expect, test } from '@playwright/test';

import { readCompiledAppCss } from './helpers/compiled-app-css';

/**
 * #992 review round 2, IMPORTANT finding A. The vitest-side companion
 * (src/styles/profile-icon-picker-pin-contrast.test.ts) reads app.css as
 * text and resolves the cascade itself — a deliberately narrow model with
 * documented limits (no specificity, no `!important`, no `@media`). This
 * spec is the "better where observable" alternative the review asked for:
 * the pencil-pin is a plain rendered DOM element with ordinary CSS (unlike
 * #975's unrenderable `::-webkit-search-cancel-button` UA pseudo-element),
 * so a real Chromium `getComputedStyle()` reading is fully achievable and
 * is the actual authority on the effective cascade — it needs no CSS model
 * at all, because the browser resolves the real cascade for us.
 *
 * It renders a `page.setContent()` page built from the REAL compiled
 * production CSS (dist/client/assets/app-*.css, built on demand — see
 * helpers/compiled-app-css.ts) plus markup mirroring the pin's actual
 * rendered classes (icon-color-picker.tsx). No login, backend, or
 * docker-compose stack is needed — see the `chromium-hermetic-source`
 * Playwright project in playwright.config.ts.
 */

const NON_TEXT_CONTRAST_FLOOR = 3.0;

type Rgb = { r: number; g: number; b: number };

const parseRgbString = (value: string): Rgb => {
	const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
	if (!match) {
		throw new Error(`Unparseable computed colour: ${value}`);
	}
	return {
		r: Number(match[1]),
		g: Number(match[2]),
		b: Number(match[3]),
	};
};

const relativeLuminance = ({ r, g, b }: Rgb): number => {
	const linearize = (channel: number): number => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrastRatio = (foreground: Rgb, background: Rgb): number => {
	const lighter = Math.max(
		relativeLuminance(foreground),
		relativeLuminance(background),
	);
	const darker = Math.min(
		relativeLuminance(foreground),
		relativeLuminance(background),
	);

	return (lighter + 0.05) / (darker + 0.05);
};

const buildPinPage = (css: string): string => `<!doctype html>
<html>
<head><style>${css}</style></head>
<body>
	<span class="publy-profile-detail-tile" data-tone="0">
		<span class="publy-profile-detail-tile-pin" id="pin"></span>
	</span>
</body>
</html>`;

const readPinComputedColors = async (
	page: import('@playwright/test').Page,
): Promise<{ color: Rgb; background: Rgb }> => {
	const computed = await page.evaluate(() => {
		const pin = document.getElementById('pin');
		if (!pin) {
			throw new Error('Missing #pin element');
		}
		const style = getComputedStyle(pin);
		return { color: style.color, background: style.backgroundColor };
	});

	return {
		color: parseRgbString(computed.color),
		background: parseRgbString(computed.background),
	};
};

test.describe('profile icon-picker pencil-pin contrast (#992, real browser)', () => {
	test('the effective (real, cascade-resolved) colour clears the 3:1 non-text floor in both light and dark themes', async ({
		page,
	}) => {
		const css = readCompiledAppCss();

		await page.setContent(buildPinPage(css));
		const light = await readPinComputedColors(page);
		expect(
			contrastRatio(light.color, light.background),
			`light: color rgb(${light.color.r},${light.color.g},${light.color.b}) on background rgb(${light.background.r},${light.background.g},${light.background.b})`,
		).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST_FLOOR);

		await page.evaluate(() => document.documentElement.classList.add('dark'));
		const dark = await readPinComputedColors(page);
		expect(
			contrastRatio(dark.color, dark.background),
			`dark: color rgb(${dark.color.r},${dark.color.g},${dark.color.b}) on background rgb(${dark.background.r},${dark.background.g},${dark.background.b})`,
		).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST_FLOOR);
	});

	// Cascade regression proof: reproduces the reviewer's exact mutation — a
	// LATER, equal-specificity rule for the same exact selector reverting
	// `color` to the non-compliant `--publy-foreground-subtle` token. Because
	// this spec reads the REAL computed style from a real browser, there is
	// no "first declaration" to be fooled by: the browser always resolves
	// the actual winning rule, so this later override is correctly reflected
	// (and correctly fails the floor) without this test needing any CSS
	// cascade model of its own.
	test('a later duplicate rule for the exact same selector changes the real computed colour, and the resulting contrast is correctly reported as failing', async ({
		page,
	}) => {
		const css = readCompiledAppCss();
		// Same equal-specificity, no `!important` — a plain later rule for the
		// exact same selector, exactly as the reviewer's mutation was.
		const mutatedCss = `${css}\n.publy-profile-detail-tile-pin{color:var(--publy-foreground-subtle)}`;

		await page.setContent(buildPinPage(mutatedCss));
		const light = await readPinComputedColors(page);

		expect(
			contrastRatio(light.color, light.background),
			`light: color rgb(${light.color.r},${light.color.g},${light.color.b}) on background rgb(${light.background.r},${light.background.g},${light.background.b})`,
		).toBeLessThan(NON_TEXT_CONTRAST_FLOOR);
	});
});
