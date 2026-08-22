import { expect, test } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const TABLE = 'staff-users-table';

/**
 * #975 review follow-up. The review's blind spot: `search-input.test.tsx`
 * runs in jsdom, which has no rendering engine at all, so it can only assert
 * that the CSS *source* still contains the `::-webkit-search-cancel-button`
 * suppression rule — never that a real browser is actually honouring it. The
 * reviewer proved this by deleting the rule entirely and watching every
 * jsdom test stay green.
 *
 * This spec runs in a real Chromium instance (this repo's e2e suite has no
 * Firefox/WebKit projects today — see the gap note below) and verifies the
 * FUNCTIONAL half of the acceptance criteria that a real browser can
 * exercise: with the field populated, exactly one clear control exists, it
 * carries an accessible name, and clicking it empties the field and returns
 * focus. That is genuine real-DOM/real-browser coverage the jsdom test
 * cannot provide (actual Base UI composition, actual click/focus semantics),
 * even though — see below — it cannot certify the specific pseudo-element
 * suppression.
 *
 * What this spec deliberately does NOT claim, and why:
 *
 * The literal ask ("prove the native `::-webkit-search-cancel-button` is
 * suppressed on screen") turns out not to be observable through Playwright
 * on this repo's actual e2e platform (headless Chromium on Linux — the same
 * combination this sandbox and the `front-e2e` GitHub Actions runners both
 * use). Verified directly, with a suppression rule present vs. entirely
 * absent, on an identical `<input type="search">`:
 *   - `getComputedStyle(input, '::-webkit-search-cancel-button').display`
 *     reports the same value ("inline-block") in BOTH cases — Chromium does
 *     not expose this vendor UA-shadow pseudo-element through
 *     `getComputedStyle`'s two-argument form, so it cannot detect the rule
 *     either way.
 *   - `locator.ariaSnapshot()` is identical in both cases (`searchbox: hi`,
 *     no extra node) — no separate accessible node is produced for the
 *     native control in headless Linux Chromium.
 *   - A raw pixel screenshot of the input element is BYTE-IDENTICAL
 *     (matching SHA-256) in both cases — headless Chromium on this platform
 *     does not paint a native cancel icon for `type="search"` at all, so
 *     there is nothing for any Playwright API to observe being suppressed.
 * All three were confirmed with a minimal, app-independent repro, ruling out
 * an app-specific cause. Closing this for real needs either a non-headless
 * run with a virtual framebuffer (a repo-wide `playwright.config.ts` change,
 * well beyond this fix's scope) or manual/visual QA across real desktop
 * Chrome, Firefox, and WebKit — not something this suite can assert.
 */
test.describe(
	'SearchInput clear control (#975, real browser)',
	{ tag: ['@shell', '@975'] },
	() => {
		test('exactly one accessible clear control exists once the field has text, and it empties + refocuses the field', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);

			const search = page.getByTestId(`${TABLE}-search`);
			await expect(search).toBeVisible();
			await search.fill('staff-admin');

			const clearButtons = page.getByRole('button', { name: 'Clear search' });
			await expect(clearButtons).toHaveCount(1);

			await clearButtons.click();
			await expect(search).toHaveValue('');
			await expect(search).toBeFocused();
		});
	},
);
