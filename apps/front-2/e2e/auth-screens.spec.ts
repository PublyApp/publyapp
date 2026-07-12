import { expect, test } from '@playwright/test';

test('/signup renders the closed state with the info banner and a disabled CTA', async ({
	page,
}) => {
	await page.goto('/signup');

	await expect(page.getByTestId('signup-closed-alert')).toBeVisible();
	await expect(page.getByTestId('signup-form')).toBeVisible();
	await expect(
		page.getByTestId('signup-form').getByRole('button').first(),
	).toBeDisabled();
});

test('/verify-email renders the request form by default', async ({ page }) => {
	await page.goto('/verify-email');

	await expect(page.getByTestId('verify-email-request-form')).toBeVisible();
});

test('/verify-email with a garbage token shows the shared invalid-link view', async ({
	page,
}) => {
	await page.goto('/verify-email?id=not-a-real-id&token=not-a-real-token');

	await expect(
		page.getByTestId('verify-email-invalid-link-view'),
	).toBeVisible();
});

test('/reset-password renders the request form by default', async ({
	page,
}) => {
	await page.goto('/reset-password');

	await expect(page.getByTestId('reset-password-request-form')).toBeVisible();
});

test('/reset-password with a garbage token shows the shared invalid-link view', async ({
	page,
}) => {
	await page.goto('/reset-password?id=not-a-real-id&token=not-a-real-token');

	await expect(
		page.getByTestId('reset-password-invalid-link-view'),
	).toBeVisible();
});

// A details-card render test (real pending invitation, new-user/existing-user
// branches) would need a seeded invitation token — no e2e helper/seed exposes
// one cheaply (helpers/ only covers login; the token is a backend-encrypted
// id tied to a real DB row), so it's intentionally not added here.
test('/accept-invitation with a garbage token shows the shared invalid-link view', async ({
	page,
}) => {
	await page.goto('/accept-invitation?id=not-a-real-id&token=not-a-real-token');

	await expect(
		page.getByTestId('accept-invitation-invalid-link-view'),
	).toBeVisible();
});
