import { defineConfig } from 'vitest/config';

// Replay config for kept-red proof tests under tests/proofs/<issue>/.
// The default vitest.config.ts restricts `include` to `src/**/*.test.ts`,
// so proof tests — which are EXPECTED TO FAIL — are never collected by
// the green suite. This config extends the green one with the proof
// directory.
//
// Usage (replay a specific proof):
//   cd packages/scripts-ts && \
//     pnpm exec vitest run --config vitest.preuves.config.ts \
//     tests/proofs/<issue>/<name>.test.ts
//
// Usage (all proofs):
//   cd packages/scripts-ts && \
//     pnpm exec vitest run --config vitest.preuves.config.ts \
//     tests/proofs/
export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts', 'tests/proofs/**/*.{test.ts,test.tsx}'],
		exclude: [],
	},
});
