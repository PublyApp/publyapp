import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Cap workers to half the cores — same rationale as vitest.config.ts (see
// W6-FLAKE: oversubscribing the host starves workers past the per-test
// timeout budget the moment anything else competes for the same cores).
const maxWorkers = Math.max(2, Math.floor(cpus().length / 2));

// Replay config for kept-red proof tests declared via PRs under
// tests/proofs/<issue>/. The default vitest.config.ts restricts `include` to
// `src/**` (plus e2e helpers/tests), so proof tests — which are EXPECTED TO
// FAIL — are never collected by the green suite. This config extends the base
// one (same aliases, same SSR policy, same worker cap) and includes ONLY the
// versioned tests/proofs/ directory.
//
// Usage (replay a specific proof):
//   cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
//     tests/proofs/<issue>/<name>.test.ts
//
// Usage (all proofs):
//   cd apps/front && pnpm.exec vitest run --config vitest.proofs.config.ts \
//     tests/proofs/
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
			'tests/proofs/**/*.{test.ts,test.tsx}',
			'tests/fixtures/**/*.{test.ts,test.tsx}',
		],
		exclude: [],
		setupFiles: ['./vitest.setup.ts'],
		testTimeout: 30000,
		maxWorkers,
	},
});
