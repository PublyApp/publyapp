import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		// Unit tests for scripts-ts own logic.
		// Green (correctness) proof tests for the scripts-ts ratchets. These tests
		// assert the CORRECT state and MUST pass in the green suite. Red (kept-red)
		// proof tests are NOT included here — they are EXPECTED TO FAIL and are
		// replayed by the paired-red-proofs step via run-preuves.mts with inverted
		// semantics.
		include: [
			'src/**/*.test.ts',
			'tests/proofs/**/green-*.test.ts',
		],
	},
});
