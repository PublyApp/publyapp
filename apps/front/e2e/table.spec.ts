import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL, getSessionTokenFromBrowser } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

const TABLE = 'staff-users-table';
const rowsOf = (page: Page) => page.getByTestId(`${TABLE}-rows`);
const dataRows = (page: Page) =>
	rowsOf(page).locator('[data-slot="table-row"]');
const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The first header's accessible name carries the select-all checkbox label
// ("Select all rows Member"), so anchor at the end rather than at the start.
const headerOf = (page: Page, name: string) =>
	page.getByRole('columnheader', {
		name: new RegExp(`${escapeRegExp(name)}$`),
	});

test.describe(
	'staff users table',
	{ tag: ['@shell', '@staff-users', '@720'] },
	() => {
		test('renders seeded rows and filters via search, including the NO_MATCH branch', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);

			await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();
			await expect(
				rowsOf(page).getByText('staff-admin@example.com'),
			).toBeVisible();
			await expect(
				rowsOf(page).getByText('staff-user@example.com'),
			).toBeVisible();

			await expect(page.getByTestId(`${TABLE}-toolbar`)).toBeVisible();
			await expect(
				page.getByTestId(`${TABLE}-page-size-trigger`),
			).toBeVisible();
			await expect(page.getByTestId(`${TABLE}-rows`)).toHaveClass(
				/overflow-auto/,
			);
			const pageSizeTag = await page
				.getByTestId(`${TABLE}-page-size`)
				.evaluate((el) => el.tagName);
			expect(pageSizeTag).not.toBe('SELECT');

			const triggerTag = await page
				.getByTestId(`${TABLE}-page-size-trigger`)
				.evaluate((el) => el.tagName);
			expect(triggerTag).not.toBe('SELECT');

			await expect(
				page.getByTestId(`${TABLE}-page-size-trigger`),
			).toBeVisible();
			await expect(
				page.getByTestId(`${TABLE}-page-size-trigger`),
			).toHaveAttribute('aria-label', 'Rows per page');

			await expect(page.getByText('Rows per page')).toBeVisible();

			const search = page.getByTestId(`${TABLE}-search`);
			await search.fill('staff-admin');
			await expect(page).toHaveURL(/[?&]q=staff-admin/);
			await expect(
				rowsOf(page).getByText('staff-admin@example.com'),
			).toBeVisible();
			await expect(
				rowsOf(page).getByText('staff-user@example.com'),
			).toBeHidden();

			await search.fill('zzz-no-match-xyz');
			await expect(page.getByTestId(`${TABLE}-no-match`)).toBeVisible();
			// The generic table keeps its shell and renders the state inside the
			// body: the guard is that no data row survives, not that the scroller
			// itself disappears.
			await expect(dataRows(page)).toHaveCount(0);

			await search.fill('');
			await expect(page).not.toHaveURL(/[?&]q=/);
			await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();
			await expect(
				rowsOf(page).getByText('staff-user@example.com'),
			).toBeVisible();
		});

		test('shows the eleven columns, staff StatCards and the Team panel', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

			for (const header of [
				'Member',
				'Email',
				'Status',
				'Roles',
				'Two-factor authentication',
				'Open sessions',
				'Language',
				'Last login',
				'Invited by',
				'Member since',
			]) {
				await expect(headerOf(page, header)).toBeVisible();
			}

			await expect(page.getByTestId('staff-user-stat-total')).toBeVisible();
			await expect(page.getByTestId('staff-user-stat-admins')).toBeVisible();

			const panel = page.getByTestId('app-shell-secondary-panel');
			await expect(
				panel.getByRole('button', { name: /Staff members\s+3/ }),
			).toBeVisible();
			await expect(
				panel.getByRole('button', { name: /Audit logs/ }),
			).toBeVisible();

			await panel.getByRole('button', { name: /Active\s+3/ }).click();
			await expect(page).toHaveURL(/[?&]status=active(?:&|$)/);
		});

		test('column widths follow the P3 grid and the wide table scrolls inside its card', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

			await expect(headerOf(page, 'Member')).toHaveCSS('width', '260px');
			await expect(headerOf(page, 'Status')).toHaveCSS('width', '130px');

			// The 11-column default grid is wider than the card at 1280px, so
			// the horizontal scroll belongs to the rows scroller inside the card,
			// never to the page (the same contract as the tenants grid, #2280).
			const scroller = rowsOf(page);
			const { scrollWidth, clientWidth } = await scroller.evaluate((el) => ({
				scrollWidth: el.scrollWidth,
				clientWidth: el.clientWidth,
			}));
			expect(scrollWidth).toBeGreaterThan(clientWidth);
			const cardBox = await page.getByTestId(`${TABLE}-card`).boundingBox();
			const viewport = page.viewportSize();
			expect(cardBox).not.toBeNull();
			if (cardBox && viewport) {
				expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(viewport.width);
			}
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth),
			).toBeLessThanOrEqual(
				(await page.evaluate(() => document.documentElement.clientWidth)) + 1,
			);

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
				'rgb(227, 227, 227)',
			);
		});

		test('cursor pagination advances forward and returns via previous', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await page.goto('/staff/staff-users?size=1');

			await expect(page.getByTestId(`${TABLE}-page-label`)).toHaveText(
				'Page 1',
			);
			const firstRowText = await page
				.getByTestId(`${TABLE}-rows`)
				.locator('tbody tr')
				.first()
				.textContent();

			const nextButton = page.getByTestId(`${TABLE}-next-page`);
			await expect(nextButton).toBeEnabled();
			await nextButton.click();

			await expect(page.getByTestId(`${TABLE}-page-label`)).toHaveText(
				'Page 2',
			);
			const secondRowText = await page
				.getByTestId(`${TABLE}-rows`)
				.locator('tbody tr')
				.first()
				.textContent();
			expect(secondRowText).not.toEqual(firstRowText);

			const prevButton = page.getByTestId(`${TABLE}-prev-page`);
			await expect(prevButton).toBeEnabled();
			await prevButton.click();

			await expect(page.getByTestId(`${TABLE}-page-label`)).toHaveText(
				'Page 1',
			);
			const backToFirstRowText = await page
				.getByTestId(`${TABLE}-rows`)
				.locator('tbody tr')
				.first()
				.textContent();
			expect(backToFirstRowText).toEqual(firstRowText);
		});

		// The front-end clamp caps a hand-typed, unbounded `size` at
		// MAX_TABLE_SIZE (table-search-params.ts) before it ever reaches the
		// wire — assert the outgoing `limit` param directly instead of only the
		// symptom-free render, which would also pass if the clamp regressed
		// (review-r3-tests.md F10). The render assertions stay as the anti-hang
		// check.
		test('an oversized size param is clamped on the wire and still renders a normal table', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);

			const usersResponse = page.waitForResponse(
				(response) =>
					response.url().includes('/staff/users') &&
					response.request().method() === 'GET',
			);
			await page.goto('/staff/staff-users?size=100000');
			const response = await usersResponse;
			const requestedLimit = Number(
				new URL(response.url()).searchParams.get('limit'),
			);
			expect(requestedLimit).toBeGreaterThan(0);
			expect(requestedLimit).toBeLessThanOrEqual(100);

			await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();
			await expect(page.getByTestId(`${TABLE}-error`)).toHaveCount(0);
			await expect(
				rowsOf(page).getByText('staff-admin@example.com'),
			).toBeVisible();
		});

		// The front-end clamp only protects this table's own UI — anyone with a
		// valid session token can call the API directly, bypassing
		// table-search-params.ts entirely. Pins the API half of
		// review-r2-tests.md F4 (review-r3-tests.md F1): the API must 422 a
		// `limit` above its own maximum instead of materialising every row.
		//
		// The request must carry `X-Session-Token` explicitly: `page.request` shares
		// the browser context's COOKIES, but the API authenticates off the header
		// (client-manager.ts:257 copies the token into `X-Session-Token` on every
		// call), and the cookie holds a SCOPED value (`s:<staff>`), not a bare token.
		// `getSessionTokenFromBrowser` decodes it with the product's own parser.
		// Without this the request 401s before validation ever runs, and the test
		// fails for entirely the wrong reason.
		test('the API rejects a limit above the maximum even when the front-end clamp is bypassed', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);

			const sessionToken = await getSessionTokenFromBrowser(page, 'staff');
			expect(sessionToken, 'staff-admin session token').toBeTruthy();

			const response = await page.request.get(
				`${API_BASE_URL}/staff/users?limit=1000000`,
				{ headers: { 'X-Session-Token': sessionToken ?? '' } },
			);

			// 401 here would mean the request never reached validation (see above);
			// fail loudly on that rather than reporting a misleading limit failure.
			expect(
				response.status(),
				'request must be authenticated before limit validation is exercised',
			).not.toBe(401);
			expect(response.status()).toBe(422);
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

			// The generic table's rows are the keyboard stops (Enter opens the
			// row); the old click-a-cell gesture is gone because the first cell
			// is now the row's link.
			const firstRow = dataRows(page).first();
			await firstRow.focus();

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
	},
);

for (const width of [1280, 768, 390]) {
	test.describe(`viewport ${width}px`, { tag: ['@shell', '@720'] }, () => {
		test.use({ viewport: { width, height: 800 } });

		test('table is responsive', async ({ page }) => {
			await loginAsStaffAdmin(page);

			const toolbar = page.getByTestId(`${TABLE}-toolbar`);
			await expect(toolbar).toBeVisible();

			const pageOverflows = await page.evaluate(
				() =>
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth + 1,
			);
			expect(pageOverflows).toBe(false);

			if (width < 768) {
				// The generic table shows mobile cards below md and keeps the
				// desktop table mounted but hidden.
				await expect(page.getByTestId(`${TABLE}-rows`)).toBeHidden();
				await expect(
					page.getByRole('link', { name: /^(Open|Ouvrir) / }).first(),
				).toBeVisible();
				return;
			}

			const rows = page.getByTestId(`${TABLE}-rows`);
			await expect(rows).toBeVisible();
			expect(await dataRows(page).count()).toBeGreaterThan(0);

			// The 11-column grid is wider than the card: the rows scroller owns
			// that horizontal overflow, never the page.
			const { scrollWidth, clientWidth } = await rows.evaluate((el) => ({
				scrollWidth: el.scrollWidth,
				clientWidth: el.clientWidth,
			}));
			expect(scrollWidth).toBeGreaterThan(clientWidth);
		});

		test('footer stacks below 640px and never overflows its surface', async ({
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

			// The cursor footer is a sibling of the card, so its width is the
			// page content width (the card is 1px narrower per border). Compare
			// against the list page itself: a footer wider than the surface it
			// sits on is the overflow this guards.
			const footerScrollWidth = await footer.evaluate((el) => el.scrollWidth);
			const listClientWidth = await page
				.getByTestId(TABLE)
				.evaluate((el) => el.clientWidth);
			expect(footerScrollWidth).toBeLessThanOrEqual(listClientWidth + 1);
		});
	});
}
