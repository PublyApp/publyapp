import path from 'node:path';

import type { ViteDevServer } from 'vite';

const FRONT_ROOT = path.resolve(import.meta.dirname, '../..');
const RENDER_TARGET_URL = '/e2e/helpers/render-focus-ring-target.tsx';

type RenderTargetModule = {
	renderFocusProbeCaseMarkup: () => { id: string; markup: string }[];
};

let serverPromise: Promise<ViteDevServer> | undefined;

/**
 * A `middlewareMode` Vite dev server used purely as an in-process SSR
 * module loader (no HTTP port opened) — see `render-focus-ring-target.tsx`
 * for why this file must NOT import that module directly. Reuses the real
 * `apps/front/vite.config.ts` (same `~/*` alias, same
 * `@vitejs/plugin-react`), so the render target and everything it imports
 * (the real `ui/*` primitives) gets compiled the exact way the shipped app
 * compiles them. Same convention as `render-entity-crumb.ts` (#973).
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

export type FocusProbeCase = {
	id: string;
	markup: string;
};

/** Renders the REAL ui primitives (not hand-copied class strings) to static
 * markup for the focus-ring cascade spec — see
 * `render-focus-ring-target.tsx`. */
export const renderFocusProbeCases = async (): Promise<FocusProbeCase[]> => {
	const vite = await getServer();
	const mod = (await vite.ssrLoadModule(
		RENDER_TARGET_URL,
	)) as RenderTargetModule;
	return mod.renderFocusProbeCaseMarkup();
};

/** Must be called once all specs in a file are done — an open
 * `middlewareMode` Vite server otherwise keeps file watchers / the process
 * alive after the Playwright worker should have exited. */
export const closeFocusRingRenderer = async (): Promise<void> => {
	if (!serverPromise) {
		return;
	}
	const vite = await serverPromise;
	serverPromise = undefined;
	await vite.close();
};
