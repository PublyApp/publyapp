import { defineConfig } from 'vitest/config';

import frontConfig from './vitest.config';

// Round 19 I3: the drawer-description contrast guard is the ONLY test in the
// ordinary front unit suite that launches a real browser (it spawns Chromium
// to measure the drawer paint). Round 15-17 made the ordinary `pnpm --filter
// front test` lane install a browser for it, forcing every unit-lane
// contributor and CI run to provision Chromium for a synthetic guard the live
// e2e already bounds. That guard now runs in the browser-provisioned e2e lane
// (front-e2e.yml, once-only shard-4 block) instead: this config runs exactly
// that one file, and the main vitest.config.ts excludes it so the ordinary
// suite stays browser-free.
export default defineConfig({
	...frontConfig,
	test: {
		...frontConfig.test,
		include: ['src/styles/drawer-description-contrast.test.ts'],
		exclude: [],
	},
});
