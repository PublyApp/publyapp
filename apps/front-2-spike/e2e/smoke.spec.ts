import { expect, test } from '@playwright/test';

test('renders the anonymous login page from the deployed compose stack', async ({
	page,
}) => {
	const response = await page.goto('/login');

	expect(response?.ok()).toBe(true);
	await expect(page.getByPlaceholder('Email')).toBeVisible();
});
