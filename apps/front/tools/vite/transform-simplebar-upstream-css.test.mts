/**
 * #1540 — the transformer pulls `simplebar-core/dist/simplebar.css` from the
 * installed artifact, validates the upstream structure, and retokenizes the
 * raw literals into publy design tokens. The test pins the contract:
 *
 *   - The real installed upstream file MUST resolve from this package and be
 *     non-empty. If it does not, the test fails loudly (readFileSync throws /
 *     require.resolve throws) — a substituted default would install a silent
 *     false negative.
 *   - The upstream MUST contain the structural selectors the engine reads.
 *     If upstream's structure drifts in a way the transformer cannot safely
 *     handle, the test names the missing selector so a developer knows what
 *     changed.
 *   - The transformer MUST strip raw `background: black`, raw `border-radius:
 *     7px`, raw `transition: opacity 0.2s 0.5s linear`, and the four known
 *     upstream z-index declarations. Each is replaced with a publy token or
 *     removed in line with the stacking note (DOM order alone stacks tracks
 *     above the mask; no z-index is authored). A changed or new z-index must
 *     fail loudly because it may carry an upstream layout or security fix.
 *   - The transformer MUST append the four local policy rules (`:focus-within`
 *     keep-thumbs-visible,
 *     `.simplebar-hover`/`.simplebar-dragging` opacity bump,
 *     `prefers-reduced-motion: reduce` killing the fade, and
 *     `forced-colors: active` pinning the thumb to `CanvasText`).
 *
 * The transformer does NOT compare against a snapshot. The real upstream IS
 * the source of truth.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

import {
	SIMPLEBAR_UPSTREAM_REQUIRE_SPECIFIER,
	transformSimplebarUpstreamCssOrThrow,
} from './transform-simplebar-upstream-css.mts';

const frontDirectory = join(import.meta.dirname, '..', '..');

/** Resolve the real installed upstream artifact. Throws when missing. */
const resolveUpstreamPath = (): string => {
	const requireFromFront = createRequire(`${frontDirectory}/package.json`);
	return requireFromFront.resolve(SIMPLEBAR_UPSTREAM_REQUIRE_SPECIFIER);
};

const UPSTREAM_SELECTORS = [
	'[data-simplebar]',
	'.simplebar-wrapper',
	'.simplebar-mask',
	'.simplebar-offset',
	'.simplebar-content-wrapper',
	'.simplebar-content-wrapper::-webkit-scrollbar',
	'.simplebar-placeholder',
	'.simplebar-height-auto-observer-wrapper',
	'.simplebar-height-auto-observer',
	'.simplebar-track',
	'.simplebar-track.simplebar-vertical',
	'.simplebar-track.simplebar-horizontal',
	'.simplebar-scrollbar',
	'.simplebar-content:before,',
	'.simplebar-content:after',
	'.simplebar-scrollbar:before',
	'.simplebar-scrollbar.simplebar-visible:before',
	'.simplebar-track.simplebar-horizontal .simplebar-scrollbar',
	"[data-simplebar-direction='rtl'] .simplebar-track.simplebar-vertical",
	'.simplebar-dummy-scrollbar-size',
	'.simplebar-hide-scrollbar',
];

test('#1540 upstream CSS resolves from the installed simplebar-core package', () => {
	const upstreamPath = resolveUpstreamPath();
	const css = readFileSync(upstreamPath, 'utf8');
	assert.ok(
		css.length > 1000,
		`installed upstream CSS at ${upstreamPath} is unexpectedly short (${css.length} bytes) — the transformer cannot trust a truncated artifact`,
	);
});

test('#1540 upstream CSS contains every structural selector the engine expects', () => {
	const css = readFileSync(resolveUpstreamPath(), 'utf8');
	const missing = UPSTREAM_SELECTORS.filter(
		(selector) => !css.includes(selector),
	);
	assert.deepEqual(
		missing,
		[],
		`upstream simplebar-core CSS is missing ${missing.length} structural selector(s) the engine contract relies on: ${missing.join(', ')}. The transformer cannot safely substitute raw literals against an unknown upstream — update the transformer or pin a compatible simplebar-core version.`,
	);
});

test('#1540 transformer (loud) throws when given an empty upstream payload', () => {
	assert.throws(
		() => transformSimplebarUpstreamCssOrThrow(''),
		/missing|empty|unparseable/i,
		'an empty upstream payload must not silently produce an empty bundle',
	);
});

test('#1540 transformer (loud) throws when given an upstream without the contract selectors', () => {
	const fakeUpstream = `
		.simplebar-track { position: absolute; }
		.simplebar-scrollbar { position: absolute; }
	`;
	assert.throws(
		() => transformSimplebarUpstreamCssOrThrow(fakeUpstream),
		/missing structural selector/i,
		'unexpected upstream content must fail closed, not produce a silently-shaped bundle',
	);
});

test('#1540 transformer rejects malformed upstream CSS with an explicit reason', () => {
	const upstream = readFileSync(resolveUpstreamPath(), 'utf8');
	const malformedUpstream = upstream.replace(/\n\}\s*$/u, '\n');
	assert.notEqual(
		malformedUpstream,
		upstream,
		'the malformed fixture must remove the upstream stylesheet closing brace',
	);

	assert.throws(
		() => transformSimplebarUpstreamCssOrThrow(malformedUpstream),
		/unparseable/i,
		'malformed upstream CSS must fail closed instead of producing a bundle-shaped result',
	);
});

test('#1540 transformer (loud) accepts the real installed upstream end-to-end', () => {
	const upstreamPath = resolveUpstreamPath();
	const css = readFileSync(upstreamPath, 'utf8');
	const out = transformSimplebarUpstreamCssOrThrow(css);

	assert.ok(out.includes('.simplebar-track.simplebar-vertical'));
	assert.ok(out.includes('.simplebar-track.simplebar-horizontal'));
	assert.ok(out.includes('.simplebar-scrollbar'));
	assert.ok(
		out.includes('--publy-foreground-muted'),
		'upstream `background: black` was not retokenized to the publy foreground token',
	);
	assert.ok(
		out.includes('--publy-radius-sm'),
		'upstream `border-radius: 7px` was not retokenized to the publy radius token',
	);
	assert.ok(
		out.includes('--publy-motion-medium'),
		'upstream raw transition timing was not routed through the publy motion token',
	);
	assert.ok(
		out.includes('--publy-motion-ease'),
		'upstream raw transition timing was not routed through the publy motion easing token',
	);
	assert.ok(
		!/background:\s*black\s*;/i.test(out),
		'transformed output still ships a raw `background: black` declaration',
	);
	assert.ok(
		!/border-radius:\s*7px\s*;/i.test(out),
		'transformed output still ships a raw `border-radius: 7px` declaration',
	);
	assert.ok(
		!/transition:\s*opacity\s+0\.2s\s+0\.5s\s+linear/i.test(out),
		'transformed output still ships the raw `transition: opacity 0.2s 0.5s linear` declaration',
	);
	assert.ok(
		!/z-index:\s*-?\d/i.test(out),
		'transformed output still ships a raw `z-index: <number>` declaration — the z-index guard scans the compiled CSS and would red',
	);
	// The local policy additions retained from the former vendored block.
	assert.ok(
		out.includes('[data-simplebar]:focus-within .simplebar-scrollbar::before'),
		'transformer dropped the focus-within keep-thumbs-visible policy rule',
	);
	assert.ok(
		out.includes('.simplebar-scrollbar.simplebar-hover::before,'),
		'transformer dropped the hover/dragging opacity-bump policy rule',
	);
	assert.ok(
		out.includes('@media (prefers-reduced-motion: reduce)'),
		'transformer dropped the prefers-reduced-motion transition-suppression rule',
	);
	assert.ok(
		out.includes('@media (forced-colors: active)'),
		'transformer dropped the forced-colors CanvasText fallback rule',
	);
	// Publy-specific wheel containment, retained from the former vendored block:
	// upstream's `.simplebar-content-wrapper` does NOT ship overscroll-behavior,
	// so without this policy wheel/trackpad scrolls at the content boundary
	// chain out of the open popup (select/dropdown) onto the page behind it.
	assert.ok(
		out.includes('overscroll-behavior: contain'),
		'transformer dropped the vendored .simplebar-content-wrapper overscroll-behavior: contain policy',
	);
});

test('#1540 transformed output preserves changed and newly added upstream rules', () => {
	const upstream = readFileSync(resolveUpstreamPath(), 'utf8');
	const changedUpstream = upstream.replace(
		'  width: auto !important;',
		'  width: 1px !important;',
	);
	const upstreamWithNewRule = `${changedUpstream}\n.simplebar-upstream-mutation {\n  --simplebar-upstream-mutation: retained;\n}`;

	assert.notEqual(
		changedUpstream,
		upstream,
		'the mutation must change an existing upstream structural declaration',
	);
	const out = transformSimplebarUpstreamCssOrThrow(upstreamWithNewRule);

	assert.match(
		out,
		/\.simplebar-mask\s*\{[\s\S]*?width:\s*1px\s*!important;/u,
		'changed upstream declarations must flow into the transformed stylesheet',
	);
	assert.match(
		out,
		/\.simplebar-upstream-mutation\s*\{\s*--simplebar-upstream-mutation:\s*retained;/u,
		'new upstream rules must flow into the transformed stylesheet',
	);
});

test('#1540 transformer (loud) rejects an unexpected upstream z-index change', () => {
	const upstream = readFileSync(resolveUpstreamPath(), 'utf8');
	const changedUpstream = upstream.replace('  z-index: 1;', '  z-index: 2;');
	assert.notEqual(
		changedUpstream,
		upstream,
		'the mutation must change an upstream stacking declaration',
	);

	assert.throws(
		() => transformSimplebarUpstreamCssOrThrow(changedUpstream),
		/unsupported.*z-index|z-index.*unsupported/i,
		'an unexpected stacking declaration must fail closed instead of being silently stripped',
	);
});

test('#1540 the require.resolve specifier still resolves from the production runtime graph', () => {
	// Sanity guard: if SIMPLEBAR_UPSTREAM_REQUIRE_SPECIFIER drifts (typo,
	// path-style change), this fails before Vite ever tries to load it.
	const resolved = resolveUpstreamPath();
	assert.match(
		resolved,
		/simplebar-core[\\/]+dist[\\/]+simplebar\.css$/,
		`SIMPLEBAR_UPSTREAM_REQUIRE_SPECIFIER resolved to an unexpected path: ${resolved}`,
	);
});
