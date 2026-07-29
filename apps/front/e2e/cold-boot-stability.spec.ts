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
 * The root shell renders the real app-shell chrome above the `ssr: false`
 * match, while that route's pendingComponent supplies only main content.
 * Both therefore ship in the initial HTML byte stream — a deterministic,
 * timing-independent guarantee, not a "usually fast enough" one.
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

		expect(html).toContain('data-testid="neutral-authed-shell"');
		expect(html).toContain('data-testid="neutral-authed-shell-rail"');
		expect(html).toContain('data-testid="neutral-authed-shell-topbar"');
		expect(html).toContain('class="app-shell-body"');
		expect(html).toContain('class="app-shell-rail"');
		expect(html).toContain('class="app-shell-topbar"');
		expect(html).not.toContain('data-testid="app-shell-shell"');
		expect(html).not.toContain('data-mode="authed"');

		// Sanity check: the raw HTML is not itself already the finished
		// table — this assertion is about the pending shell, not the data.
		expect(html).not.toContain('data-testid="staff-tenants-table-rows"');
	});

	// NOTE (captain, r1 gate): a second, runtime-observation test previously lived
	// here (addInitScript + MutationObserver/rAF harness watching the reload paint
	// order). It was removed after three independent implementations all failed the
	// same way: in this stack, init-script-registered MutationObserver and
	// requestAnimationFrame callbacks provably never execute in the reloaded
	// document (verified via a window.name trace — a single document
	// instantiation whose async init-world callbacks stay silent while the page
	// parses and hydrates). A harness that cannot observe is decoration (repo
	// doctrine). The invariant itself — the pending shell ships inside the raw
	// SSR HTML, so no blank frame is possible — is proven deterministically by
	// the test above, which needs no runtime observation.
});
