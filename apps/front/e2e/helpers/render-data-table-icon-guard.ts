import path from 'node:path';

import { build } from 'esbuild';
import type { ViteDevServer } from 'vite';

const FRONT_ROOT = path.resolve(import.meta.dirname, '../..');
const RENDER_TARGET_URL = '/e2e/helpers/data-table-icon-guard-target.tsx';
const ICON_GUARD_BROWSER_ENTRY = path.join(
	FRONT_ROOT,
	'e2e/helpers/icon-guard-browser-entry.ts',
);

type RenderTargetModule = {
	renderDataTableAllSelectedMarkup: () => string;
};

let serverPromise: Promise<ViteDevServer> | undefined;

/**
 * A `middlewareMode` Vite dev server used purely as an in-process SSR
 * module loader (no HTTP port opened) — see `render-focus-ring.ts` for the
 * same pattern. The render target is the REAL `DataTable` component
 * (rendered with all rows selected, so the header checkbox has a `check`
 * icon to guard), not a hand-mirrored span carrying the same class
 * strings. Reuses the real `apps/front/vite.config.ts` (same `~/*`
 * alias, same `@vitejs/plugin-react`), so the rendered HTML carries the
 * exact class names Base UI's `Checkbox.Indicator` and the real
 * `IconCheck` ship.
 */
const getServer = (): Promise<ViteDevServer> => {
	serverPromise ??= import('vite').then(({ createServer }) =>
		createServer({
			root: FRONT_ROOT,
			configFile: path.join(FRONT_ROOT, 'vite.config.ts'),
			server: { middlewareMode: true, hmr: false, watch: null },
			appType: 'custom',
			logLevel: 'warn',
		}),
	);
	return serverPromise;
};

export type DataTableIconGuardRenderResult = {
	markup: string;
};

/** Renders the real `DataTable` component with every row selected to
 * static markup for the icon visibility guard spec — see
 * `data-table-icon-guard-target.tsx`. */
export const renderDataTableAllSelected =
	async (): Promise<DataTableIconGuardRenderResult> => {
		const vite = await getServer();
		const mod = (await vite.ssrLoadModule(
			RENDER_TARGET_URL,
		)) as RenderTargetModule;
		return { markup: mod.renderDataTableAllSelectedMarkup() };
	};

let iconGuardBrowserScriptPromise: Promise<string> | undefined;

/**
 * Bundles the REAL icon visibility guard module (and its `i18next` import)
 * into one self-contained classic `<script>` for the spec's page. The entry
 * (`icon-guard-browser-entry.ts`) only imports `assertIconIsVisible` from
 * `src/components/table/data-table-icon-visibility-guard.ts` and assigns it to
 * `window.__iconVisibilityGuard` — the logic that runs in the browser is the
 * guard module's own code, bundled verbatim, with its default reader (the
 * page's `window.getComputedStyle`) resolving to Chromium's. Built once per
 * Playwright worker process, mirroring `compiled-app-css.ts`'s
 * build-once-per-process contract, so a run always measures the current
 * source without paying the bundling cost per test.
 */
export const getIconGuardBrowserScript = async (): Promise<string> => {
	iconGuardBrowserScriptPromise ??= build({
		entryPoints: [ICON_GUARD_BROWSER_ENTRY],
		bundle: true,
		format: 'iife',
		platform: 'browser',
		target: 'es2022',
		// i18next guards on `process.env.NODE_ENV`; the browser page has no
		// `process`, so substitute the literal so the bundled code never
		// dereferences it at runtime.
		define: { 'process.env.NODE_ENV': '"production"' },
		write: false,
		logLevel: 'error',
	}).then((result) => {
		const output = result.outputFiles[0];
		if (!output) {
			throw new Error(
				'esbuild produced no output for the icon guard browser bundle',
			);
		}
		return output.text;
	});
	return iconGuardBrowserScriptPromise;
};

/** Must be called once all specs in a file are done — an open
 * `middlewareMode` Vite server otherwise keeps file watchers / the
 * process alive after the Playwright worker should have exited. */
export const closeDataTableIconGuardRenderer = async (): Promise<void> => {
	if (!serverPromise) {
		return;
	}
	const vite = await serverPromise;
	serverPromise = undefined;
	await vite.close();
};
