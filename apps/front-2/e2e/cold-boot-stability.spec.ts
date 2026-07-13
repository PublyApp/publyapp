import { expect, test } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

/**
 * BUG-2: a long-away return (tab discard, hard reload — as opposed to a
 * quick alt-tab, which BUG-1 already covers via tab-refocus-stability.spec.ts)
 * forces a real cold boot: a fresh document load with an empty query cache.
 *
 * The `/_authed-layout` route is `ssr: false`. TanStack Start renders such a
 * route's `pendingComponent` as BOTH the raw SSR response body AND the
 * pre-hydration `ClientOnly` fallback (see @tanstack/react-router's
 * Match.js — `resolvedNoSsr` routes wrap the real component in
 * `<ClientOnly fallback={pendingElement}>`, and `pendingElement` is built
 * from `route.options.pendingComponent`). With no pendingComponent, that
 * fallback is `null` — the server sends an empty <body>, and nothing paints
 * until the client bundle loads, hydrates, AND the surface-redirect-code
 * query round-trips to the API. That whole gap is a genuinely blank page.
 *
 * The fix wires a pendingComponent that renders the real app-shell chrome
 * (rail + topbar), so it ships as part of the initial HTML byte stream
 * itself — a deterministic, timing-independent guarantee, not a "usually
 * fast enough" one.
 */
test.describe('cold-boot stability (BUG-2)', () => {
	test('the raw SSR HTML response for a reload already contains the app shell chrome', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await page.goto('/staff/tenants');
		await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();

		// Fetch the document HTML directly, bypassing any client-side JS/React
		// entirely — this is exactly what the server sent before a single
		// line of client code has run. If the shell isn't in this string, no
		// amount of speed will save the first paint: it comes from a
		// pendingComponent shipping in SSR output, not from the network being
		// fast enough to race a null fallback.
		const html = await page.evaluate(async () => {
			const response = await fetch(window.location.href, {
				credentials: 'include',
			});
			return response.text();
		});

		expect(html).toContain('data-testid="app-shell-pending-rail"');
		expect(html).toContain('data-testid="app-shell-pending-topbar"');

		// Sanity check: the raw HTML is not itself already the finished
		// table — this assertion is about the pending shell, not the data.
		expect(html).not.toContain('data-testid="staff-tenants-table-rows"');
	});

	test('reload keeps the shell painted the whole time — no window where the DOM is truly empty', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await page.goto('/staff/tenants');
		await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
		await page.waitForTimeout(300);

		// Poll aggressively from the moment reload is *issued*, not after it
		// resolves — `page.reload()` awaits the 'load' event by default, by
		// which point the whole cold-boot sequence (including the bug) has
		// already finished, so polling has to start racing it immediately.
		const start = Date.now();
		const reloadPromise = page.reload();
		let sawContentBeforeRail = false;
		let railSeen = false;
		while (Date.now() - start < 3000 && !railSeen) {
			// eslint-disable-next-line no-await-in-loop -- intentional sequential poll
			const sample = await page
				.evaluate((): [number, boolean] => [
					document.body?.innerText?.length ?? 0,
					document.querySelector('[data-testid="app-shell-pending-rail"]') !==
						null ||
						document.querySelector('[data-testid="app-shell-rail"]') !== null,
				])
				.catch(() => null); // navigation can tear down the execution context mid-poll
			if (sample) {
				const [bodyTextLen, hasRail] = sample;
				if (bodyTextLen > 0 && !hasRail) {
					sawContentBeforeRail = true;
				}
				if (hasRail) {
					railSeen = true;
					break;
				}
			}
			// eslint-disable-next-line no-await-in-loop -- intentional sequential poll
			await page.waitForTimeout(25);
		}
		const railAppearedAfterMs = Date.now() - start;
		await reloadPromise;

		// The shell must never render bare text without its own chrome — if it
		// does, some other fallback (a stray "Loading…" with no shell) slipped
		// back in ahead of the fix.
		expect(sawContentBeforeRail).toBe(false);
		expect(railSeen).toBe(true);
		// The old (pendingComponent-less) behavior left `document.body` with
		// zero rendered text and no rail for over a second in this same
		// environment; the fix collapses that to the raw network round trip
		// only. 1000ms sits comfortably above the fixed measurement and well
		// below the old failure mode, so this stays robust to CI variance
		// without re-permitting the regression.
		expect(railAppearedAfterMs).toBeLessThan(1000);

		await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible({
			timeout: 15_000,
		});
	});
});
