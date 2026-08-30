import { cpus } from 'node:os';

import { defineConfig } from 'vitest/config';

// Cap workers to half the cores — same rationale as vitest.config.ts (see
// W6-FLAKE: oversubscribing the host starves workers past the per-test
// timeout budget the moment anything else competes for the same cores).
const maxWorkers = Math.max(2, Math.floor(cpus().length / 2));

// Replay config for kept-red proof tests declared via PRs under
// tests/proofs/<issue>/. The default vitest.config.ts restricts `include`
// to `src/**`, so proof tests — which are EXPECTED TO FAIL — are never
// collected by the green suite. This config extends the base one and
// includes ONLY the versioned tests/proofs/ directory.
//
// Usage (replay a specific proof):
//   cd packages/scripts-ts && pnpm exec vitest run --config vitest.preuves.config.ts \
//     tests/proofs/<issue>/<name>.test.ts
//
// Usage (all proofs):
//   cd packages/scripts-ts && pnpm exec vitest run --config vitest.preuves.config.ts \
//     tests/proofs/
export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/proofs/**/*.test.ts'],
		exclude: [],
		maxWorkers,
	},
});
