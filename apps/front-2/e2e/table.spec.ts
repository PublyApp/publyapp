import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const TABLE = 'staff-users-table';

test.describe('staff users table', () => {
	test('renders seeded rows and filters via search, including the NO_MATCH branch', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);

		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();
		await expect(page.getByText('staff-admin@example.com')).toBeVisible();
		await expect(page.getByText('staff-user@example.com')).toBeVisible();

		const search = page.getByTestId(`${TABLE}-search`);
		await search.fill('staff-admin');
		await expect(page).toHaveURL(/[?&]q=staff-admin/);
		await expect(page.getByText('staff-admin@example.com')).toBeVisible();
		await expect(page.getByText('staff-user@example.com')).toBeHidden();

		await search.fill('zzz-no-match-xyz');
		await expect(page.getByTestId(`${TABLE}-no-match`)).toBeVisible();
		await expect(page.getByTestId(`${TABLE}-rows`)).toBeHidden();

		await search.fill('');
		await expect(page).not.toHaveURL(/[?&]q=/);
		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();
		await expect(page.getByText('staff-user@example.com')).toBeVisible();
	});

	test('sorting the Level column flips row order', async ({ page }) => {
		await loginAsStaffAdmin(page);

		const levelHeader = page.getByRole('columnheader', { name: 'Level' });
		await expect(levelHeader).toBeVisible();

		await levelHeader.click();
		await expect(page).toHaveURL(/[?&]sort_id=level/);
		// A sort-key change starts a fresh TanStack Query cache entry (loading
		// skeleton, no <td>s) until the refetch resolves — wait for real rows.
		await expect
			.poll(() => page.getByTestId(`${TABLE}-rows`).locator('td').count())
			.toBeGreaterThan(0);
		const firstOrder = await page
			.getByTestId(`${TABLE}-rows`)
			.locator('td')
			.allTextContents();

		await levelHeader.click();
		await expect(page).toHaveURL(/[?&]sort_order=/);
		await expect
			.poll(() => page.getByTestId(`${TABLE}-rows`).locator('td').count())
			.toBeGreaterThan(0);
		const secondOrder = await page
			.getByTestId(`${TABLE}-rows`)
			.locator('td')
			.allTextContents();

		expect(secondOrder).not.toEqual(firstOrder);
	});

	test('cursor pagination advances forward and returns via previous', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await page.goto('/staff/staff-users?size=1');

		await expect(page.getByTestId(`${TABLE}-page-label`)).toHaveText('Page 1');
		const firstRowText = await page
			.getByTestId(`${TABLE}-rows`)
			.locator('tbody tr')
			.first()
			.textContent();

		const nextButton = page.getByTestId(`${TABLE}-next-page`);
		await expect(nextButton).toBeEnabled();
		await nextButton.click();

		await expect(page.getByTestId(`${TABLE}-page-label`)).toHaveText('Page 2');
		const secondRowText = await page
			.getByTestId(`${TABLE}-rows`)
			.locator('tbody tr')
			.first()
			.textContent();
		expect(secondRowText).not.toEqual(firstRowText);

		const prevButton = page.getByTestId(`${TABLE}-prev-page`);
		await expect(prevButton).toBeEnabled();
		await prevButton.click();

		await expect(page.getByTestId(`${TABLE}-page-label`)).toHaveText('Page 1');
		const backToFirstRowText = await page
			.getByTestId(`${TABLE}-rows`)
			.locator('tbody tr')
			.first()
			.textContent();
		expect(backToFirstRowText).toEqual(firstRowText);
	});

	test('has zero automatically detectable accessibility violations', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

		const results = await new AxeBuilder({ page })
			.include(`[data-testid="${TABLE}"]`)
			.analyze();

		expect(results.violations).toEqual([]);
	});

	test('keyboard arrow navigation moves focus through table rows', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

		const firstCell = page.getByTestId(`${TABLE}-rows`).locator('td').first();
		await firstCell.click();

		const activeCellBefore = await page.evaluate(
			() => document.activeElement?.closest('tr')?.rowIndex,
		);

		await page.keyboard.press('ArrowDown');

		const activeCellAfter = await page.evaluate(
			() => document.activeElement?.closest('tr')?.rowIndex,
		);

		expect(activeCellAfter).not.toEqual(activeCellBefore);
	});
});
