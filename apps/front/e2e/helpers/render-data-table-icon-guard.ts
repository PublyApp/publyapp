import path from 'node:path';

import type { ViteDevServer } from 'vite';

const FRONT_ROOT = path.resolve(import.meta.dirname, '../..');
const RENDER_TARGET_URL = '/e2e/helpers/data-table-icon-guard-target.tsx';

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
