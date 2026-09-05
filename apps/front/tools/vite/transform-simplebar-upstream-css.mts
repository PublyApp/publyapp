/**
 * #1540 — Pulls `simplebar-core/dist/simplebar.css` from the installed
 * artifact, validates the upstream structure, and retokenizes the raw
 * literals into publy design tokens.
 *
 * The vendored copy of the upstream CSS in `src/styles/app.css` was a silent
 * drift surface: an upstream security or layout fix would land in
 * `node_modules/simplebar-core` and stay invisible here until someone noticed
 * the bundle misbehaving. The fix replaces the copy with this transformer.
 *
 *   - The plugin materialises a transformed copy of the upstream into a
 *     per-install cache file under `node_modules/.cache/publy/` and overrides
 *     Tailwind v4's `globalThis.__tw_resolve` to point `@import
 *     'simplebar-core/dist/simplebar.css'` at that cache file. Tailwind's
 *     CSS loader calls `readFile` directly on the resolved path, so the
 *     only supported interception point is the resolver itself (#1540).
 *   - The transformer retokenizes upstream's raw literals to publy tokens so
 *     the design guard (`no-raw-visual-color`) and the z-index guard (raw
 *     `z-index:` in the compiled CSS) stay green.
 *   - The four local policy rules that replaced the vendored block — keep thumbs
 *     visible on `:focus-within`, bump hover/dragging opacity to 0.9, kill
 *     the fade under `prefers-reduced-motion: reduce`, and pin the thumb to
 *     `CanvasText` under `forced-colors: active` — are appended after the
 *     upstream rules so they layer on top.
 *
 * Stacking note: the stock sheet layered mask (z 0) under tracks (z 1) and
 * the observer elements at z -1. Here every layer is positioned with auto
 * stacking and DOM order alone puts the tracks above the masked content,
 * so no z-index is authored at all. Only those four known declarations are
 * removed; a changed or new upstream z-index fails closed instead of being
 * silently discarded.
 *
 * Maintenance contract: never copy the upstream sheet back into app.css.
 * Keep `simplebar-core` pinned, run the focused transformer test and a
 * production build after every dependency bump, and update this narrow
 * transform only when the installed upstream changes its structure or raw
 * literals. Retire this plugin when upstream CSS is token-safe and the local
 * auto-hide additions are no longer needed.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import type { Plugin } from 'vite';

/** Bare specifier the Vite resolver already maps to the installed package. */
export const SIMPLEBAR_UPSTREAM_REQUIRE_SPECIFIER =
	'simplebar-core/dist/simplebar.css';

/** CSS selectors the engine contract relies on. Used as a fail-closed check. */
const UPSTREAM_STRUCTURAL_SELECTORS = [
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
] as const;

/**
 * Local policy additions layered after the upstream rules so they always win
 * a same-specificity tie.
 */
const POLICY_ADDITIONS = `
/* --- #1540 publy auto-hide policy additions, layered after the upstream --- */

/*
 * Native scrolling stays live underneath the custom thumbs (upstream keeps
 * overflow: auto on the wrapper); containment stops wheel/trackpad scrolls
 * from chaining out of an open popup (select/dropdown) onto the page behind
 * it. Upstream does not ship overscroll-behavior, so it is layered here.
 */
.simplebar-content-wrapper {
	overscroll-behavior: contain;
}

.simplebar-scrollbar.simplebar-hover::before,
.simplebar-scrollbar.simplebar-dragging::before {
	opacity: 0.9;
}

[data-simplebar]:focus-within .simplebar-scrollbar::before {
	opacity: 0.6;
	transition-delay: 0s;
	transition-duration: 0s;
}

@media (prefers-reduced-motion: reduce) {
	.simplebar-scrollbar::before {
		transition: none;
	}
}

@media (forced-colors: active) {
	.simplebar-scrollbar::before {
		background: CanvasText;
		forced-color-adjust: none;
		opacity: 1;
	}
}
`;

/**
 * Whole-declaration replacements applied to the raw upstream text. Each entry
 * targets a rule block (by `selector`) and rewrites the first occurrence of
 * `blockPattern` inside it. The block scope is load-bearing: a replacement must
 * never be applied to an unrelated rule that happens to contain the same
 * declaration pattern. A `blockPattern` that no matching block contains is left
 * untouched so the raw literal survives and the guard test reds — the
 * replacements are intentionally fail-closed.
 */
type DeclarationReplacement = {
	selector: RegExp;
	blockPattern: RegExp;
	replacement: string;
};

const DECLARATION_REPLACEMENTS: DeclarationReplacement[] = [
	// .simplebar-scrollbar::before raw colour and geometry
	{
		selector: /\.simplebar-scrollbar:before\s*\{/i,
		blockPattern: /background:\s*black\s*;/i,
		replacement: 'background: var(--publy-foreground-muted);',
	},
	{
		selector: /\.simplebar-scrollbar:before\s*\{/i,
		blockPattern: /border-radius:\s*7px\s*;/i,
		replacement: 'border-radius: var(--publy-radius-sm);',
	},
	{
		selector: /\.simplebar-scrollbar:before\s*\{/i,
		blockPattern: /transition:\s*opacity\s+0\.2s\s+0\.5s\s+linear\s*;/i,
		replacement:
			'transition: opacity var(--publy-motion-medium) var(--publy-motion-ease);',
	},
	// .simplebar-scrollbar.simplebar-visible::before opacity bumped to 0.6
	{
		selector: /\.simplebar-scrollbar\.simplebar-visible:before\s*\{/i,
		blockPattern: /opacity:\s*0\.5\s*;/i,
		replacement: 'opacity: 0.6;',
	},
];

/**
 * Apply one replacement only inside the rule block that matches `selector`
 * (first `{` after the match) and contains `blockPattern`. The upstream sheet
 * is flat — these blocks carry no nested rules — so the matching close is the
 * next `}`. Every selector match is visited in order; the first block that
 * contains `blockPattern` gets the first occurrence rewritten. A block without
 * the pattern is skipped untouched, and a `blockPattern` that matches no block
 * leaves the CSS unchanged (fail-closed: the raw literal survives for the
 * guard test to flag).
 */
const replaceInMatchedBlock = (
	css: string,
	selector: RegExp,
	blockPattern: RegExp,
	replacement: string,
): string => {
	// Make a searchable (global, but cursor-controlled) copy of the selector.
	const selectorRe = new RegExp(selector.source, `${selector.flags}g`);
	let out = css;
	for (;;) {
		const selMatch = selectorRe.exec(out);
		if (selMatch === null) {
			break;
		}
		const open = selMatch.index + (selMatch[0] as string).lastIndexOf('{');
		if (open < selMatch.index) {
			// The selector does not end in `{` — not recognised, bail out
			// rather than guess at the block geometry.
			break;
		}
		const close = out.indexOf('}', open + 1);
		if (close === -1) {
			break;
		}
		const block = out.slice(open + 1, close);
		const blockMatch = block.match(blockPattern);
		if (blockMatch !== null) {
			const matchIndex = blockMatch.index ?? 0;
			const replacedBlock =
				block.slice(0, matchIndex) +
				replacement +
				block.slice(matchIndex + blockMatch[0].length);
			out = out.slice(0, open + 1) + replacedBlock + out.slice(close);
			// Rescan from just after the rewritten block, whose braces are
			// unchanged by the substitution.
			selectorRe.lastIndex = open + 1;
		} else {
			selectorRe.lastIndex = close + 1;
		}
	}
	return out;
};

/**
 * Remove only the upstream z-index declarations covered by the stacking
 * decision above. Any remaining declaration is an upstream change the
 * transformer does not understand and must be reported to the maintainer.
 */
const KNOWN_UPSTREAM_Z_INDEX_REPLACEMENTS: DeclarationReplacement[] = [
	{
		selector: /\.simplebar-mask\s*\{/i,
		blockPattern: /z-index:\s*0\s*;/i,
		replacement: '',
	},
	{
		selector: /\.simplebar-height-auto-observer-wrapper\s*\{/i,
		blockPattern: /z-index:\s*-1\s*;/i,
		replacement: '',
	},
	{
		selector: /\.simplebar-height-auto-observer\s*\{/i,
		blockPattern: /z-index:\s*-1\s*;/i,
		replacement: '',
	},
	{
		selector: /\.simplebar-track\s*\{/i,
		blockPattern: /z-index:\s*1\s*;/i,
		replacement: '',
	},
];

const stripKnownUpstreamZIndexDeclarations = (css: string): string => {
	let out = css;
	for (const {
		selector,
		blockPattern,
		replacement,
	} of KNOWN_UPSTREAM_Z_INDEX_REPLACEMENTS) {
		out = replaceInMatchedBlock(out, selector, blockPattern, replacement);
	}
	return out;
};

const hasRawZIndexDeclaration = (css: string): boolean => {
	return /\bz-index\s*:/i.test(css);
};

const applyDeclarationReplacements = (css: string): string => {
	let out = css;
	for (const {
		selector,
		blockPattern,
		replacement,
	} of DECLARATION_REPLACEMENTS) {
		out = replaceInMatchedBlock(out, selector, blockPattern, replacement);
	}
	return out;
};

/**
 * Check the small CSS grammar this transformer needs before touching the raw
 * text. A full parser would add no value here: the upstream sheet is flat,
 * while unmatched braces, quotes, or comments make block-local replacement
 * unsafe and must fail closed.
 */
const isParseableCss = (css: string): boolean => {
	let braceDepth = 0;
	let quote: "'" | '"' | null = null;
	let escaped = false;
	let inComment = false;

	for (let index = 0; index < css.length; index += 1) {
		const character = css[index];
		const nextCharacter = css[index + 1];

		if (inComment) {
			if (character === '*' && nextCharacter === '/') {
				inComment = false;
				index += 1;
			}
			continue;
		}

		if (quote !== null) {
			if (escaped) {
				escaped = false;
			} else if (character === '\\') {
				escaped = true;
			} else if (character === quote) {
				quote = null;
			}
			continue;
		}

		if (character === '/' && nextCharacter === '*') {
			inComment = true;
			index += 1;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (character === '{') {
			braceDepth += 1;
		} else if (character === '}') {
			braceDepth -= 1;
			if (braceDepth < 0) {
				return false;
			}
		}
	}

	return braceDepth === 0 && quote === null && !inComment;
};

/**
 * Fail-closed validation. The transformer must not silently produce a
 * bundle-shaped output when the upstream is missing, empty, or does not
 * match the structural contract the engine relies on.
 */
const validateUpstream = (
	css: string,
):
	| { ok: true }
	| {
			ok: false;
			reason: 'upstream-empty';
	  }
	| {
			ok: false;
			reason: 'upstream-unparseable';
	  }
	| {
			ok: false;
			reason: 'upstream-unsupported-z-index';
	  }
	| {
			ok: false;
			reason: 'upstream-missing-structural-selector';
			missing: string[];
	  } => {
	const trimmed = css.trim();
	if (trimmed.length === 0) {
		return { ok: false, reason: 'upstream-empty' };
	}
	if (!isParseableCss(trimmed)) {
		return { ok: false, reason: 'upstream-unparseable' };
	}
	const missing = UPSTREAM_STRUCTURAL_SELECTORS.filter(
		(selector) => !trimmed.includes(selector),
	);
	if (missing.length > 0) {
		return {
			ok: false,
			reason: 'upstream-missing-structural-selector',
			missing,
		};
	}
	const withoutKnownZIndex = stripKnownUpstreamZIndexDeclarations(trimmed);
	if (hasRawZIndexDeclaration(withoutKnownZIndex)) {
		return { ok: false, reason: 'upstream-unsupported-z-index' };
	}
	return { ok: true };
};

export const transformSimplebarUpstreamCssOrThrow = (
	upstreamCss: string,
): string => {
	const validation = validateUpstream(upstreamCss);
	if (!validation.ok) {
		if (validation.reason === 'upstream-empty') {
			throw new Error(
				'upstream simplebar-core CSS is empty. The transformer cannot safely substitute raw literals against an unknown upstream — restore the installed package or pin a compatible simplebar-core version.',
			);
		}
		if (validation.reason === 'upstream-unparseable') {
			throw new Error(
				'upstream simplebar-core CSS is unparseable. The transformer cannot safely apply block-local replacements — update the transformer or pin a compatible simplebar-core version.',
			);
		}
		if (validation.reason === 'upstream-unsupported-z-index') {
			throw new Error(
				'upstream simplebar-core CSS contains an unsupported z-index declaration (changed or new). The transformer only understands the four current stacking declarations — update the stacking decision and transformer before accepting this upstream release.',
			);
		}
		throw new Error(
			`upstream simplebar-core CSS is missing structural selector(s) the engine contract relies on: ${validation.missing.join(', ')}. The transformer cannot safely substitute raw literals against an unknown upstream — update the transformer or pin a compatible simplebar-core version.`,
		);
	}
	const stripped = stripKnownUpstreamZIndexDeclarations(upstreamCss);
	const retokenized = applyDeclarationReplacements(stripped);
	const css = `${retokenized.trim()}\n${POLICY_ADDITIONS}`;
	return css;
};

/**
 * Tailwind v4 stashes its resolver on the global object so userland
 * Vite plugins can override it. The TypeScript lib types do not declare
 * it, so this type is the contract the plugin actually depends on.
 */
type TwResolve = (specifier: string, base: string) => string | undefined;

type TailwindGlobals = {
	__tw_resolve?: TwResolve;
};

const twGlobals = globalThis as TailwindGlobals;

/**
 * Materialise the transformed CSS to a cache file under `node_modules/.cache/`.
 * Tailwind v4's CSS loader calls `readFile` directly on the resolved path
 * (see `loadStylesheet` in `@tailwindcss/node`); `globalThis.__tw_load` is
 * only consulted for module imports. The supported interception point is
 * `globalThis.__tw_resolve`, which must return a real on-disk path.
 *
 * The cache is materialised once per Vite process by `installHooks` and
 * rewritten (idempotently) with the freshly-read upstream every time, so an
 * install that bumps the pin, or an upstream file that a running process
 * already read, is reflected on the next process start — the dev server must
 * be restarted after an upstream bump, which is the normal install workflow.
 */
const materialiseTransformedUpstream = (
	upstreamAbsolutePath: string,
	frontDirectory: string,
): string => {
	const publyCacheDir = join(frontDirectory, 'node_modules', '.cache', 'publy');
	if (!existsSync(publyCacheDir)) {
		mkdirSync(publyCacheDir, { recursive: true });
	}

	const upstreamCss = readFileSync(upstreamAbsolutePath, 'utf8');
	const transformed = transformSimplebarUpstreamCssOrThrow(upstreamCss);
	const cacheFile = `${publyCacheDir}/simplebar-core.dist.simplebar.css.transformed`;
	writeFileSync(cacheFile, transformed, 'utf8');
	return cacheFile;
};

/**
 * Vite plugin entry point. Wires Tailwind v4's `globalThis.__tw_resolve`
 * hook so an `@import 'simplebar-core/dist/simplebar.css'` in `app.css`
 * resolves through the transformer at build time. Tailwind's CSS loader
 * reads the resolved path directly via `readFile`, so the only supported
 * interception point is the resolver itself — `globalThis.__tw_load` is
 * only consulted for module imports, not CSS. The hook materialises a
 * transformed copy of the upstream CSS into a per-install cache file under
 * `node_modules/.cache/publy/` and returns that path.
 *
 * The hooks are restored to their previous values in `buildEnd` so the
 * plugin does not leak across unrelated test workers or future build runs
 * that re-use the same Node process.
 *
 * The `name` is namespaced under `publy:` so it does not collide with
 * user plugins. The plugin is opt-in: it intercepts ONLY the exact
 * upstream specifier.
 */
export const transformSimplebarUpstreamCssPlugin = ({
	frontDirectory,
}: {
	frontDirectory: string;
}): Plugin => {
	const requireFromFront = createRequire(`${frontDirectory}/package.json`);
	const upstreamAbsolutePath = requireFromFront.resolve(
		SIMPLEBAR_UPSTREAM_REQUIRE_SPECIFIER,
	);

	let previousResolve: TwResolve | undefined;
	let installed = false;

	const installHooks = () => {
		if (installed) {
			return;
		}
		installed = true;
		previousResolve = twGlobals.__tw_resolve;

		const cachePath = materialiseTransformedUpstream(
			upstreamAbsolutePath,
			frontDirectory,
		);

		twGlobals.__tw_resolve = (
			specifier: string,
			base: string,
		): string | undefined => {
			if (specifier === SIMPLEBAR_UPSTREAM_REQUIRE_SPECIFIER) {
				return cachePath;
			}
			return previousResolve?.(specifier, base);
		};
	};

	const restoreHooks = () => {
		if (!installed) {
			return;
		}
		installed = false;
		if (previousResolve === undefined) {
			delete twGlobals.__tw_resolve;
		} else {
			twGlobals.__tw_resolve = previousResolve;
		}
	};

	return {
		name: 'publy:transform-simplebar-upstream-css',
		configResolved() {
			installHooks();
		},
		buildEnd() {
			restoreHooks();
		},
		configureServer(server) {
			installHooks();
			server.httpServer?.once('close', () => {
				restoreHooks();
			});
		},
	};
};
