import { expect, test } from '@playwright/test';

test.describe('smoke', { tag: ['@public', '@733'] }, () => {
	test('renders the minimal front shell from the deployed compose stack', async ({
		page,
	}) => {
		const response = await page.goto('/');

		expect(response?.ok()).toBe(true);
		await expect(page.locator('html')).toBeAttached();
		await expect(page.getByTestId('landing-hero-title')).toBeVisible();
	});
});
