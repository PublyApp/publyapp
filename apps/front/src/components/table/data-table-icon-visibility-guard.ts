/**
 * `assertIconIsVisible` — fails the test if the icon element inside a checkbox
 * (or any other surface that has a `data-icon` child) is visually hidden from
 * the user. Used by the row-selection integration test
 * (`data-table-selection-integration.test.tsx`) to guarantee the check state
 * the test asserts (checked / indeterminate) is actually painted, not just
 * declared on the DOM.
 *
 * # Background
 *
 * `data-icon` alone only proves an icon is *declared*, never that it is
 * *visible*. A mutation that hides the icon while keeping the attribute
 * present and readable would keep a `data-icon` test green while the user
 * sees an empty box. The function below is the guard against that family of
 * regressions.
 *
 * # Why a measurement, not a class enumeration
 *
 * An earlier version of this function checked for two specific Tailwind
 * utilities: `invisible` (→ `visibility:hidden`) and `hidden` (→
 * `display:none`). That is a class enumeration, and a class enumeration is, by
 * construction, never exhaustive. It does not catch `opacity-0`
 * (opacity:0 — the icon is painted but transparent), `aria-hidden="true"`
 * on the icon itself (a screen-reader-only hide that does not change CSS at
 * all), `clip-path-*`, `size-0`, or off-screen `translate-*` translations.
 * Each new entry would re-introduce the same design defect: the guard
 * asserts a list of strings, not the property it claims to assert.
 *
 * The fix is to MEASURE the icon's visibility from the user's perspective,
 * not enumerate candidate class names. jsdom does not resolve Tailwind
 * utility classes into computed styles on its own, so the helper takes a
 * `getComputedStyle`-like reader as an injection point. In the jsdom
 * test, the helper is paired with a stylesheet injector that compiles the
 * relevant Tailwind utilities and inserts them into `document.styleSheets`,
 * so `getComputedStyle` returns the real Tailwind values and the helper
 * reads `visibility`, `display`, and `opacity` like a browser would.
 *
 * `aria-hidden` is a DOM attribute, not a CSS value, so it is checked
 * directly on the element — no stylesheet needed.
 *
 * @vitest-environment node
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'tailwindcss';

const SOURCE_HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT_ROOT = path.resolve(SOURCE_HERE, '../../..');
const APP_CSS_PATH = path.join(FRONT_ROOT, 'src/styles/app.css');

/** A reader for the icon element's computed CSS. Defaults to
 * `window.getComputedStyle`, but callers may inject a wrapper (the unit-test
 * bridge does, because jsdom cannot see Tailwind utilities by itself). */
export type ComputedStyleReader = (element: Element) => {
	visibility: string;
	display: string;
	opacity: string;
};

const defaultReader: ComputedStyleReader = (element) => {
	const computed = window.getComputedStyle(element);
	return {
		visibility: computed.visibility,
		display: computed.display,
		opacity: computed.opacity,
	};
};

/**
 * The Tailwind utility classes whose computed-style outcomes the guard
 * needs to know. The unit-test bridge injects compiled CSS for these into
 * the jsdom stylesheet so `getComputedStyle` returns the real Tailwind
 * values for `visibility`, `display`, and `opacity`. `hidden` and
 * `invisible` are the two the old enumeration covered; `opacity-0` is the
 * one that slipped through; `aria-hidden` is a DOM attribute, not a CSS
 * utility, so it is not in this list.
 */
export const GUARD_UTILITY_CLASSES = ['hidden', 'invisible', 'opacity-0'] as const;

/**
 * The compiled CSS string for the guard's utility classes — the same CSS the
 * production app ships. Built lazily on first use and cached. Theme is
 * irrelevant (the three utilities are theme-independent).
 */
let compiledGuardCssPromise: Promise<string> | null = null;

// Tailwind v4's `compile` takes the CSS source as a string (it imports
// sub-stylesheets through the `loadStylesheet` hook), not a file path —
// `compile(APP_CSS_PATH, …)` compiles the literal path string as if it were
// CSS, which produces empty utility output. Read the file once and feed the
// contents, the same shape the drawer-description guard uses.
const appCssSource = readFileSync(APP_CSS_PATH, 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	'',
);

// Tailwind v4's `loadStylesheet` hook is called with the literal import id
// the input CSS uses (`@import 'tailwindcss'`, `@import 'tw-animate-css'`,
// `@import 'shadcn/tailwind.css'`, plus the relative `./landing.css` import
// app.css carries). The first three are not paths; they are bare specifiers
// the bundler resolves to a real CSS file at build time. The hook must
// resolve each one to a real file on disk, then return the contents, so the
// compiler can pull in the utilities those stylesheets declare (every
// Tailwind utility class lives behind one of those three imports).
const tailwindIndexPath = fileURLToPath(
	import.meta.resolve('tailwindcss/index.css'),
);
const guardStylesDirectory = path.dirname(APP_CSS_PATH);

const findPackageRoot = (packageName: string): string => {
	let directory = FRONT_ROOT;
	for (;;) {
		const candidate = path.join(directory, 'node_modules', packageName);
		if (existsSync(path.join(candidate, 'package.json'))) {
			return candidate;
		}
		const parent = path.dirname(directory);
		if (parent === directory) {
			throw new Error(
				`Icon-visibility guard cannot locate package ${packageName} for app.css`,
			);
		}
		directory = parent;
	}
};

const resolveGuardStylesheetImport = (id: string, base: string): string => {
	if (id === 'tailwindcss') {
		return tailwindIndexPath;
	}
	if (id === 'tw-animate-css') {
		const packageJson = JSON.parse(
			readFileSync(
				path.join(findPackageRoot(id), 'package.json'),
				'utf8',
			),
		) as { style?: string; main?: string };
		const entry = packageJson.style ?? packageJson.main;
		if (entry === undefined) {
			throw new Error(`tw-animate-css has no style/main entry`);
		}
		return path.join(findPackageRoot(id), entry);
	}
	if (id === 'shadcn/tailwind.css') {
		return path.join(findPackageRoot('shadcn'), 'dist', 'tailwind.css');
	}
	if (id.startsWith('./') || id.startsWith('../')) {
		const candidate = path.resolve(base, id);
		if (
			path.extname(candidate) === '.css' &&
			existsSync(candidate) &&
			statSync(candidate).isFile()
		) {
			return candidate;
		}
	}
	throw new Error(
		`Icon-visibility guard cannot resolve stylesheet import ${id} in app.css`,
	);
};

const compileGuardCss = async (): Promise<string> => {
	const compiler = await compile(appCssSource, {
		base: guardStylesDirectory,
		loadStylesheet: async (id, base) => {
			const resolved = resolveGuardStylesheetImport(id, base);
			return {
				base: path.dirname(resolved),
				path: resolved,
				content: readFileSync(resolved, 'utf8'),
			};
		},
	});
	const built = compiler.build([...GUARD_UTILITY_CLASSES]);
	return built.replace(/^\/\*![\s\S]*?\*\/\s*/, '');
};

const getCompiledGuardCss = (): Promise<string> => {
	if (compiledGuardCssPromise === null) {
		compiledGuardCssPromise = compileGuardCss();
	}
	return compiledGuardCssPromise;
};

/**
 * Injects the compiled guard CSS into the given document's stylesheets so
 * `getComputedStyle` returns the real Tailwind values for `hidden`,
 * `invisible`, and `opacity-0`. Idempotent: re-injecting the same CSS is a
 * no-op.
 *
 * Returns `true` on the first successful injection of a non-empty CSS
 * string; `false` if the compile failed or returned an empty result.
 */
export const injectGuardStylesheet = async (
	document: Document,
): Promise<boolean> => {
	const css = await getCompiledGuardCss();
	if (css.length === 0) {
		return false;
	}
	const existing = Array.from(
		document.querySelectorAll('style[data-publy-icon-guard]'),
	);
	if (existing.length > 0) {
		// Already injected; nothing to do.
		return true;
	}
	const styleElement = document.createElement('style');
	styleElement.setAttribute('data-publy-icon-guard', '');
	styleElement.textContent = css;
	document.head.appendChild(styleElement);
	return true;
};

/**
 * The reason an icon was declared hidden — used by `assertIconIsVisible`'s
 * failure message so a test failure names the exact hiding mechanism
 * instead of a generic "icon is hidden".
 */
export type IconHiddenReason =
	| { kind: 'aria-hidden'; message: string }
	| { kind: 'css-visibility'; value: string; message: string }
	| { kind: 'css-display'; value: string; message: string }
	| { kind: 'css-opacity'; value: number; message: string };

/**
 * Inspects the icon element and returns the reason it is hidden, or `null`
 * if it is visible. Pure: does not throw. The caller decides whether a
 * hidden reason is a test failure.
 *
 * @param iconElement The `data-icon` element to inspect.
 * @param context A short label identifying the icon (used in error
 * messages).
 * @param readComputed Optional injected computed-style reader. Defaults to
 * `window.getComputedStyle`. The unit-test bridge passes a custom reader
 * when stylesheet injection is impossible.
 */
export const detectIconHidden = (
	iconElement: Element,
	context: string,
	readComputed: ComputedStyleReader = defaultReader,
): IconHiddenReason | null => {
	// 1. aria-hidden: a DOM attribute, not a CSS value. Direct read.
	if (iconElement.getAttribute('aria-hidden') === 'true') {
		return {
			kind: 'aria-hidden',
			message: `${context}: icon has aria-hidden="true"`,
		};
	}

	// 2. CSS-side measurement. `visibility:hidden` makes the icon invisible
	// while keeping its box (Tailwind `invisible`).
	const computed = readComputed(iconElement);
	if (computed.visibility === 'hidden') {
		return {
			kind: 'css-visibility',
			value: computed.visibility,
			message: `${context}: icon has computed visibility:hidden`,
		};
	}

	// 3. `display:none` removes the icon from the layout entirely (Tailwind
	// `hidden`).
	if (computed.display === 'none') {
		return {
			kind: 'css-display',
			value: computed.display,
			message: `${context}: icon has computed display:none`,
		};
	}

	// 4. `opacity:0` paints the icon transparently. The icon is still in the
	// layout and announces itself to assistive tech; it is invisible to a
	// sighted user. This is the mutation the old enumeration missed.
	const parsedOpacity = Number.parseFloat(computed.opacity);
	if (Number.isFinite(parsedOpacity) && parsedOpacity === 0) {
		return {
			kind: 'css-opacity',
			value: parsedOpacity,
			message: `${context}: icon has computed opacity:0`,
		};
	}

	return null;
};

/**
 * Asserts that the icon element inside the given surface is NOT hidden by
 * any of the four mechanisms the guard covers (`aria-hidden="true"`,
 * `visibility:hidden`, `display:none`, `opacity:0`). Fails the current
 * test with a named reason when the icon is hidden.
 *
 * Throws an `Error` whose message names the hiding reason — `vitest` reports
 * the message verbatim, so a test failure points at the exact mechanism
 * instead of a generic "icon is hidden".
 */
export const assertIconIsVisible = (
	iconElement: Element | null,
	context: string,
	readComputed?: ComputedStyleReader,
): void => {
	if (iconElement === null) {
		throw new Error(`${context}: icon element is null`);
	}
	const reason = detectIconHidden(iconElement, context, readComputed);
	if (reason !== null) {
		throw new Error(reason.message);
	}
};
