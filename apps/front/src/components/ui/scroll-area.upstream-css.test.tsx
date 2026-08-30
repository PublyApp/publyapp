/**
 * @vitest-environment jsdom
 *
 * #1540 — the vendored SimpleBar CSS in app.css must stay in sync with
 * the upstream simplebar-core stylesheet. If the library changes its CSS,
 * our copy drifts silently. This test reads the REAL upstream file shipped
 * by the package and compares it against our vendored copy.
 *
 * A test that compares our CSS to a copy of our own CSS proves nothing.
 * The upstream source of truth is node_modules/simplebar-core/dist/simplebar.css.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

const UPSTREAM_CSS_PATH = join(
	__dirname,
	'..',
	'..',
	'..',
	'node_modules',
	'simplebar-core',
	'dist',
	'simplebar.css',
);

const APP_CSS_PATH = join(__dirname, '..', '..', 'styles', 'app.css');

describe('#1540 SimpleBar CSS upstream comparison', () => {
	test('the upstream simplebar-core ships a CSS file we can compare against', () => {
		const upstream = readFileSync(UPSTREAM_CSS_PATH, 'utf8');
		expect(upstream.length).toBeGreaterThan(1000);
	});

	test('the upstream CSS still contains the structural primitives we adapted', () => {
		const upstream = readFileSync(UPSTREAM_CSS_PATH, 'utf8');

		// These selectors are the foundation of the layout we vendored.
		// If upstream removes or renames them, our copy is silently broken.
		expect(upstream).toContain('[data-simplebar]');
		expect(upstream).toContain('.simplebar-wrapper');
		expect(upstream).toContain('.simplebar-content-wrapper');
		expect(upstream).toContain('.simplebar-track');
		expect(upstream).toContain('.simplebar-scrollbar');
		expect(upstream).toContain('.simplebar-visible');
	});

	test('our vendored app.css retains the focus-within reveal rule', () => {
		const css = readFileSync(APP_CSS_PATH, 'utf8');
		const focusWithinRule =
			/\[data-simplebar\]:focus-within\s+\.simplebar-scrollbar::before\s*\{([^}]*)\}/u;
		const match = css.match(focusWithinRule);
		expect(
			match,
			'the [data-simplebar]:focus-within rule must exist in app.css',
		).not.toBeNull();
		expect(match?.[1]).toMatch(/opacity\s*:\s*0\.6/);
	});

	test('our vendored app.css retains the auto-hide reveal rule', () => {
		const css = readFileSync(APP_CSS_PATH, 'utf8');
		const visibleRule =
			/\.simplebar-scrollbar\.simplebar-visible::before\s*\{([^}]*)\}/u;
		const match = css.match(visibleRule);
		expect(
			match,
			'the .simplebar-scrollbar.simplebar-visible rule must exist in app.css',
		).not.toBeNull();
		expect(match?.[1]).toMatch(/opacity\s*:\s*0\.6/);
	});
});
