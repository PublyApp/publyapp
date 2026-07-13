import { expect, type Page, test } from '@playwright/test';

import { COLOR_SCHEME_STORAGE_KEY } from '../src/lib/store/ui-store';
import { loginAsStaffAdmin } from './helpers/login';
import { waitForBoundingBoxToSettle } from './helpers/settle';

// #d4d4d8 (light --publy-border-strong) vs the old, too-faint #e4e4e7
// (--publy-border). #f0bd00 (dark --publy-primary/accent, the amber that was
// leaking into menu-item hover) vs #27272a (dark --publy-surface-muted).
const LIGHT_BORDER_STRONG = 'rgb(212, 212, 216)';
const DARK_BORDER_STRONG = 'rgba(255, 255, 255, 0.15)';
const DARK_ACCENT_AMBER = 'rgb(240, 189, 0)';
const DARK_MUTED = 'rgb(39, 39, 42)';

const seedDarkTheme = async (page: Page): Promise<void> => {
	await page.evaluate((key) => {
		window.localStorage.setItem(
			key,
			JSON.stringify({
				state: { colorScheme: 'dark', sidebarOpen: true },
				version: 0,
			}),
		);
	}, COLOR_SCHEME_STORAGE_KEY);
	await page.reload();
	await expect
		.poll(() =>
			page.evaluate(() => document.documentElement.classList.contains('dark')),
		)
		.toBe(true);
};

test.describe('FIX-3: design-system chrome rulings', () => {
	test('outline button border is legible in both light and dark themes (#3)', async ({
		page,
	}) => {
		// Not the theme-toggle: that button carries `.app-shell-topbar-action-btn`,
		// which deliberately forces `border-color: var(--publy-border) !important`
		// for the 36px circular topbar icon buttons (a different, intentional
		// rule). Use a genuine toolbar `variant="outline"` filter button instead.
		await loginAsStaffAdmin(page);
		await page.goto('/staff/invitations');
		const filterTrigger = page.getByRole('button', { name: 'All statuses' });
		await expect(filterTrigger).toBeVisible();

		await expect(filterTrigger).toHaveCSS(
			'border-top-color',
			LIGHT_BORDER_STRONG,
		);

		await seedDarkTheme(page);
		await expect(page.getByRole('button', { name: 'All statuses' })).toHaveCSS(
			'border-top-color',
			DARK_BORDER_STRONG,
		);
	});

	test('multi-select filter menu items are 9px-radius with muted (never amber) hover, and carry a visible end-aligned checkbox (#5, #7)', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await page.goto('/staff/tenants');
		await seedDarkTheme(page);

		await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
		await page
			.getByTestId('staff-tenants-table-search')
			.fill('Acme Corporation');
		const acmeLink = page
			.getByRole('link', { name: 'Acme Corporation' })
			.first();
		await expect(acmeLink).toBeVisible();
		await acmeLink.click();
		await page.waitForURL(/\/staff\/tenants\/[0-9a-f-]{36}$/);
		const tenantPathname = new URL(page.url()).pathname;
		await page.goto(`${tenantPathname}/users`);
		await expect(page.getByTestId('staff-tenant-users-table-rows')).toBeVisible(
			{
				timeout: 15_000,
			},
		);

		const levelFilterTrigger = page.getByRole('button', { name: 'All levels' });
		await levelFilterTrigger.click();

		// 3 rows: the exclusive "All levels" clear entry + the two level toggles.
		const checkboxItems = page.locator(
			'[data-slot="dropdown-menu-checkbox-item"]',
		);
		await expect(checkboxItems).toHaveCount(3);

		// Only the multi-select level toggles carry a visible checkbox box —
		// the exclusive "All levels" entry must NOT (the box is a multi-select
		// affordance).
		const boxes = page.locator('[data-slot="dropdown-menu-checkbox-item-box"]');
		await expect(boxes).toHaveCount(2);
		await expect(
			page
				.getByTestId('staff-tenant-users-level-filter-all')
				.locator('[data-slot="dropdown-menu-checkbox-item-box"]'),
		).toHaveCount(0);
		await expect(boxes.first()).toHaveCSS('border-radius', '5px');
		await expect(boxes.first()).not.toHaveCSS(
			'background-color',
			DARK_ACCENT_AMBER,
		);

		// Radius + hover: highlight (not click, to avoid mutating filter state)
		// the first row via keyboard and assert the muted, non-amber hover.
		await page.keyboard.press('ArrowDown');
		const highlighted = checkboxItems.first();
		await expect(highlighted).toHaveCSS('border-radius', '9px');
		await expect(highlighted).toHaveCSS('background-color', DARK_MUTED);
		await expect(highlighted).not.toHaveCSS(
			'background-color',
			DARK_ACCENT_AMBER,
		);

		// Checking a row fills its box with the primary token, not indicator-only.
		const adminItem = page.locator(
			'[data-slot="dropdown-menu-checkbox-item"]',
			{
				hasText: 'Admin',
			},
		);
		await adminItem.click();
		await expect(
			adminItem.locator('[data-slot="dropdown-menu-checkbox-item-box"]'),
		).toHaveCSS('background-color', DARK_ACCENT_AMBER);
		await page.keyboard.press('Escape');
	});

	test('exclusive (closeOnClick) filter items do not render a checkbox (#7)', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await page.goto('/staff/tenants');
		await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
		await page
			.getByTestId('staff-tenants-table-search')
			.fill('Acme Corporation');
		const acmeLink = page
			.getByRole('link', { name: 'Acme Corporation' })
			.first();
		await expect(acmeLink).toBeVisible();
		await acmeLink.click();
		await page.waitForURL(/\/staff\/tenants\/[0-9a-f-]{36}$/);
		const tenantPathname = new URL(page.url()).pathname;
		await page.goto(`${tenantPathname}/profiles`);

		await page
			.getByTestId('staff-tenant-profiles-grid-type-filter-trigger')
			.click();

		await expect(
			page.locator('[data-slot="dropdown-menu-checkbox-item"]'),
		).toHaveCount(3);
		await expect(
			page.locator('[data-slot="dropdown-menu-checkbox-item-box"]'),
		).toHaveCount(0);
	});

	test('page-size select popup stays trigger-anchored across different values (#11)', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);

		const trigger = page.getByTestId('staff-users-table-page-size-trigger');
		await expect(trigger).toBeVisible();
		const triggerBox = await trigger.boundingBox();
		expect(triggerBox).not.toBeNull();

		await trigger.click();
		const popup = page.locator('[data-slot="select-content"]');
		await expect(popup).toBeVisible();
		// toBeVisible() is satisfied the instant the popup mounts, while its
		// entry animation (scale/translate) is still in flight — the tight
		// (<12px, <8px) tolerances below need a settled geometry read, not a
		// mid-transition one (review-r1-tests.md F26).
		const firstPopupBox = await waitForBoundingBoxToSettle(popup);
		expect(firstPopupBox).not.toBeNull();

		if (triggerBox && firstPopupBox) {
			// Adjacent to the trigger's top or bottom edge (whichever side
			// floating-ui picked for collision avoidance) — never centered
			// somewhere in the middle to align a selected item.
			const distanceBelow = Math.abs(
				firstPopupBox.y - (triggerBox.y + triggerBox.height),
			);
			const distanceAbove = Math.abs(
				firstPopupBox.y + firstPopupBox.height - triggerBox.y,
			);
			expect(Math.min(distanceBelow, distanceAbove)).toBeLessThan(12);
		}

		await page.getByRole('option', { name: '50', exact: true }).click();
		await expect(popup).toBeHidden();

		// Selecting 50 re-renders the table with a different row count, which
		// can move the trigger itself — anchoring is judged relative to the
		// trigger, so re-measure it before the second open.
		const secondTriggerBox = await trigger.boundingBox();
		expect(secondTriggerBox).not.toBeNull();

		await trigger.click();
		await expect(popup).toBeVisible();
		const secondPopupBox = await waitForBoundingBoxToSettle(popup);
		expect(secondPopupBox).not.toBeNull();

		// The popup must keep the same offset FROM ITS TRIGGER regardless of
		// which value (10 vs. 50, i.e. first item vs. a later one) is
		// currently selected — alignItemWithTrigger must not reposition it
		// over the selected item.
		if (triggerBox && firstPopupBox && secondTriggerBox && secondPopupBox) {
			// A generous but still tight tolerance: if alignItemWithTrigger were
			// re-centering the popup over the newly-selected item, moving from
			// the 1st option (10) to the 3rd (50) would shift its trigger-
			// relative offset by roughly two item heights (~64px), far outside
			// this window.
			const firstOffsetY = firstPopupBox.y - triggerBox.y;
			const secondOffsetY = secondPopupBox.y - secondTriggerBox.y;
			expect(Math.abs(secondOffsetY - firstOffsetY)).toBeLessThan(8);
			const firstOffsetX = firstPopupBox.x - triggerBox.x;
			const secondOffsetX = secondPopupBox.x - secondTriggerBox.x;
			expect(Math.abs(secondOffsetX - firstOffsetX)).toBeLessThan(8);
		}
	});
});
