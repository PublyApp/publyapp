import path from 'node:path';

import type { ViteDevServer } from 'vite';

const FRONT_ROOT = path.resolve(import.meta.dirname, '../..');
const RENDER_TARGET_URL = '/e2e/helpers/entity-crumb-render-target.tsx';

type RenderTargetModule = {
	renderEntityCrumbMarkup: (name: string) => string;
};

let serverPromise: Promise<ViteDevServer> | undefined;

/**
 * A `middlewareMode` Vite dev server used purely as an in-process SSR
 * module loader (no HTTP port opened) — see `entity-crumb-render-target
 * .tsx` for why this file must NOT import that module directly. Reuses the
 * real `apps/front/vite.config.ts` (same `~/*` alias, same
 * `@vitejs/plugin-react`), so the render target and everything it imports
 * (starting with the real `entity-crumb.tsx`) gets compiled the exact same
 * way the shipped app does.
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

/** Renders the REAL `EntityCrumb` component (not a hand-mirrored copy) to
 * static markup — see `entity-crumb-render-target.tsx`'s docstring for why
 * the render itself lives in a separate file loaded through Vite's SSR
 * module graph rather than through this one. */
export const renderEntityCrumbMarkup = async (
	name: string,
): Promise<string> => {
	const vite = await getServer();
	const mod = (await vite.ssrLoadModule(
		RENDER_TARGET_URL,
	)) as RenderTargetModule;
	return mod.renderEntityCrumbMarkup(name);
};

/** Must be called once all specs in a file are done — an open
 * `middlewareMode` Vite server otherwise keeps file watchers / the process
 * alive after the Playwright worker should have exited. */
export const closeEntityCrumbRenderer = async (): Promise<void> => {
	if (!serverPromise) {
		return;
	}
	const vite = await serverPromise;
	serverPromise = undefined;
	await vite.close();
};
