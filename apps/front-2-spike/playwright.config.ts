import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	expect: {
		timeout: 5_000,
	},
	reporter: 'list',
	use: {
		baseURL: 'https://front-2.localhost:8443',
		headless: true,
		ignoreHTTPSErrors: true,
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
			},
		},
	],
});
