import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { assertFocusRingUtilitiesPinned } from './compiled-focus-ring-pins';

const FRONT_ROOT = path.resolve(import.meta.dirname, '../..');
const CLIENT_ASSETS_DIR = path.join(FRONT_ROOT, 'dist/client/assets');

// Every input that can change what Tailwind/Vite emit into `app-*.css`:
// component/route source (Tailwind scans it for utility classes), the raw
// stylesheet itself, and the two config files that drive the build. Deliberately
// broad (all of `src/`, not just `styles/app.css`) because a class rename in a
// `.tsx` file is exactly the kind of change that must invalidate the compiled
// asset too.
const FRESHNESS_INPUTS = [
	path.join(FRONT_ROOT, 'src'),
	path.join(FRONT_ROOT, 'vite.config.ts'),
	path.join(FRONT_ROOT, 'package.json'),
];

const findAppCssPath = (): string | undefined => {
	let entries: string[];
	try {
		entries = readdirSync(CLIENT_ASSETS_DIR);
	} catch {
		return undefined;
	}
	const match = entries.find((name) => /^app-.*\.css$/.test(name));
	return match ? path.join(CLIENT_ASSETS_DIR, match) : undefined;
};

/** Newest mtime (ms) of `targetPath` itself, or of anything under it when it
 * is a directory. Missing paths contribute `0` rather than throwing — a
 * config file that doesn't exist yet cannot make anything stale. */
const newestMtimeMs = (targetPath: string): number => {
	let stat;
	try {
		stat = statSync(targetPath);
	} catch {
		return 0;
	}

	if (!stat.isDirectory()) {
		return stat.mtimeMs;
	}

	let newest = stat.mtimeMs;
	for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
		if (entry.name === 'node_modules') {
			continue;
		}
		const childNewest = newestMtimeMs(path.join(targetPath, entry.name));
		if (childNewest > newest) {
			newest = childNewest;
		}
	}
	return newest;
};

const newestSourceMtimeMs = (): number =>
	Math.max(...FRESHNESS_INPUTS.map((inputPath) => newestMtimeMs(inputPath)));

const isFresh = (cssPath: string): boolean =>
	statSync(cssPath).mtimeMs >= newestSourceMtimeMs();

const build = (): void => {
	execSync('pnpm run build', { cwd: FRONT_ROOT, stdio: 'inherit' });
};

/**
 * True once THIS process has itself run `build()`. A pre-existing
 * `dist/client/assets/app-*.css` can carry a misleadingly fresh mtime — a
 * restore tool that preserves old timestamps, or ordinary clock skew — so an
 * mtime comparison against a leftover asset from before this run started can
 * never be trusted as proof of freshness (round-3 review of #973 reproduced
 * this false pass). The only state this helper treats as trustworthy is a
 * build it performed itself in this process; `isFresh` below is then only a
 * post-build sanity check (did the build actually touch the file), never the
 * decision for whether to build in the first place.
 */
let hasBuiltThisProcess = false;

/**
 * Returns the REAL compiled production CSS (Tailwind v4 fully resolved —
 * `@theme`/`@layer`/utility classes compiled to plain rules and cascade
 * layers) rather than the raw `src/styles/app.css` source. A browser cannot
 * parse the source file directly: it contains `@import 'tailwindcss'`,
 * `@theme inline { ... }`, `@custom-variant`, etc., which only Tailwind's
 * own build step understands — a plain `<style>` tag with that raw text
 * would silently define none of the `--publy-*` tokens or component
 * classes this repo's e2e specs need to measure.
 *
 * Ported from the `feat/ui-profile-batch` lane's identical helper (#992
 * review round 2) rather than reinvented, per the #973 round-3 review's
 * instruction to keep one hermetic-geometry pattern in the repo rather
 * than two independent ones. That round-3 review also found the ported
 * helper reused ANY pre-existing `dist/client/assets/app-*.css` without
 * checking it was still current: a `right:999px` production-source mutation
 * passed 3/3 against a seven-second-old compiled asset and only failed
 * after a manual rebuild. The fix below closes that — and does so without
 * trusting the compiled asset's mtime at all (see `hasBuiltThisProcess`):
 * this helper always builds once per process before ever reading the
 * asset, and throws (rather than silently returning stale CSS) if the
 * asset is somehow still older than source immediately after that build.
 *
 * Builds on demand (idempotent, ~2s locally) so these specs work from a
 * clean checkout without a separate manual build step. Rather than an mtime
 * comparison deciding whether a rebuild is needed (see `hasBuiltThisProcess`
 * above for why that comparison alone cannot be trusted), this process
 * always builds once, the first time either spec in this project calls in —
 * so a source edit with no manual rebuild in between, AND a leftover `dist/`
 * from a previous run with a misleading mtime, can never be measured against
 * a stale asset. Only the two specs in this project call this helper, so the
 * one-build-per-process cost stays exactly what it was before this fix.
 */
/**
 * #1405 — structural fail-loud gate run on EVERY read of the compiled
 * asset, before a browser session is ever spent on it. The guard measures
 * this stylesheet as ground truth; a half-delivered or wrong file must stop
 * the run here with a plain-words cause instead of degrading into phantom
 * green assertions downstream.
 */
export const assertUsableCompiledCss = (css: string): void => {
	if (!css.trim()) {
		throw new Error(
			'Compiled app-*.css is empty — the build produced no usable ' +
				'stylesheet, so there is nothing to measure the focus contract ' +
				'against.',
		);
	}

	const openBraces = (css.match(/\{/g) ?? []).length;
	const closeBraces = (css.match(/\}/g) ?? []).length;
	if (openBraces === 0 || openBraces !== closeBraces) {
		throw new Error(
			`Compiled app-*.css looks truncated or malformed (${openBraces} '{' vs ` +
				`${closeBraces} '}') — refusing to measure against a partially ` +
				'delivered stylesheet.',
		);
	}

	// Balanced but foreign output (an asset from another pipeline, a
	// mis-pointed path that happens to hold some other CSS) would parse fine
	// in the browser and then fail far from the cause. Every marker below is
	// emitted by THIS app's Tailwind v4 build.
	const missingMarkers = ['--publy-focus-ring', ':focus-visible'].filter(
		(marker) => !css.includes(marker),
	);
	if (missingMarkers.length > 0) {
		throw new Error(
			`Compiled app-*.css does not carry the production stylesheet markers ` +
				`(missing: ${missingMarkers.join(', ')}) — the asset under ` +
				'dist/client/assets is not the stylesheet this guard is written ' +
				'against.',
		);
	}

	// #1415 — the box-shadow-ring half of the allowlisted primitives'
	// contract, pinned structurally on every read: the compiled sheet must
	// still carry the `:focus-visible` ring rules at the widths DESIGN.md
	// ("Focus rings") documents (3px family + checkbox's 2px). Zero matching
	// rules fails loud here — never "0 rules → pass".
	assertFocusRingUtilitiesPinned(css);
};

export const readCompiledAppCss = (): string => {
	if (!hasBuiltThisProcess) {
		build();
		hasBuiltThisProcess = true;
	}
	const cssPath = findAppCssPath();
	if (!cssPath) {
		throw new Error(
			'Expected a compiled app-*.css asset under dist/client/assets after ' +
				'`pnpm --filter front build` — see scripts/guards/verify-build-css-link.mts.',
		);
	}
	if (!isFresh(cssPath)) {
		throw new Error(
			`Compiled asset ${cssPath} is older than front source immediately ` +
				'after this process built it. Refusing to read it as production ' +
				'CSS — this indicates the build did not pick up a current source ' +
				'change (or the clock/filesystem mtime is unreliable in this ' +
				'environment).',
		);
	}
	const css = readFileSync(cssPath, 'utf8');
	assertUsableCompiledCss(css);
	return css;
};
