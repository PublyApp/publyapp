/**
 * @vitest-environment jsdom
 *
 * #1540 — the vendored SimpleBar CSS in app.css must stay in sync with
 * the upstream simplebar-core stylesheet. If the library changes a structural
 * rule, our copy drifts silently.
 *
 * This test extracts named CSS rules from the vendored block in app.css,
 * normalises whitespace, and compares each one against the corresponding
 * upstream region. Divergence names the selector and property that moved.
 * A missing upstream file fails loudly (readFileSync throws).
 *
 * Rules that intentionally diverge (tokenised values like
 * --publy-foreground-muted) are NOT compared — only structural selectors
 * whose values must stay in sync are fingerprinted.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

// Resolve from the front package root so this works in all test environments.
const UPSTREAM_CSS_PATH = require.resolve('simplebar-core/dist/simplebar.css', {
	paths: [join(__dirname, '..', '..')],
});

const APP_CSS_PATH = join(__dirname, '..', '..', 'styles', 'app.css');

/** Return the CSS text inside the first rule block matching `selector` in `css`. */
const extractRule = (css: string, selector: string): string => {
	// Match a selector followed by { ... } — handles nested @media blocks too.
	// We use a greedy scan so the outermost '{' pairs with the outermost '}'.
	const selectorEscaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp(`${selectorEscaped}\\s*\\{([\\s\\S]*?)^\\}`, 'mu');
	const match = css.match(re);
	if (!match) {
		throw new Error(`Selector "${selector}" not found in CSS source`);
	}
	return match[1];
};

/** Normalise whitespace so the same logical CSS always produces the same hash. */
const normalise = (cssText: string): string => {
	return cssText
		.replace(/\/\*[\s\S]*?\*\//g, '') // strip comments
		.replace(/\s+/g, ' ') // collapse whitespace
		.replace(/\s*([{}:;,])\s*/g, '$1') // trim around punctuation
		.replace(/;\s*/g, ';') // consistent semicolons
		.replace(/:\s*/g, ':') // consistent colons
		.trim();
};

/** SHA-256 hex of normalised CSS text. */
const fingerprint = (cssText: string): string => {
	return createHash('sha256')
		.update(normalise(cssText))
		.digest('hex')
		.slice(0, 16);
};

/**
 * Compare the vendored rule against the upstream rule.
 * Returns `null` if they match, or an object describing the divergence.
 */
const compareRule = (
	vendoredCss: string,
	vendoredSelector: string,
	upstreamCss: string,
	upstreamSelector: string,
) => {
	const vendoredRaw = extractRule(vendoredCss, vendoredSelector);
	const upstreamRaw = extractRule(upstreamCss, upstreamSelector);

	if (normalise(vendoredRaw) === normalise(upstreamRaw)) {
		return null;
	}

	return {
		vendoredSelector,
		upstreamSelector,
		vendoredFingerprint: fingerprint(vendoredRaw),
		upstreamFingerprint: fingerprint(upstreamRaw),
		vendoredRule: vendoredRaw.trim().slice(0, 200),
		upstreamRule: upstreamRaw.trim().slice(0, 200),
	};
};

describe('#1540 SimpleBar upstream CSS fingerprint comparison', () => {
	test('the upstream simplebar-core CSS file is present', () => {
		// readFileSync throws if the file is absent — this is the loud fail
		// the brief requires when the upstream cannot be located.
		const upstream = readFileSync(UPSTREAM_CSS_PATH, 'utf8');
		expect(upstream.length).toBeGreaterThan(1000);
	});

	test('the vendored app.css block is present', () => {
		const css = readFileSync(APP_CSS_PATH, 'utf8');
		// The block starts at the simplebar comment header.
		expect(css).toContain('vendored SimpleBar');
		// And contains the structural selectors that must stay in sync.
		expect(css).toContain('.simplebar-track');
		expect(css).toContain('.simplebar-scrollbar');
	});

	/**
	 * Fingerprinted rules — these must stay byte-for-byte in sync with upstream.
	 * If the upstream library changes a value here, our vendored copy drifts and
	 * this test names exactly which selector diverged.
	 */

	/**
	 * Fingerprinted rules — these must stay byte-for-byte in sync with upstream.
	 * If the upstream library changes a value here, our vendored copy drifts and
	 * this test names exactly which selector diverged.
	 *
	 * .simplebar-track is excluded from fingerprint comparison: upstream sets z-index:1
	 * but the vendored copy intentionally omits it (all layers use auto stacking, DOM
	 * order alone puts tracks above masked content — the stacking note in the block
	 * header explains why). We assert it exists so the base rule cannot be silently
	 * deleted, and we assert it omits z-index so the intentional divergence is visible.
	 */

	test('.simplebar-track base rule exists and omits z-index (intentional)', () => {
		const css = readFileSync(APP_CSS_PATH, 'utf8');
		const rule = extractRule(css, '.simplebar-track');
		expect(rule).toMatch(/position:\s*absolute/);
		expect(rule).toMatch(/pointer-events:\s*none/);
		expect(rule).not.toMatch(/z-index/);
	});

	test('.simplebar-track.simplebar-vertical must not diverge from upstream', () => {
		const upstream = readFileSync(UPSTREAM_CSS_PATH, 'utf8');
		const css = readFileSync(APP_CSS_PATH, 'utf8');
		const div = compareRule(
			css,
			'.simplebar-track.simplebar-vertical',
			upstream,
			'.simplebar-track.simplebar-vertical',
		);
		expect(div).toBeNull();
	});

	test('.simplebar-track.simplebar-horizontal must not diverge from upstream', () => {
		const upstream = readFileSync(UPSTREAM_CSS_PATH, 'utf8');
		const css = readFileSync(APP_CSS_PATH, 'utf8');
		const div = compareRule(
			css,
			'.simplebar-track.simplebar-horizontal',
			upstream,
			'.simplebar-track.simplebar-horizontal',
		);
		expect(div).toBeNull();
	});

	test("[data-simplebar-direction='rtl'] .simplebar-track.simplebar-vertical must not diverge from upstream", () => {
		const upstream = readFileSync(UPSTREAM_CSS_PATH, 'utf8');
		const css = readFileSync(APP_CSS_PATH, 'utf8');
		const div = compareRule(
			css,
			"[data-simplebar-direction='rtl'] .simplebar-track.simplebar-vertical",
			upstream,
			"[data-simplebar-direction='rtl'] .simplebar-track.simplebar-vertical",
		);
		expect(div).toBeNull();
	});

	test('.simplebar-scrollbar must not diverge from upstream', () => {
		const upstream = readFileSync(UPSTREAM_CSS_PATH, 'utf8');
		const css = readFileSync(APP_CSS_PATH, 'utf8');
		const div = compareRule(
			css,
			'.simplebar-scrollbar',
			upstream,
			'.simplebar-scrollbar',
		);
		expect(div).toBeNull();
	});

	test('.simplebar-track.simplebar-horizontal .simplebar-scrollbar must not diverge from upstream', () => {
		const upstream = readFileSync(UPSTREAM_CSS_PATH, 'utf8');
		const css = readFileSync(APP_CSS_PATH, 'utf8');
		const div = compareRule(
			css,
			'.simplebar-track.simplebar-horizontal .simplebar-scrollbar',
			upstream,
			'.simplebar-track.simplebar-horizontal .simplebar-scrollbar',
		);
		expect(div).toBeNull();
	});

	/**
	 * Tokenised rules — intentionally differ from upstream (raw colour / border-radius
	 * replaced with --publy-* tokens). We assert the selectors exist and contain
	 * the token markers so a future developer knows these were deliberate.
	 */

	test('.simplebar-scrollbar::before uses publy tokens (intentional divergence)', () => {
		const css = readFileSync(APP_CSS_PATH, 'utf8');
		const rule = extractRule(css, '.simplebar-scrollbar::before');
		// These are the publy tokens that replace upstream's raw values.
		expect(rule).toContain('--publy-foreground-muted');
		expect(rule).toContain('--publy-radius-sm');
		// The opacity transition must still be present.
		expect(rule).toContain('opacity');
		expect(rule).toContain('transition');
	});

	/**
	 * Engine-managed visibility rules — the custom policy added by this project.
	 * Upstream uses raw opacity values; we assert our vendored copy has the
	 * correct values and that the policy comment header is present.
	 */

	test('.simplebar-scrollbar.simplebar-visible::before has correct auto-hide opacity', () => {
		const css = readFileSync(APP_CSS_PATH, 'utf8');
		const rule = extractRule(
			css,
			'.simplebar-scrollbar.simplebar-visible::before',
		);
		expect(rule).toMatch(/opacity\s*:\s*0\.6/);
	});

	test('[data-simplebar]:focus-within .simplebar-scrollbar::before has correct focus reveal opacity', () => {
		const css = readFileSync(APP_CSS_PATH, 'utf8');
		const rule = extractRule(
			css,
			'[data-simplebar]:focus-within .simplebar-scrollbar::before',
		);
		expect(rule).toMatch(/opacity\s*:\s*0\.6/);
	});

	test('.simplebar-scrollbar.simplebar-hover,.simplebar-dragging have correct drag/hover opacity', () => {
		const css = readFileSync(APP_CSS_PATH, 'utf8');
		// These two selectors share a single rule block. We look for the opening
		// selector at the start of a line and extract the block content.
		const re =
			/\.simplebar-scrollbar\.simplebar-hover::before,\s*\.simplebar-scrollbar\.simplebar-dragging::before\s*\{([^}]+)\}/u;
		const match = css.match(re);
		expect(
			match,
			'.simplebar-scrollbar.simplebar-hover,.simplebar-dragging::before rule must exist',
		).not.toBeNull();
		expect(match?.[1]).toMatch(/opacity\s*:\s*0\.9/);
	});
});
