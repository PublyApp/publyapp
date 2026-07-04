import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	timeout: 45_000,
	expect: {
		timeout: 5_000,
	},
	workers: 1,
	reporter: [
		['list'],
		['html', { outputFolder: 'playwright-report', open: 'never' }],
	],
	use: {
		baseURL: process.env.E2E_FRONT_BASE_URL ?? 'http://front.localhost:5051',
		headless: true,
		trace: 'retain-on-failure',
		launchOptions: {
			args: [
				[
					'--host-resolver-rules=',
					'MAP front.localhost 127.0.0.1,',
					'MAP api.front.localhost 127.0.0.1',
				].join(''),
			],
		},
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
