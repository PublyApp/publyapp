import { expect, test, type Response } from '@playwright/test';

const TEST_API_ORIGIN = new URL(
	process.env.E2E_API_BASE_URL ?? 'http://api.front.localhost:5000',
).origin;

const expectCspHeader = (response: Response | null) => {
	const csp = response?.headers()['content-security-policy'];

	expect(csp).toContain('connect-src');
	expect(csp).toContain(TEST_API_ORIGIN);
};

test('renders the current app login page from the deployed compose stack', async ({
	page,
}) => {
	const response = await page.goto('/login');

	expect(response?.ok()).toBe(true);
	await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
	await expect(
		page.getByRole('textbox', { name: 'Email address' }),
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('serves CSP headers on prerendered html paths', async ({ page }) => {
	for (const path of ['/', '/login', '/index.html', '/login/index.html']) {
		expectCspHeader(await page.goto(path));
	}
});
