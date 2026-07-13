import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';
import { expectTableFitsCard } from './helpers/table-fits-card';

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

		const ascResponse = page.waitForResponse(
			(response) =>
				response.url().includes('/staff/users') &&
				new URL(response.url()).searchParams.get('sort_order') === 'asc',
		);
		await levelHeader.click();
		await expect(page).toHaveURL(/[?&]sort_id=level/);
		await ascResponse;
		const firstOrder = await page
			.getByTestId(`${TABLE}-rows`)
			.locator('td')
			.allTextContents();

		const descResponse = page.waitForResponse(
			(response) =>
				response.url().includes('/staff/users') &&
				new URL(response.url()).searchParams.get('sort_order') === 'desc',
		);
		await levelHeader.click();
		// `table-search-params.ts` writes BOTH sort_id and sort_order on the
		// FIRST click already, so a bare `/sort_order=/` check here is pinned
		// true regardless of whether the second click actually flips the
		// direction — assert the flip itself (asc -> desc), and gate the row
		// snapshot on the matching response instead of merely polling for a
		// non-empty (possibly still-stale) row count.
		await expect(page).toHaveURL(/[?&]sort_order=desc/);
		await descResponse;
		const secondOrder = await page
			.getByTestId(`${TABLE}-rows`)
			.locator('td')
			.allTextContents();

		expect(secondOrder).not.toEqual(firstOrder);
	});

	test('column widths follow the P3 grid and the table never overflows its card', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

		// Adapted grid: SPEC 2b's Role/Profiles/2FA/Last-active columns aren't
		// implemented yet, so Email (the longest free-text field) is the fluid
		// column instead of the SPEC's unbuilt Profiles column.
		await expect(page.getByRole('columnheader', { name: 'Name' })).toHaveCSS(
			'width',
			'200px',
		);
		await expect(page.getByRole('columnheader', { name: 'Level' })).toHaveCSS(
			'width',
			'104px',
		);
		await expect(page.getByRole('columnheader', { name: 'Status' })).toHaveCSS(
			'width',
			'122px',
		);

		const tableScrollWidth = await page
			.getByTestId(`${TABLE}-rows`)
			.evaluate((el) => el.scrollWidth);
		const cardClientWidth = await page
			.getByTestId(`${TABLE}-card`)
			.evaluate((el) => el.clientWidth);
		expect(tableScrollWidth).toBeGreaterThan(0);
		expect(tableScrollWidth).toBeLessThanOrEqual(cardClientWidth + 1);

		// Owner decision 15b: the last row keeps its bottom border.
		const lastRowCell = page
			.getByTestId(`${TABLE}-rows`)
			.locator('[data-slot="table-row"]')
			.last()
			.locator('[data-slot="table-cell"]')
			.first();
		await expect(lastRowCell).toHaveCSS('border-bottom-width', '1px');
		await expect(lastRowCell).toHaveCSS(
			'border-bottom-color',
			'rgb(241, 241, 243)',
		);
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

	// Neither layer currently bounds page size (review-r2-tests.md F4) — this
	// pins that a hand-typed, unbounded `size` at least renders a normal table
	// rather than an error view or a hang, while the front/API clamps land.
	test('an oversized size param still renders a normal table instead of an error view or a hang', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await page.goto('/staff/staff-users?size=100000');

		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();
		await expect(page.getByTestId(`${TABLE}-error`)).toHaveCount(0);
		await expect(page.getByText('staff-admin@example.com')).toBeVisible();
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
		expect(activeCellBefore).not.toBeUndefined();

		await page.keyboard.press('ArrowDown');

		const activeCellAfter = await page.evaluate(
			() => document.activeElement?.closest('tr')?.rowIndex,
		);

		// `not.toEqual` is satisfied by focus moving anywhere else, including
		// out of the grid entirely (activeCellAfter becoming `undefined`) —
		// assert the actual invariant: focus moves exactly one row down.
		expect(activeCellAfter).toBe((activeCellBefore ?? 0) + 1);
	});
});

for (const width of [1280, 768, 390]) {
	test.describe(`viewport ${width}px`, () => {
		test.use({ viewport: { width, height: 800 } });

		test('table is responsive', async ({ page }) => {
			await loginAsStaffAdmin(page);

			const toolbar = page.getByTestId(`${TABLE}-toolbar`);
			await expect(toolbar).toBeVisible();

			await expectTableFitsCard(page, TABLE);
		});

		test('footer stacks below 640px and never overflows its card', async ({
			page,
		}) => {
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

			const footerScrollWidth = await footer.evaluate((el) => el.scrollWidth);
			const cardClientWidth = await page
				.getByTestId(`${TABLE}-card`)
				.evaluate((el) => el.clientWidth);
			expect(footerScrollWidth).toBeLessThanOrEqual(cardClientWidth + 1);
		});
	});
}
