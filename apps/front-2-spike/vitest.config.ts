import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Vitest config for the spike's API-free unit tests (Tasks 2.1/2.2).
//
// The pure modules under test import from the @org/* workspace packages, which ship
// raw .ts (no build step). Vitest transforms them when they are NOT externalized, so
// we mirror the app's `ssr.noExternal` allowlist here. We deliberately do NOT load the
// TanStack Start vite plugin (these tests never boot the SSR server) — they import the
// pure modules directly, which carry no `@tanstack/react-start` imports.
export default defineConfig({
	resolve: {
		// Vite 8 built-in tsconfig path resolution (mirrors vite.config.ts) — resolves
		// the `~/*` alias; the `@org/*` packages resolve via pnpm workspace symlinks.
		tsconfigPaths: true,
		alias: {
			'~': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	ssr: {
		noExternal: ['@org/client-ts', '@org/shared-ts'],
	},
	test: {
		// Node environment: these are pure logic + custom-fetch tests (no DOM).
		environment: 'node',
		// Transform the raw-.ts workspace deps when imported from tests, too.
		server: {
			deps: {
				inline: ['@org/client-ts', '@org/shared-ts'],
			},
		},
		include: ['src/**/*.test.ts'],
	},
});
