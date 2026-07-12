import { expect, test, type Page } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const API_BASE_URL = 'https://api.front-2.localhost:8443';
const TENANT_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

/** Floating bar is portalled to `document.body` and pinned near the viewport
 * bottom — assert it isn't trapped inside `.app-shell-main`'s scroll area. */
const expectFloatingSelectionBarAtViewportBottom = async (page: Page) => {
	const bar = page.getByTestId('floating-selection-bar');
	await expect(bar).toBeVisible();

	const viewportHeight = page.viewportSize()?.height ?? 0;
	const box = await bar.boundingBox();
	expect(box).not.toBeNull();
	if (box) {
		expect(box.y + box.height).toBeGreaterThan(viewportHeight - 80);
	}
};

const mockTenantDetails = async (page: Page) => {
	// A single '*' glob cannot cross a path separator (compiles to [^/]*), so
	// '**' is required to match both the tenant collection and its sub-paths.
	await page.route(`**/staff/tenants/**`, async (route) => {
		const request = route.request();
		const url = request.url();

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
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{
							id: '0197b8f0-4444-7ccc-8ccc-dddddddddddd',
							email: 'jamie@example.com',
							firstName: 'Jamie',
							lastName: 'Lee',
							avatarUrl: null,
							status: 'Active',
							level: 'Admin',
						},
					],
					nextCursor: null,
				}),
			});
			return;
		}

		if (
			request.method() === 'GET' &&
			isApiPath(url, `/staff/tenants/${TENANT_ID}/profiles`)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{
							id: '0197b8f0-5555-7ccc-8ccc-eeeeeeeeeeee',
							name: 'Approvers',
							description: 'Can review approvals',
							isDefault: true,
							userAccountCount: 7,
							permissionsCount: 3,
						},
					],
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
							id: '0197b8f0-6666-7ccc-8ccc-ffffffffffff',
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

		// Rail-only: no secondary panel on the detail route, regardless of the
		// sidebarOpen preference (route-metadata.ts isRailOnlyPath).
		await expect(page.getByTestId('app-shell-secondary-panel')).toHaveCount(0);

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
			page.getByRole('heading', { name: /Pending invitations/ }),
		).toContainText('4');
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

		await page
			.getByLabel(/^Select row /)
			.first()
			.click();
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

		await page
			.getByLabel(/^Select row /)
			.first()
			.click();
		await expectFloatingSelectionBarAtViewportBottom(page);
		await page
			.getByTestId('floating-selection-bar')
			.getByRole('button', { name: 'More actions' })
			.click();

		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('menuitem', { name: 'Export selected users' }).click();
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toMatch(
			/^ACME-members-\d{4}-\d{2}-\d{2}\.csv$/,
		);
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

		await drawer.getByRole('button', { name: 'Invite people' }).click();
		await expect(page.getByText('Invalid email address.')).toBeVisible();

		await drawer
			.getByRole('textbox', { name: 'Email' })
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
	});

	test('the legacy users/invite URL redirects to the users tab with the drawer open', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/users/invite`);

		await expect(page).toHaveURL(
			new RegExp(`/staff/tenants/${TENANT_ID}/users\\?invite=1$`),
		);
		await expect(page.getByTestId('invite-tenant-user-drawer')).toBeVisible();
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
