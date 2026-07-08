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

		await expect(page.getByTestId(`${TABLE}-toolbar`)).toBeVisible();
		await expect(page.getByTestId(`${TABLE}-page-size-trigger`)).toBeVisible();
		await expect(page.getByTestId(`${TABLE}-rows`)).toHaveClass(
			/publy-data-table/,
		);
		const pageSizeTag = await page
			.getByTestId(`${TABLE}-page-size`)
			.evaluate((el) => el.tagName);
		expect(pageSizeTag).not.toBe('SELECT');

		const triggerTag = await page
			.getByTestId(`${TABLE}-page-size-trigger`)
			.evaluate((el) => el.tagName);
		expect(triggerTag).not.toBe('SELECT');

		await expect(page.getByTestId(`${TABLE}-page-size-trigger`)).toBeVisible();
		await expect(
			page.getByTestId(`${TABLE}-page-size-trigger`),
		).toHaveAttribute('aria-label', 'Rows per page');

		await expect(page.getByText('Rows per page')).toBeVisible();

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

for (const width of [1280, 768, 390]) {
	test.describe(`viewport ${width}px`, () => {
		test.use({ viewport: { width, height: 800 } });

		test('table is responsive', async ({ page }) => {
			await loginAsStaffAdmin(page);

			const toolbar = page.getByTestId(`${TABLE}-toolbar`);
			await expect(toolbar).toBeVisible();

			const rows = page.getByTestId(`${TABLE}-rows`);
			await expect(rows).toBeVisible();

			const scrollWidth = await rows.evaluate((el: Element) => el.scrollWidth);
			expect(scrollWidth).not.toBe(0);
		});

		test('footer does not overflow', async ({ page }) => {
			await loginAsStaffAdmin(page);

			const footer = page.getByTestId(`${TABLE}-footer`);
			await expect(footer).toBeVisible();

			const flexDirection = await footer.evaluate(
				(el) => window.getComputedStyle(el).flexDirection,
			);
			if (width < 640) {
				expect(flexDirection).toBe('column');
			} else {
				expect(flexDirection).toBe('row');
			}
		});
	});
}
