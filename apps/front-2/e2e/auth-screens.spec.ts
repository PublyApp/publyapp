import { expect, test } from '@playwright/test';

// The `chromium` project supplies a pre-authenticated staff-admin
// `storageState` (playwright.config.ts, review-r1-tests.md F29) so most specs
// can skip a real form login. Every test in this file specifically asserts
// what an UNAUTHENTICATED visitor sees on an auth screen — with that
// storageState in place, `/login` (and friends) would redirect an
// already-authenticated visitor straight to their workspace instead of
// rendering the auth form, so this file must start from a clean context.
test.use({ storageState: { cookies: [], origins: [] } });

// Every auth screen must render the standalone split-brand auth surface
// (data-testid="auth-layout"), never the marketing/authed app shell — a
// classifier that falls through to 'marketing' for anything but /login would
// wrap these in `.app-shell-header` (with marketing nav + the "front-2 shell"
// subtitle) instead, which no prior test here asserted against
// (review-r1-users-auth.md F1). /accept-invitation is the sharpest case: it
// used to carry its own internal <AuthLayout>, which would pass a bare
// `auth-layout` visibility check even while ALSO nested inside the marketing
// shell — so the "no app-shell-header" half of this assertion is required,
// not optional.
const AUTH_PATHS = [
	'/login',
	'/signup',
	'/verify-email',
	'/reset-password',
	'/accept-invitation',
];

for (const path of AUTH_PATHS) {
	test(`${path} renders the standalone auth layout, not the app shell`, async ({
		page,
	}) => {
		await page.goto(path);

		await expect(page.getByTestId('auth-layout')).toBeVisible();
		await expect(page.locator('.app-shell-header')).toHaveCount(0);
		await expect(page.getByTestId('app-shell-shell')).toHaveCount(0);
	});
}

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
