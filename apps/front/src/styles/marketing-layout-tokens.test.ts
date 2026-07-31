import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { resolveEffectiveDeclarations } from './css-cascade-test-support';

/**
 * The three marketing layout tokens (#1038) resolved out of the REAL app.css
 * through the shared cascade resolver — not a regex over the file. Consumers
 * (`max-w-(--publy-container-chrome)`, `h-(--publy-header-height)`, …) render
 * nothing at all if a token is missing or renamed, and no other check in the
 * suite would notice: the design-system guard only requires that a referenced
 * token IS declared somewhere, never that it holds the width the layout roles
 * were defined around.
 */
const appCssPath = path.join(
	path.resolve(fileURLToPath(new URL('.', import.meta.url))),
	'app.css',
);
// Comments are stripped first: the shared resolver splits a rule body on
// `;` and takes the first `:` as the property separator, so a comment
// containing a colon (this file has several) swallows the declaration that
// follows it. Comments carry no cascade meaning, so removing them changes
// nothing about what the browser resolves.
const appCssSource = readFileSync(appCssPath, 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	'',
);

const rootDeclarations = resolveEffectiveDeclarations(appCssSource, ':root');

describe('marketing layout tokens', () => {
	test('chrome width is 1280 — the header, and only the header', () => {
		expect(rootDeclarations.get('--publy-container-chrome')).toBe('1280px');
	});

	test('reading width is 1152 — body, social proof, CTA band and footer', () => {
		expect(rootDeclarations.get('--publy-container-reading')).toBe('1152px');
	});

	test('the two roles are genuinely different widths (the 128px step is the point)', () => {
		expect(rootDeclarations.get('--publy-container-chrome')).not.toBe(
			rootDeclarations.get('--publy-container-reading'),
		);
	});

	test('header height is 64px by default', () => {
		expect(rootDeclarations.get('--publy-header-height')).toBe('64px');
	});

	test('header height steps down to 56px below 768, in one place', () => {
		const smallScreenBlock =
			/@media\s*\(max-width:\s*767px\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(
				appCssSource,
			);

		expect(smallScreenBlock).not.toBeNull();
		expect(smallScreenBlock?.[1]).toContain('--publy-header-height: 56px');
	});

	test('in-page anchors clear the sticky header by deriving from the same token', () => {
		const anchorRule = /\.publy-marketing-anchor\s*\{([^}]*)\}/.exec(
			appCssSource,
		);

		expect(anchorRule?.[1]).toMatch(
			/scroll-margin-top:\s*calc\(var\(--publy-header-height\)/,
		);
	});
});
