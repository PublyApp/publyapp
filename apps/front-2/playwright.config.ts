import { defineConfig, devices } from '@playwright/test';

const faultSpecs = ['**/auth-error.spec.ts', '**/log-leak.spec.ts'];

export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	expect: {
		timeout: 5_000,
	},
	reporter: [
		['list'],
		['html', { outputFolder: 'playwright-report', open: 'never' }],
	],
	use: {
		baseURL: 'https://front-2.localhost:8443',
		headless: true,
		ignoreHTTPSErrors: true,
	},
	projects: [
		{
			name: 'chromium',
			testIgnore: faultSpecs,
			use: {
				...devices['Desktop Chrome'],
			},
		},
		{
			name: 'chromium-faults',
			testMatch: faultSpecs,
			workers: 1,
			use: {
				...devices['Desktop Chrome'],
			},
		},
	],
});
