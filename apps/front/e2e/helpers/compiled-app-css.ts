import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const FRONT_ROOT = path.resolve(import.meta.dirname, '../..');
const CLIENT_ASSETS_DIR = path.join(FRONT_ROOT, 'dist/client/assets');

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
 * than two independent ones.
 *
 * Builds on demand (idempotent, ~2s locally) if
 * `dist/client/assets/*.css` is not already present from a prior
 * `pnpm --filter front build`, so these specs work from a clean checkout
 * without a separate manual build step.
 */
export const readCompiledAppCss = (): string => {
	let cssPath = findAppCssPath();
	if (!cssPath) {
		execSync('pnpm run build', { cwd: FRONT_ROOT, stdio: 'inherit' });
		cssPath = findAppCssPath();
	}
	if (!cssPath) {
		throw new Error(
			'Expected a compiled app-*.css asset under dist/client/assets after ' +
				'`pnpm --filter front build` — see scripts/verify-build-css-link.mjs.',
		);
	}
	return readFileSync(cssPath, 'utf8');
};
