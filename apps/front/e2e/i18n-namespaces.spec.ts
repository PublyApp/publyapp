import { expect, test } from '@playwright/test';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import { FRONT_URL } from './helpers/compose-env';

const cookie = (locale: 'en' | 'fr') => `${LOCALE_COOKIE_KEY}=${locale}`;

declare global {
	interface Window {
		recordEnglishFlash: (value: string) => void;
	}
}

test.describe('i18n namespaces', { tag: ['@i18n', '@909'] }, () => {
	test('French auth SSR contains French auth copy without English fallback', async ({
		request,
	}) => {
		const response = await request.get('/login', {
			headers: { cookie: cookie('fr') },
		});
		const html = await response.text();
		expect(response.ok()).toBe(true);
		expect(html).toContain('Se connecter');
		expect(html).toContain('Pas encore de compte?');
		expect(html).not.toContain('No account yet?');
	});

	test('concurrent SSR requests do not leak locale resources', async ({
		request,
	}) => {
		const [english, french] = await Promise.all([
			request.get('/login', { headers: { cookie: cookie('en') } }),
			request.get('/login', { headers: { cookie: cookie('fr') } }),
		]);
		const [englishHtml, frenchHtml] = await Promise.all([
			english.text(),
			french.text(),
		]);
		expect(englishHtml).toContain('No account yet?');
		expect(englishHtml).not.toContain('Pas encore de compte?');
		expect(frenchHtml).toContain('Pas encore de compte?');
		expect(frenchHtml).not.toContain('No account yet?');
	});

	test('hydration preserves the SSR locale and auth copy', async ({ page }) => {
		// The default chromium project loads the pre-authenticated staff-admin
		// storageState. Clear it first so /login actually renders the login page
		// instead of the authed-user guard redirecting to the workspace.
		await page.context().clearCookies();
		await page.context().addCookies([
			{
				name: LOCALE_COOKIE_KEY,
				value: 'fr',
				url: FRONT_URL,
			},
		]);
		const englishFlash: string[] = [];
		await page.exposeFunction('recordEnglishFlash', (value: string) => {
			englishFlash.push(value);
		});
		await page.addInitScript(() => {
			new MutationObserver(() => {
				if (document.body?.textContent?.includes('No account yet?')) {
					window.recordEnglishFlash('No account yet?');
				}
			}).observe(document.documentElement, { childList: true, subtree: true });
		});
		await page.goto('/login');
		await expect(
			page.getByRole('heading', { name: 'Se connecter' }),
		).toBeVisible();
		await expect(page.getByText('Pas encore de compte?')).toBeVisible();
		expect(englishFlash).toEqual([]);
	});
});
