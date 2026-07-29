import { expect, type Page } from '@playwright/test';

/**
 * Asserts a `DataTable` never forces horizontal scroll past its own card at
 * the given testId. Anchors on a positive row count first, so an empty or
 * error render (scrollWidth === 0) can't satisfy the bound vacuously.
 */
export const expectTableFitsCard = async (
	page: Page,
	testId: string,
): Promise<void> => {
	const rows = page.getByTestId(`${testId}-rows`);
	await expect(rows).toBeVisible();

	const rowCount = await rows.locator('[data-slot="table-row"]').count();
	expect(rowCount).toBeGreaterThan(0);

	const scrollWidth = await rows.evaluate((el) => el.scrollWidth);
	const cardClientWidth = await page
		.getByTestId(`${testId}-card`)
		.evaluate((el) => el.clientWidth);

	expect(scrollWidth).toBeGreaterThan(0);
	expect(scrollWidth).toBeLessThanOrEqual(cardClientWidth + 1);
};
