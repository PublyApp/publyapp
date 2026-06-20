import { createServerFn } from '@tanstack/react-start';

import {
	buildI18nResources,
	resolveLocaleFromCookie,
} from '../lib/i18n.server';

// Server fn boundary so the node:fs-backed SSR i18n loader (lib/i18n.server.ts) never
// leaks into the client bundle. The root loader (__root.tsx) calls this to resolve the
// request locale (from the `publyapp-locale` cookie) + its preloaded resources.
//
// NOTE: this file is intentionally NOT named `*.server.ts`. Start's import-protection
// denies `**/*.server.*` imports into client-imported modules (and __root.tsx renders
// on the client). A `createServerFn` IS the RPC-bridge boundary — Start replaces the
// handler with a client stub, so the handler's `lib/i18n.server.ts` (node:fs) import
// stays server-only even though this wrapper file is importable from the root route.
export const loadI18nForRequest = createServerFn({ method: 'GET' }).handler(
	async () => {
		const locale = resolveLocaleFromCookie();
		const resources = await buildI18nResources(locale);
		return { locale, resources };
	},
);
