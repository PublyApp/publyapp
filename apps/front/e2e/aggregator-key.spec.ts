import { expect, test } from '@playwright/test';

import { loginAsTenantUser, TENANT_ADMIN_CREDENTIALS } from './helpers/login';

const INTEGRATIONS_URL = '/tenant/settings/integrations';
// The e2e API answers aggregator calls from an in-process fake that accepts
// exactly this key (FakeAggregatorServer.E2eValidKey); it never reaches the network.
const VALID_KEY = 'sk_e2e_valid_0123456789abcdef';
const REFUSED_KEY = 'sk_e2e_refused_0123456789abcdef';

test.describe('aggregator key', { tag: ['@tenant-workspace', '@2343'] }, () => {
	test('a refused key shows a field error, a valid key shows its hint, and removing it asks first', async ({
		page,
	}) => {
		await page.context().clearCookies();
		await loginAsTenantUser(page, TENANT_ADMIN_CREDENTIALS);
		await page.goto(INTEGRATIONS_URL);

		const card = page.getByTestId('tenant-settings-aggregators');
		await expect(card).toBeVisible();
		await card.getByRole('button', { name: /^connect /i }).click();

		const drawer = page.getByTestId('aggregator-key-drawer');
		const keyField = drawer.getByTestId('aggregator-api-key');
		const submit = drawer.getByRole('button', { name: /save key/i });
		await keyField.fill(REFUSED_KEY);
		await submit.click();
		await expect(drawer.getByText(/refused this key/i)).toBeVisible();
		await expect(drawer).toBeVisible();

		await keyField.fill(VALID_KEY);
		await submit.click();
		await expect(drawer).toBeHidden();
		await expect(card.getByText(/key ending in cdef/i)).toBeVisible();
		await expect(card.getByText(VALID_KEY)).toHaveCount(0);

		// Removing the key goes through a confirmation that states the consequence.
		await card.getByRole('button', { name: /remove key/i }).click();
		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toContainText(/paste it again/i);
		await dialog.getByRole('button', { name: /remove key/i }).click();
		await expect(card.getByText(/no key saved yet/i)).toBeVisible();
	});
});
