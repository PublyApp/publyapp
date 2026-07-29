import { expect, test } from '@playwright/test';

test('renders the minimal front shell from the deployed compose stack', async ({
	page,
}) => {
	const response = await page.goto('/');

	expect(response?.ok()).toBe(true);
	await expect(page.locator('html')).toBeAttached();
	await expect(
		page.getByRole('heading', { name: 'Welcome to PublyApp' }),
	).toBeVisible();
});
