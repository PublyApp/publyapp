import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';
import { expectTableFitsCard } from './helpers/table-fits-card';

const TENANT_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';
const PENDING_INVITATION_ID = '0197b8f0-6666-7ccc-8ccc-ffffffffffff';
// The seeded user row in mockTenantDetails's /users fixture selected via
// `getByRole('checkbox', { name: 'Select Jamie Lee' })`.
const JAMIE_USER_ID = '0197b8f0-4444-7ccc-8ccc-dddddddddddd';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

/** Floating bar is portalled to `document.body` and pinned near the viewport
 * bottom — assert it isn't trapped inside `.app-shell-main`'s scroll area. */
const expectFloatingSelectionBarAtViewportBottom = async (page: Page) => {
	const bar = page.getByTestId('floating-selection-bar');
	await expect(bar).toBeVisible();
	// toBeVisible() alone doesn't imply in-viewport (a bar trapped inside a
	// scrolled `.app-shell-main` container can still be "visible" while
	// off-screen); ratio: 1 requires the whole element be within the
	// viewport (review-r1-tests.md F25).
	await expect(bar).toBeInViewport({ ratio: 1 });

	const viewportHeight = page.viewportSize()?.height ?? 0;
	const box = await bar.boundingBox();
	expect(box).not.toBeNull();
	if (box) {
		expect(box.y + box.height).toBeGreaterThan(viewportHeight - 80);
		// Opposing bound: catches the bar being pushed entirely below/past the
		// viewport, which the lower bound alone would not.
		expect(box.y).toBeLessThan(viewportHeight);
	}
};

const mockTenantDetails = async (page: Page) => {
	// A single '*' glob cannot cross a path separator (compiles to [^/]*), so
	// '**' is required to match both the tenant collection and its sub-paths.
	await page.route(`**/staff/tenants/**`, async (route) => {
		const request = route.request();
		const url = request.url();

		if (
			request.method() === 'DELETE' &&
			isApiPath(
				url,
				`/staff/tenants/${TENANT_ID}/invitations/${PENDING_INVITATION_ID}`,
			)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					message: 'Invitation revoked.',
					translationKey: 'revoke-invitation-success',
				}),
			});
			return;
		}

		if (
			request.method() === 'GET' &&
			isApiPath(url, `/staff/tenants/${TENANT_ID}`)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					tenantId: TENANT_ID,
					name: 'Acme Corporation',
					code: 'ACME',
					status: 'Active',
					usersCount: 12,
					maxUsers: 50,
					ownersCount: 2,
					pendingInvitationsCount: 4,
					expiringSoonInvitationsCount: 2,
					profilesCount: 6,
					logoUrl: null,
					legalName: 'Acme Corporation, Inc.',
					websiteUrl: 'https://www.acme.example/',
					lastActivityAt: '2020-06-01T09:00:00Z',
					createdAt: '2026-07-01T09:00:00Z',
					updatedAt: '2026-07-02T10:00:00Z',
				}),
			});
			return;
		}

		if (
			request.method() === 'GET' &&
			isApiPath(url, `/staff/tenants/${TENANT_ID}/users`)
		) {
			const levelParam = new URL(url).searchParams.get('level');
			const users = [
				{
					id: '0197b8f0-4444-7ccc-8ccc-dddddddddddd',
					userAccountId: '0197b8f0-5555-7ccc-8ccc-dddddddddddd',
					email: 'jamie@example.com',
					firstName: 'Jamie',
					lastName: 'Lee',
					avatarUrl: null,
					status: 'Active',
					level: 'Admin',
				},
				{
					id: '0197b8f0-4444-7ccc-8ccc-eeeeeeeeeeee',
					userAccountId: '0197b8f0-5555-7ccc-8ccc-eeeeeeeeeeee',
					email: 'morgan@example.com',
					firstName: 'Morgan',
					lastName: 'Reyes',
					avatarUrl: null,
					status: 'Active',
					level: 'User',
				},
			];
			const filtered =
				levelParam === null
					? users
					: users.filter(
							(user) => user.level.toLowerCase() === levelParam.toLowerCase(),
						);

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: filtered,
					nextCursor: null,
				}),
			});
			return;
		}

		if (
			request.method() === 'GET' &&
			isApiPath(url, `/staff/tenants/${TENANT_ID}/profiles`)
		) {
			const isDefaultParam = new URL(url).searchParams.get('is_default');
			const profiles = [
				{
					id: '0197b8f0-5555-7ccc-8ccc-eeeeeeeeeeee',
					name: 'Approvers',
					description: 'Can review approvals',
					isDefault: true,
					userAccountCount: 7,
					permissionsCount: 3,
				},
				{
					id: '0197b8f0-5555-7ccc-8ccc-fffffffffff1',
					name: 'Support',
					description: 'Respond to member tickets',
					isDefault: false,
					userAccountCount: 5,
					permissionsCount: 4,
				},
			];
			const filtered =
				isDefaultParam === null
					? profiles
					: profiles.filter(
							(profile) => String(profile.isDefault) === isDefaultParam,
						);

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: filtered,
					nextCursor: null,
				}),
			});
			return;
		}

		if (
			request.method() === 'GET' &&
			isApiPath(url, `/staff/tenants/${TENANT_ID}/invitations`)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{
							id: PENDING_INVITATION_ID,
							email: 'sam@example.com',
							status: 'Pending',
							profileName: 'Approvers',
							invitedByName: 'Taylor Smith',
							createdAt: '2026-07-01T09:00:00Z',
							expiresAt: '2026-07-07T09:00:00Z',
							acceptedAt: null,
						},
					],
					nextCursor: null,
				}),
			});
			return;
		}

		await route.fallback();
	});
};

test.describe('staff tenant details tabs', () => {
	test('switching tabs is a client-side navigation, not a document reload', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}`);
		await expect(page.getByTestId('staff-tenant-details-page')).toBeVisible();

		await page.evaluate(() => {
			(window as unknown as { __spaAlive?: boolean }).__spaAlive = true;
		});

		await page.getByRole('link', { name: 'Users' }).click();

		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-details-loading'),
		).not.toBeVisible();

		const alive = await page.evaluate(
			() => (window as unknown as { __spaAlive?: boolean }).__spaAlive === true,
		);
		expect(alive).toBe(true);
	});
});

test.describe('staff tenant details shell (rail-only) and Basics danger zone', () => {
	test('the detail route is rail-only, all four tabs render, and the danger zone is visible', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}`);
		await expect(page.getByTestId('staff-tenant-details-page')).toBeVisible();

		// Secondary panel follows the persisted sidebarOpen preference; default open.
		await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();

		const nav = page.getByRole('navigation', { name: 'Tenant sections' });
		await expect(nav.getByText('Basics')).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Profiles' })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Invitations' })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Users' })).toBeVisible();

		await expect(page.getByText('Danger zone')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Suspend' })).toBeVisible();

		// Back on the tenants list, the secondary panel returns.
		await page.goto('/staff/tenants');
		await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();
	});
});

test.describe('staff tenant details Basics stat cards and Owners card', () => {
	test('renders the Members, Owners, Pending invites, and Profiles stat cards, plus an Owners card whose See all link filters the Users tab', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}`);
		await expect(page.getByTestId('staff-tenant-details-page')).toBeVisible();

		await expect(page.getByTestId('tenant-stat-members')).toContainText('12');
		await expect(page.getByTestId('tenant-stat-owners')).toContainText('2');
		await expect(page.getByTestId('tenant-stat-invites')).toContainText('4');
		await expect(page.getByTestId('tenant-stat-profiles')).toContainText('6');

		const ownersRows = page.getByTestId('tenant-owners-rows');
		await expect(ownersRows).toBeVisible();
		await expect(ownersRows).toContainText('jamie@example.com');

		await page.getByRole('link', { name: 'See all' }).click();

		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();
		await expect(page).toHaveURL(/level=admin/);
	});

	test('the Organization card shows Legal name, Slug, Tenant ID, Status, Created, Updated, and Last active rows', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}`);
		await expect(page.getByTestId('staff-tenant-details-page')).toBeVisible();

		const orgCard = page
			.locator('section')
			.filter({ has: page.getByText('Organization', { exact: true }) });
		await expect(orgCard).toContainText('Acme Corporation, Inc.');
		await expect(orgCard).toContainText('ACME');
		await expect(orgCard).toContainText(TENANT_ID);
		await expect(
			orgCard.getByRole('link', { name: 'www.acme.example' }),
		).toBeVisible();
		// lastActivityAt is years in the past — relative-time bucketed.
		await expect(orgCard).toContainText(/years ago/);
	});
});

test.describe('staff tenant Profiles/Invitations/Users tab bodies', () => {
	test('Profiles tab renders the toolbar, the card grid, the cursor footer, and honest counts', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/profiles`);

		await expect(page.getByTestId('staff-tenant-profiles-page')).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-profiles-grid-toolbar'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-profiles-grid-search'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-profiles-grid-rows'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-profiles-grid-footer'),
		).toBeVisible();

		// Honest tab-title count from the tenant-details query (BE-1/BE-2).
		await expect(page.getByRole('heading', { name: /Profiles/ })).toContainText(
			'6',
		);
		// Honest per-card "N members · N permissions" (BE-2 permissionsCount).
		await expect(page.getByText('7 members · 3 permissions')).toBeVisible();
	});

	test('Profiles tab type filter narrows to System-only and Custom-only profiles via the is_default URL param', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/profiles`);
		await expect(page.getByTestId('staff-tenant-profiles-page')).toBeVisible();
		await expect(page.getByText('Approvers')).toBeVisible();
		await expect(page.getByText('Support')).toBeVisible();

		await page
			.getByTestId('staff-tenant-profiles-grid-type-filter-trigger')
			.click();
		await page
			.getByTestId('staff-tenant-profiles-grid-type-filter-system')
			.click();

		await expect(page).toHaveURL(/is_default=true/);
		await expect(page.getByText('Approvers')).toBeVisible();
		await expect(page.getByText('Support')).not.toBeVisible();

		await page
			.getByTestId('staff-tenant-profiles-grid-type-filter-trigger')
			.click();
		await page
			.getByTestId('staff-tenant-profiles-grid-type-filter-custom')
			.click();

		await expect(page).toHaveURL(/is_default=false/);
		await expect(page.getByText('Support')).toBeVisible();
		await expect(page.getByText('Approvers')).not.toBeVisible();
	});

	test('Profiles tab card grid: the checkbox sits corner-positioned above/left of the icon tile, selecting a card shows an amber ring, and New profile is a primary button (FIX-4 #4/#8)', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/profiles`);
		await expect(page.getByTestId('staff-tenant-profiles-page')).toBeVisible();

		// #8 — "New profile" is primary (--publy-primary, #fdc700), not outline,
		// per the owner's cross-app consistency ruling (docs/guides/front-2/conventions.md).
		const newProfileButton = page.getByRole('button', { name: 'New profile' });
		await expect(newProfileButton).toBeVisible();
		await expect(newProfileButton).toHaveCSS(
			'background-color',
			'rgb(253, 199, 0)',
		);

		// #4 — checkbox is corner-positioned relative to the icon tile, not an
		// in-flow flex item pushing the tile sideways.
		const approversId = '0197b8f0-5555-7ccc-8ccc-eeeeeeeeeeee';
		const card = page.getByTestId(`staff-tenant-profile-card-${approversId}`);
		await expect(card).toBeVisible();
		const checkbox = page.getByTestId(
			`staff-tenant-profile-card-select-${approversId}`,
		);
		await card.hover();
		await expect(checkbox).toBeVisible();

		const checkboxBox = await checkbox.boundingBox();
		const tileBox = await card
			.locator('.publy-profile-icon-tile--lg')
			.boundingBox();
		expect(checkboxBox).not.toBeNull();
		expect(tileBox).not.toBeNull();
		if (checkboxBox && tileBox) {
			const tileCenterX = tileBox.x + tileBox.width / 2;
			const tileCenterY = tileBox.y + tileBox.height / 2;
			const checkboxCenterX = checkboxBox.x + checkboxBox.width / 2;
			const checkboxCenterY = checkboxBox.y + checkboxBox.height / 2;
			expect(checkboxCenterX).toBeLessThan(tileCenterX);
			expect(checkboxCenterY).toBeLessThan(tileCenterY);
		}

		// #4 — selecting the card renders an amber ring on the card surface
		// itself, not just a checked checkbox.
		await checkbox.click();
		await expect(card).toHaveClass(/publy-profile-card--selected/);
		await expect(card).toHaveCSS('box-shadow', /rgb\(253, 199, 0\)/);
	});

	test("the default (System) profile's Delete action is visible but disabled, with a tooltip explaining why", async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/profiles`);
		await expect(page.getByTestId('staff-tenant-profiles-page')).toBeVisible();

		await page
			.getByTestId(
				'staff-tenant-profile-actions-0197b8f0-5555-7ccc-8ccc-eeeeeeeeeeee',
			)
			.click();

		const deleteItem = page.getByTestId(
			'staff-tenant-profile-delete-0197b8f0-5555-7ccc-8ccc-eeeeeeeeeeee',
		);
		await expect(deleteItem).toBeVisible();
		await expect(deleteItem).toHaveAttribute('aria-disabled', 'true');
		await expect(deleteItem).toHaveAttribute(
			'title',
			"Default profiles can't be deleted.",
		);
	});

	test('Invitations tab renders the toolbar, the table, the cursor footer, and an honest count', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/invitations`);

		await expect(
			page.getByTestId('staff-tenant-invitations-page'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-invitations-table-toolbar'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-invitations-table-search'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-invitations-table-rows'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-invitations-table-footer'),
		).toBeVisible();

		// Honest tab-title count from the tenant-details query (pendingInvitationsCount).
		await expect(
			page.getByRole('heading', { name: /Invitations/ }),
		).toContainText('4 pending');
	});

	test('revoking a pending invitation shows one global success toast without inline status feedback', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/invitations`);
		await expect(
			page.getByTestId('staff-tenant-invitations-page'),
		).toBeVisible();

		await page
			.getByTestId(`staff-tenant-invitation-actions-${PENDING_INVITATION_ID}`)
			.click();
		await page.getByRole('menuitem', { name: 'Revoke', exact: true }).click();
		await expect(
			page.getByRole('heading', { name: 'Revoke invitation' }),
		).toBeVisible();
		await page.getByRole('button', { name: 'Revoke', exact: true }).click();

		const successToasts = page.locator(
			'[data-sonner-toast][data-type="success"]',
		);
		await expect(
			page.getByText('Invitation revoked.', { exact: true }),
		).toBeVisible();
		await expect(successToasts).toHaveCount(1);
		await expect(
			page.locator('.publy-detail-tab-body').getByRole('status'),
		).toHaveCount(0);
	});

	test('Users tab renders the toolbar, the table, the cursor footer, and a checkbox selection column', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/users`);

		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-users-table-toolbar'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-users-table-search'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-users-table-rows'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-users-table-footer'),
		).toBeVisible();
		await expect(page.getByLabel('Select all rows')).toBeVisible();
	});

	test('Users tab level filter offers an "All levels" entry that clears the filter and closes the menu', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/users?level=admin`);
		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();
		await expect(page).toHaveURL(/[?&]level=admin(?:&|$)/);
		await expect(page.getByText('Jamie Lee')).toBeVisible();
		await expect(page.getByText('Morgan Reyes')).not.toBeVisible();

		const trigger = page.getByTestId('staff-tenant-users-level-filter-trigger');
		await trigger.click();
		const allLevelsItem = page.getByTestId(
			'staff-tenant-users-level-filter-all',
		);
		await expect(allLevelsItem).toBeVisible();
		await allLevelsItem.click();

		// Exclusive choice — the menu closes on selection.
		await expect(allLevelsItem).not.toBeVisible();
		await expect(page).not.toHaveURL(/[?&]level=/);
		await expect(page.getByText('Jamie Lee')).toBeVisible();
		await expect(page.getByText('Morgan Reyes')).toBeVisible();
	});
});

test.describe('staff tenant users bulk toolbar', () => {
	// Selecting rows must NOT actually bulk-remove the seeded user — other
	// specs in this suite depend on the mocked fixture staying intact. This
	// suite only asserts the confirm dialog opens, then cancels, and that the
	// export action triggers a real browser download.
	test('selecting a row reveals Export/Remove selected; Remove opens a confirm dialog that can be cancelled', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);
		let bulkRemoveCalled = false;
		await page.route(
			`**/staff/tenants/${TENANT_ID}/users/bulk-remove`,
			async (route) => {
				bulkRemoveCalled = true;
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						succeededCount: 1,
						failedCount: 0,
						failedItems: [],
					}),
				});
			},
		);

		await page.goto(`/staff/tenants/${TENANT_ID}/users`);
		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();

		await page.getByRole('checkbox', { name: 'Select Jamie Lee' }).click();
		await expect(page.getByText('1 selected')).toBeVisible();
		await expectFloatingSelectionBarAtViewportBottom(page);

		// The toolbar's level/status filters stay visible during selection —
		// no more swapping them out for the bulk-action controls.
		await expect(
			page.getByTestId('staff-tenant-users-table-toolbar'),
		).toBeVisible();

		const bar = page.getByTestId('floating-selection-bar');
		await bar.getByRole('button', { name: 'More actions' }).click();
		await page
			.getByRole('menuitem', { name: 'Remove selected from tenant' })
			.click();

		const dialog = page.getByRole('heading', {
			name: 'Remove selected from tenant',
		});
		await expect(dialog).toBeVisible();

		// Cancel — do not confirm the removal.
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(dialog).not.toBeVisible();
		expect(bulkRemoveCalled).toBe(false);
		// Cancelling the dialog does not clear the selection — the bar stays.
		await expect(bar).toBeVisible();

		await bar.getByRole('button', { name: 'Clear selection' }).click();
		await expect(bar).toBeHidden();
	});

	test('Export selected downloads a CSV named after the tenant code and date', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);
		await page.route(
			`**/staff/tenants/${TENANT_ID}/users/export**`,
			async (route) => {
				await route.fulfill({
					status: 200,
					contentType: 'text/csv',
					body: 'Email,FirstName,LastName,Level,Status,CreatedAt\njamie@example.com,Jamie,Lee,Admin,Active,2026-07-01T09:00:00Z\n',
				});
			},
		);

		await page.goto(`/staff/tenants/${TENANT_ID}/users`);
		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();

		await page.getByRole('checkbox', { name: 'Select Jamie Lee' }).click();
		await expectFloatingSelectionBarAtViewportBottom(page);
		await page
			.getByTestId('floating-selection-bar')
			.getByRole('button', { name: 'More actions' })
			.click();

		// The request must carry the selected user's id — otherwise the
		// export silently drops the selection and returns every tenant
		// member, a data-exposure-shaped bug the filename alone cannot catch
		// (review-r1-tests.md F12).
		const exportRequest = page.waitForRequest(
			(request) =>
				request.method() === 'GET' &&
				request.url().includes(`/staff/tenants/${TENANT_ID}/users/export`) &&
				new URL(request.url()).searchParams.get('ids') === JAMIE_USER_ID,
		);
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('menuitem', { name: 'Export selected users' }).click();
		await exportRequest;
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toMatch(
			/^ACME-members-\d{4}-\d{2}-\d{2}\.csv$/,
		);

		const stream = await download.createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream) {
			chunks.push(chunk as Buffer);
		}
		// The stream read proves the download pipe delivers the mocked body;
		// selection-scoping itself is proven above by the `ids` request
		// assertion and by `ExportTenantUsersAsStaff.Spec.cs`'s
		// `ItShouldExcludeCrossTenantIdsFromExport` — not by string-matching
		// this fixed mock body, which never contained an unselected user to
		// begin with (review-r2-tests.md F10).
		const csvContent = Buffer.concat(chunks).toString('utf-8');
		expect(csvContent).toContain('jamie@example.com');
	});
});

test.describe('staff tenant invite-user drawer', () => {
	// Mocked-route approach chosen over a real invite-then-revoke cycle: this
	// spec suite already mocks the staff API for every tenant-details test, so
	// staying consistent keeps the assertions deterministic without adding a
	// cleanup step that could leave state behind on a failed run.
	test('opens from the Users tab, validates, and submits via the invitations endpoint', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);
		await page.route(
			`**/staff/tenants/${TENANT_ID}/users/invitations`,
			async (route) => {
				if (route.request().method() !== 'POST') {
					await route.fallback();
					return;
				}

				await route.fulfill({
					status: 201,
					contentType: 'application/json',
					body: JSON.stringify({
						id: '0197b8f0-7777-7ccc-8ccc-1111aaaaaaaa',
						email: 'new-user@example.com',
					}),
				});
			},
		);

		await page.goto(`/staff/tenants/${TENANT_ID}/users`);
		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();

		await page.getByRole('button', { name: 'Invite people' }).click();
		const drawer = page.getByTestId('invite-tenant-user-drawer');
		await expect(drawer).toBeVisible();

		const usersOpenUrl = new URL(page.url());
		expect(usersOpenUrl.pathname).toBe(`/staff/tenants/${TENANT_ID}/users`);
		expect(usersOpenUrl.searchParams.get('invite')).toBe('1');
		await expect(
			page.locator('span[aria-current="page"]', { hasText: 'Users' }),
		).toHaveText('Users');

		await drawer.getByRole('button', { name: 'Invite people' }).click();
		await expect(page.getByText('Invalid email address')).toBeVisible();

		await drawer
			.getByRole('textbox', { name: 'Email', exact: true })
			.fill('new-user@example.com');

		const inviteRequest = page.waitForRequest(
			(request) =>
				request.method() === 'POST' &&
				request.url().includes(`/staff/tenants/${TENANT_ID}/users/invitations`),
		);
		await drawer.getByRole('button', { name: 'Invite people' }).click();
		await inviteRequest;

		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();
		await expect(drawer).toHaveCount(0);
		await expect
			.poll(() => new URL(page.url()).searchParams.has('invite'))
			.toBe(false);
		const usersAfterSubmit = new URL(page.url());
		expect(usersAfterSubmit.pathname).toBe(`/staff/tenants/${TENANT_ID}/users`);
		expect(usersAfterSubmit.searchParams.has('invite')).toBe(false);
		await expect(
			page.locator('span[aria-current="page"]', { hasText: 'Users' }),
		).toHaveText('Users');

		const successToasts = page.locator(
			'[data-sonner-toast][data-type="success"]',
		);
		await expect(
			page.getByText('Invitation sent successfully', { exact: true }),
		).toBeVisible();
		await expect(successToasts).toHaveCount(1);
		await expect(successToasts).toBeInViewport({ ratio: 1 });

		const toastBox = await successToasts.boundingBox();
		const viewport = page.viewportSize();
		expect(toastBox).not.toBeNull();
		expect(viewport).not.toBeNull();
		if (toastBox && viewport) {
			expect(toastBox.x).toBeGreaterThanOrEqual(0);
			expect(toastBox.y).toBeGreaterThanOrEqual(0);
			expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(viewport.width);
			expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(viewport.height);
		}
	});

	test('opens from the Invitations tab, validates, and submits via the invitations endpoint', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);
		await page.route(
			`**/staff/tenants/${TENANT_ID}/users/invitations`,
			async (route) => {
				if (route.request().method() !== 'POST') {
					await route.fallback();
					return;
				}

				await route.fulfill({
					status: 201,
					contentType: 'application/json',
					body: JSON.stringify({
						id: '0197b8f0-7777-7ccc-8ccc-2222aaaaaaaa',
						email: 'new-user@example.com',
					}),
				});
			},
		);

		await page.goto(`/staff/tenants/${TENANT_ID}/invitations?status=pending`);
		await expect(
			page.getByTestId('staff-tenant-invitations-page'),
		).toBeVisible();

		await page.getByRole('button', { name: 'Invite people' }).click();
		const drawer = page.getByTestId('invite-tenant-user-drawer');
		await expect(drawer).toBeVisible();

		const invitationsOpenUrl = new URL(page.url());
		expect(invitationsOpenUrl.pathname).toBe(
			`/staff/tenants/${TENANT_ID}/invitations`,
		);
		expect(invitationsOpenUrl.searchParams.get('invite')).toBe('1');
		expect(invitationsOpenUrl.searchParams.get('status')).toBe('pending');
		await expect(
			page.locator('span[aria-current="page"]', { hasText: 'Invitations' }),
		).toHaveText('Invitations');

		await drawer
			.getByRole('textbox', { name: 'Email', exact: true })
			.fill('new-user@example.com');
		const inviteRequest = page.waitForRequest(
			(request) =>
				request.method() === 'POST' &&
				request.url().includes(`/staff/tenants/${TENANT_ID}/users/invitations`),
		);
		await drawer.getByRole('button', { name: 'Invite people' }).click();
		await inviteRequest;

		await expect(
			page.getByTestId('staff-tenant-invitations-page'),
		).toBeVisible();
		await expect(drawer).toHaveCount(0);
		await expect
			.poll(() => new URL(page.url()).searchParams.has('invite'))
			.toBe(false);
		const invitationsAfterSubmit = new URL(page.url());
		expect(invitationsAfterSubmit.pathname).toBe(
			`/staff/tenants/${TENANT_ID}/invitations`,
		);
		expect(invitationsAfterSubmit.searchParams.get('invite')).toBeNull();
		expect(invitationsAfterSubmit.searchParams.get('status')).toBe('pending');
		await expect(
			page.locator('span[aria-current="page"]', { hasText: 'Invitations' }),
		).toHaveText('Invitations');
	});

	test('fails invite submit and keeps the drawer open on the same route', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);
		await page.route(
			`**/staff/tenants/${TENANT_ID}/users/invitations`,
			async (route) => {
				if (route.request().method() !== 'POST') {
					await route.fallback();
					return;
				}

				await route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({
						title: 'Failed to send invite',
					}),
				});
			},
		);

		await page.goto(`/staff/tenants/${TENANT_ID}/users?invite=1&status=active`);
		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();

		const drawer = page.getByTestId('invite-tenant-user-drawer');
		await expect(drawer).toBeVisible();

		await drawer
			.getByRole('textbox', { name: 'Email', exact: true })
			.fill('new-user@example.com');
		await drawer.getByRole('button', { name: 'Invite people' }).click();

		await expect(
			drawer.getByRole('button', { name: 'Invite people' }),
		).toBeVisible();
		const failedSubmitUrl = new URL(page.url());
		expect(failedSubmitUrl.pathname).toBe(`/staff/tenants/${TENANT_ID}/users`);
		expect(failedSubmitUrl.searchParams.get('invite')).toBe('1');
		expect(failedSubmitUrl.searchParams.get('status')).toBe('active');
		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();
		await expect(
			page.locator('span[aria-current="page"]', { hasText: 'Users' }),
		).toHaveText('Users');
	});

	test('the legacy users/invite URL redirects to the users tab with the drawer open', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);
		await page.route(
			`**/staff/tenants/${TENANT_ID}/users/invitations`,
			async (route) => {
				if (route.request().method() !== 'POST') {
					await route.fallback();
					return;
				}

				await route.fulfill({
					status: 201,
					contentType: 'application/json',
					body: JSON.stringify({
						id: '0197b8f0-7777-7ccc-8ccc-3333aaaaaaaa',
						email: 'new-user@example.com',
					}),
				});
			},
		);

		await page.goto(`/staff/tenants/${TENANT_ID}/users/invite`);

		await expect(page).toHaveURL(
			new RegExp(`/staff/tenants/${TENANT_ID}/users\\?invite=1$`),
		);
		await expect(page.getByTestId('invite-tenant-user-drawer')).toBeVisible();

		const legacyOpenUrl = new URL(page.url());
		expect(legacyOpenUrl.pathname).toBe(`/staff/tenants/${TENANT_ID}/users`);
		expect(legacyOpenUrl.searchParams.get('invite')).toBe('1');
		await expect(
			page.locator('span[aria-current="page"]', { hasText: 'Users' }),
		).toHaveText('Users');

		const drawer = page.getByTestId('invite-tenant-user-drawer');
		await expect(drawer).toBeVisible();

		await drawer
			.getByRole('textbox', { name: 'Email', exact: true })
			.fill('new-user@example.com');
		const inviteRequest = page.waitForRequest(
			(request) =>
				request.method() === 'POST' &&
				request.url().includes(`/staff/tenants/${TENANT_ID}/users/invitations`),
		);
		await drawer.getByRole('button', { name: 'Invite people' }).click();
		await inviteRequest;

		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();
		await expect(drawer).toHaveCount(0);
		await expect
			.poll(() => new URL(page.url()).searchParams.has('invite'))
			.toBe(false);
		const legacyAfterSubmit = new URL(page.url());
		expect(legacyAfterSubmit.pathname).toBe(
			`/staff/tenants/${TENANT_ID}/users`,
		);
		expect(legacyAfterSubmit.searchParams.has('invite')).toBe(false);
		await expect(
			page.locator('span[aria-current="page"]', { hasText: 'Users' }),
		).toHaveText('Users');
	});
});

test.describe('staff tenant profile create/edit drawers', () => {
	const mockPermissionCatalog = async (page: Page) => {
		await page.route('**/staff/permissions/scopes/tenant**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					Users: {
						read: {
							key: 'users.read',
							name: 'Read users',
							description: 'View tenant users.',
						},
					},
					Posts: {
						publish: {
							key: 'posts.publish',
							name: 'Publish posts',
							description: 'Publish posts on behalf of the tenant.',
						},
					},
				}),
			});
		});
	};

	test('New profile opens a drawer with a grouped, populated permissions checklist', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);
		await mockPermissionCatalog(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/profiles`);
		await expect(page.getByTestId('staff-tenant-profiles-page')).toBeVisible();

		await page.getByRole('button', { name: 'New profile' }).click();
		const drawer = page.getByTestId('profile-form-drawer');
		await expect(drawer).toBeVisible();

		await expect(drawer.getByText('Users', { exact: true })).toBeVisible();
		await expect(drawer.getByText('Posts', { exact: true })).toBeVisible();
		await expect(drawer.getByText('Read users')).toBeVisible();
		await expect(drawer.getByText('Publish posts')).toBeVisible();
	});

	test('the legacy profiles/new URL redirects to the profiles tab with the drawer open', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);
		await mockPermissionCatalog(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/profiles/new`);

		await expect(page).toHaveURL(
			new RegExp(`/staff/tenants/${TENANT_ID}/profiles\\?new=1$`),
		);
		await expect(page.getByTestId('profile-form-drawer')).toBeVisible();
	});
});

for (const width of [768, 390]) {
	test.describe(`staff tenant detail tables responsive at ${width}px`, () => {
		test.use({ viewport: { width, height: 800 } });

		test('Users table never overflows its card', async ({ page }) => {
			await loginAsStaffAdmin(page);
			await mockTenantDetails(page);

			await page.goto(`/staff/tenants/${TENANT_ID}/users`);
			await expectTableFitsCard(page, 'staff-tenant-users-table');
		});

		test('Invitations table never overflows its card', async ({ page }) => {
			await loginAsStaffAdmin(page);
			await mockTenantDetails(page);

			await page.goto(`/staff/tenants/${TENANT_ID}/invitations`);
			await expectTableFitsCard(page, 'staff-tenant-invitations-table');
		});

		test('Profiles table view never overflows its card', async ({ page }) => {
			await loginAsStaffAdmin(page);
			await mockTenantDetails(page);

			await page.goto(`/staff/tenants/${TENANT_ID}/profiles?view=table`);
			await expectTableFitsCard(page, 'staff-tenant-profiles-grid');
		});
	});
}
