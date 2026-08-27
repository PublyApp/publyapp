import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Cap workers to half the cores — same rationale as vitest.config.ts (see
// W6-FLAKE: oversubscribing the host starves workers past the per-test
// timeout budget the moment anything else competes for the same cores).
const maxWorkers = Math.max(2, Math.floor(cpus().length / 2));

// Replay config for the kept red tests under .dump/preuves/. The default
// vitest.config.ts restricts `include` to `src/**`, so the red tests the
// convention keeps there cannot be run through it. This config extends the
// base one (same aliases, same SSR policy, same worker cap) and overrides
// `include` to also cover .dump/preuves/.
//
// Usage:
//   pnpm --filter front exec vitest run --config vitest.preuves.config.ts \
//     ../../.dump/preuves/<issue>/<name>.test.ts
export default defineConfig({
	resolve: {
		alias: {
			'~': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	ssr: {
		noExternal: [
			'@org/client-ts',
			'@org/shared-ts',
			/@microsoft\/kiota-serialization-(json|form|multipart|text)/,
			/^lodash\//,
			'winston',
			'winston-console-format',
		],
	},
	test: {
		environment: 'node',
		server: {
			deps: {
				inline: ['@org/client-ts', '@org/shared-ts'],
			},
		},
		include: [
			'src/**/*.{test.ts,test.tsx}',
			'.dump/preuves/**/*.test.ts',
			'e2e/helpers/**/*.test.ts',
			'e2e/__tests__/**/*.test.ts',
		],
		exclude: [
			'src/styles/drawer-description-contrast.test.ts',
			'src/lib/i18n-key-coverage.test.ts',
			'src/lib/mutation-feedback-architecture.test.ts',
		],
		setupFiles: ['./vitest.setup.ts'],
		testTimeout: 30000,
		maxWorkers,
	},
});
