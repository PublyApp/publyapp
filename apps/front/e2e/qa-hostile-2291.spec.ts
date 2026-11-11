import { expect, test, type Page } from '@playwright/test';

import { COLOR_SCHEME_STORAGE_KEY } from '../src/lib/store/ui-store';
import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin, setLocaleCookie } from './helpers/login';

/**
 * Hostile-QA regression pass for issue #2291. Each test measures the same
 * property the report measured (bounding boxes, scrollWidth/clientWidth,
 * computed styles, accessible names, rendered copy) against the product, not
 * against a model of it.
 */

const TENANT_ID = '0197b8f0-7a10-7aaa-8aaa-aaaaaaaaaaaa';
const UNKNOWN_ID = '0197b8f0-9999-7aaa-8aaa-999999999999';
const DEFAULT_ROLE_ID = '0197b8f0-7b10-7bbb-8bbb-bbbbbbbbbbbb';
const LONG_ROLE_ID = '0197b8f0-7c10-7ccc-8ccc-cccccccccccc';

const LONG_TENANT_NAME =
	'Organisation Internationale de Coopération et de Développement des Territoires Sans Frontières — Direction Générale des Partenariats Stratégiques';
const LONG_ROLE_NAME =
	'Profil 3 — un nom de profil volontairement très long pour déborder de sa carte';
const LONG_ROLE_DESCRIPTION =
	'Description longue du profil. Description longue du profil. Description longue du profil. Description longue du profil.';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

const tenantPayload = (overrides: Record<string, unknown> = {}) => ({
	tenantId: TENANT_ID,
	name: LONG_TENANT_NAME,
	code: 'bulk-tenant-266',
	status: 'Active',
	usersCount: 47,
	maxUsers: 100,
	ownersCount: 0,
	pendingInvitationsCount: 1,
	expiringSoonInvitationsCount: 0,
	rolesCount: 2,
	logoUrl: null,
	createdAt: '2026-11-01T09:00:00Z',
	updatedAt: '2026-11-02T10:00:00Z',
	...overrides,
});

const roleRows = () => [
	{
		id: DEFAULT_ROLE_ID,
		name: 'Default role',
		description: 'Default role with no permissions',
		isDefault: true,
		userAccountCount: 0,
		permissionsCount: 12,
	},
	{
		id: LONG_ROLE_ID,
		name: LONG_ROLE_NAME,
		description: LONG_ROLE_DESCRIPTION,
		isDefault: false,
		userAccountCount: 3,
		permissionsCount: 4,
	},
];

const mockTenantWorkspace = async (page: Page): Promise<void> => {
	await page.route('**/staff/tenants/**', async (route) => {
		const request = route.request();
		if (request.method() !== 'GET') {
			await route.fallback();
			return;
		}

		const path = new URL(request.url()).pathname;

		if (
			path === `/staff/tenants/${TENANT_ID}` &&
			isApiPath(request.url(), path)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(tenantPayload()),
			});
			return;
		}

		if (isApiPath(request.url(), `/staff/tenants/${TENANT_ID}/roles`)) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data: roleRows(), nextCursor: null }),
			});
			return;
		}

		if (isApiPath(request.url(), `/staff/tenants/${TENANT_ID}/users`)) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data: [], nextCursor: null }),
			});
			return;
		}

		await route.fallback();
	});
};

const openFrench = async (page: Page): Promise<void> => {
	await setLocaleCookie(page, 'fr');
	await loginAsStaffAdmin(page);
	await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
};

const contrastRatio = async (
	page: Page,
	selector: string,
): Promise<{ ratio: number; opacity: number }> =>
	page.evaluate((target) => {
		const element = document.querySelector(target);
		if (!element) {
			throw new Error(`Missing contrast target ${target}`);
		}

		const parse = (value: string): [number, number, number, number] => {
			const match = value.match(
				/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/,
			);
			if (!match) {
				throw new Error(`Unparseable colour ${value}`);
			}
			return [
				Number(match[1]),
				Number(match[2]),
				Number(match[3]),
				match[4] === undefined ? 1 : Number(match[4]),
			];
		};

		const background = (node: Element): [number, number, number, number] => {
			let current: Element | null = node;
			while (current) {
				const colour = getComputedStyle(current).backgroundColor;
				if (colour && colour !== 'rgba(0, 0, 0, 0)') {
					return parse(colour);
				}
				current = current.parentElement;
			}
			return [255, 255, 255, 1];
		};

		const style = getComputedStyle(element);
		const effectiveOpacity =
			Number(style.opacity) *
			(element.parentElement
				? Number(getComputedStyle(element.parentElement).opacity)
				: 1);
		const [fgR, fgG, fgB, fgA] = parse(style.color);
		const [bgR, bgG, bgB] = background(element);
		const mix = (fg: number, bg: number, alpha: number) =>
			fg * alpha + bg * (1 - alpha);
		const channel = (value: number): number => {
			const normalized = value / 255;
			if (normalized <= 0.03928) {
				return normalized / 12.92;
			}
			return ((normalized + 0.055) / 1.055) ** 2.4;
		};
		const luminance = (red: number, green: number, blue: number): number =>
			0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
		const foregroundLuminance = luminance(
			mix(fgR, bgR, fgA * effectiveOpacity),
			mix(fgG, bgG, fgA * effectiveOpacity),
			mix(fgB, bgB, fgA * effectiveOpacity),
		);
		const backgroundLuminance = luminance(bgR, bgG, bgB);
		const lighter = Math.max(foregroundLuminance, backgroundLuminance);
		const darker = Math.min(foregroundLuminance, backgroundLuminance);

		return {
			ratio: (lighter + 0.05) / (darker + 0.05),
			opacity: effectiveOpacity,
		};
	}, selector);

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

test.describe(
	'hostile QA #2291 — high findings',
	{ tag: ['@shell', '@staff-tenants', '@2291'] },
	() => {
		test('H1: the organisations table scrolls inside its card and never widens the document', async ({
			page,
		}) => {
			await openFrench(page);
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto('/staff/tenants');
			await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();

			const measured = await page.evaluate(() => {
				const card = document.querySelector(
					'[data-testid="staff-tenants-table-card"]',
				);
				const scroller = document.querySelector(
					'[data-testid="staff-tenants-table-rows"]',
				);
				if (
					!(card instanceof HTMLElement) ||
					!(scroller instanceof HTMLElement)
				) {
					throw new Error('Organisations table card/scroller missing');
				}

				return {
					documentScrollWidth: document.documentElement.scrollWidth,
					viewportWidth: window.innerWidth,
					cardOverflowX: getComputedStyle(card).overflowX,
					scrollerOverflowX: getComputedStyle(scroller).overflowX,
					scrollerClientWidth: scroller.clientWidth,
					scrollerScrollWidth: scroller.scrollWidth,
				};
			});

			expect(
				measured.documentScrollWidth,
				'the page must not scroll horizontally',
			).toBeLessThanOrEqual(measured.viewportWidth + 1);
			expect(measured.scrollerOverflowX).toBe('auto');
			expect(
				measured.scrollerScrollWidth,
				'the table must be wider than its visible scroller, i.e. it really scrolls',
			).toBeGreaterThan(measured.scrollerClientWidth);

			await page.evaluate(() => {
				const scroller = document.querySelector(
					'[data-testid="staff-tenants-table-rows"]',
				);
				if (scroller instanceof HTMLElement) {
					scroller.scrollLeft = scroller.scrollWidth;
				}
			});
			await expect
				.poll(() =>
					page.evaluate(() => {
						const scroller = document.querySelector(
							'[data-testid="staff-tenants-table-rows"]',
						);
						return scroller instanceof HTMLElement ? scroller.scrollLeft : 0;
					}),
				)
				.toBeGreaterThan(0);

			const lastHeader = page
				.getByTestId('staff-tenants-table-card')
				.locator('thead th')
				.last();
			const headerBox = await lastHeader.boundingBox();
			const cardBox = await page
				.getByTestId('staff-tenants-table-card')
				.boundingBox();
			expect(headerBox).not.toBeNull();
			expect(cardBox).not.toBeNull();
			if (headerBox && cardBox) {
				expect(
					headerBox.x + headerBox.width,
					'the Actions header must be reachable inside the card',
				).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
			}
		});

		test('H2: the secondary heading and helper copy clear 4.5:1 in both themes', async ({
			page,
		}) => {
			await openFrench(page);
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto('/staff/staff-users');
			await expect(page.locator('#app-shell-secondary-heading')).toBeVisible();

			const lightHeading = await contrastRatio(
				page,
				'#app-shell-secondary-heading',
			);
			expect(lightHeading.opacity).toBe(1);
			expect(lightHeading.ratio).toBeGreaterThanOrEqual(4.5);
			// The helper class is shared; the invite form is the surface that
			// still renders it without needing a tenant fixture (the new-tenant
			// page was rebuilt on the prototype's FieldGroup notes).
			await page.goto('/staff/invitations/new');
			await expect(page.locator('.publy-type-helper').first()).toBeVisible();
			const lightHelper = await contrastRatio(page, '.publy-type-helper');
			expect(lightHelper.opacity).toBe(1);
			expect(lightHelper.ratio).toBeGreaterThanOrEqual(4.5);

			await page.goto('/staff/staff-users');
			await seedDarkTheme(page);
			await expect(page.locator('#app-shell-secondary-heading')).toBeVisible();
			const darkHeading = await contrastRatio(
				page,
				'#app-shell-secondary-heading',
			);
			expect(darkHeading.ratio).toBeGreaterThanOrEqual(4.5);
			await page.goto('/staff/invitations/new');
			await expect(page.locator('.publy-type-helper').first()).toBeVisible();
			const darkHelper = await contrastRatio(page, '.publy-type-helper');
			expect(darkHelper.ratio).toBeGreaterThanOrEqual(4.5);
		});

		test('H3: a long entity crumb ellipsizes, exposes its full name, and stays off the topbar controls', async ({
			page,
		}) => {
			await openFrench(page);
			await mockTenantWorkspace(page);
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(`/staff/tenants/${TENANT_ID}`);
			const crumb = page.getByTestId('app-shell-breadcrumb-entity-name');
			await expect(crumb).toBeVisible();

			const measurement = await crumb.evaluate((element) => {
				const box = element.getBoundingClientRect();
				const controls = document
					.querySelector('.app-shell-topbar-right')
					?.getBoundingClientRect();
				return {
					clientWidth: element.clientWidth,
					scrollWidth: element.scrollWidth,
					title: element.getAttribute('title'),
					textOverflow: getComputedStyle(element).textOverflow,
					right: box.right,
					controlsLeft: controls?.left ?? Number.POSITIVE_INFINITY,
				};
			});

			expect(measurement.title).toBe(LONG_TENANT_NAME);
			expect(measurement.textOverflow).toBe('ellipsis');
			expect(measurement.scrollWidth).toBeGreaterThan(measurement.clientWidth);
			expect(measurement.right).toBeLessThanOrEqual(
				measurement.controlsLeft + 1,
			);
		});

		test('H4: role cards clip their long content at 1440 and 390', async ({
			page,
		}) => {
			await openFrench(page);
			await mockTenantWorkspace(page);

			for (const viewport of [
				{ width: 1440, height: 900 },
				{ width: 390, height: 844 },
			]) {
				await page.setViewportSize(viewport);
				await page.goto(`/staff/tenants/${TENANT_ID}/roles`);
				const card = page.getByTestId(`staff-tenant-role-card-${LONG_ROLE_ID}`);
				await expect(card).toBeVisible();
				await page.evaluate(() => document.fonts.ready);
				const measured = await card.evaluate((element) => {
					const description = element.querySelector('p.truncate');
					return {
						clientWidth: element.clientWidth,
						scrollWidth: element.scrollWidth,
						descriptionOverflow: description
							? getComputedStyle(description).textOverflow
							: 'missing',
					};
				});
				expect(
					measured.scrollWidth,
					`card content must not overflow at ${viewport.width}px`,
				).toBeLessThanOrEqual(measured.clientWidth + 1);
				expect(measured.descriptionOverflow).toBe('ellipsis');
			}
		});

		test('H5: the report export menu names its format group « Format d\u2019export »', async ({
			page,
		}) => {
			await openFrench(page);
			await page.goto('/staff/dashboard/reports');
			// #2337 redesign: the format is picked in the « Exporter » menu, whose
			// group carries the explicit name « Format d'export ».
			await page.getByRole('button', { name: 'Exporter' }).click();
			await expect(
				page.getByRole('group', { name: "Format d'export" }),
			).toBeVisible();
		});

		test('H6: the user-menu trigger keeps the visible name in its accessible name', async ({
			page,
		}) => {
			await openFrench(page);
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto('/staff/dashboard');
			await expect(
				page.getByTestId('app-shell-user-menu-trigger'),
			).toBeVisible();
			// The chip shows the « Sans nom » placeholder while the current user
			// is still loading; read the name only once the real one is there.
			await expect(page.locator('.app-shell-user-name')).not.toHaveText(
				'Sans nom',
			);
			const visibleName =
				(await page.locator('.app-shell-user-name').textContent())?.trim() ??
				'';
			expect(
				visibleName.length,
				'the desktop trigger must visibly show a display name',
			).toBeGreaterThan(0);

			// WCAG 2.5.3: the visible name is part of the accessible name.
			const accessibleLabel = `Menu du compte — ${visibleName}`;
			await expect(
				page.getByTestId('app-shell-user-menu-trigger'),
			).toHaveAttribute('aria-label', accessibleLabel);
			await expect(
				page.getByRole('button', { name: accessibleLabel }),
			).toBeVisible();

			// At 390px the name is visually hidden, but the accessible name
			// still carries it and remains width-independent.
			await page.setViewportSize({ width: 390, height: 844 });
			await expect(
				page.getByTestId('app-shell-user-menu-trigger'),
			).toHaveAttribute('aria-label', accessibleLabel);
			await expect(
				page.getByRole('button', { name: accessibleLabel }),
			).toBeVisible();
		});
	},
);

test.describe(
	'hostile QA #2291 — medium findings',
	{ tag: ['@shell', '@staff-tenants', '@2291'] },
	() => {
		test('M1 + L3: 404 views show one translated sentence-case message, never the API English detail', async ({
			page,
		}) => {
			await openFrench(page);

			const problem = (detail: string) => ({
				status: 404,
				contentType: 'application/problem+json',
				body: JSON.stringify({
					type: 'about:blank',
					title: 'Not Found',
					status: 404,
					detail,
					translationKey: 'not-found',
				}),
			});

			await page.route('**/staff/tenants/**', async (route) => {
				if (isApiPath(route.request().url(), `/staff/tenants/${UNKNOWN_ID}`)) {
					await route.fulfill(problem('Tenant not found'));
					return;
				}
				await route.fallback();
			});
			await page.goto(`/staff/tenants/${UNKNOWN_ID}`);
			const tenantView = page.getByTestId('staff-tenant-details-not-found');
			await expect(tenantView).toBeVisible();
			await expect(tenantView).toContainText('Organisation introuvable');
			await expect(tenantView).not.toContainText('Tenant not found');
			// Owner decision #2291: a page-scale 404 is announced assertively.
			await expect(tenantView.getByRole('alert')).toBeVisible();

			await mockTenantWorkspace(page);
			await page.route('**/staff/tenants/**', async (route) => {
				if (
					isApiPath(
						route.request().url(),
						`/staff/tenants/${TENANT_ID}/users/${UNKNOWN_ID}`,
					)
				) {
					await route.fulfill(problem('Tenant user not found'));
					return;
				}
				await route.fallback();
			});
			await page.goto(`/staff/tenants/${TENANT_ID}/users/${UNKNOWN_ID}`);
			const tenantUserView = page.getByTestId(
				'staff-tenant-user-details-not-found',
			);
			await expect(tenantUserView).toBeVisible();
			await expect(tenantUserView).toContainText(
				"Utilisateur de l'organisation introuvable",
			);
			await expect(tenantUserView).not.toContainText('Tenant user not found');
			await expect(tenantUserView.getByRole('alert')).toBeVisible();
			await page.unroute('**/staff/tenants/**');

			await page.route('**/staff/roles/**', async (route) => {
				if (isApiPath(route.request().url(), `/staff/roles/${UNKNOWN_ID}`)) {
					await route.fulfill(problem('Role not found'));
					return;
				}
				await route.fallback();
			});
			await page.goto(`/staff/roles/${UNKNOWN_ID}`);
			const roleView = page.getByTestId('staff-role-details-not-found');
			await expect(roleView).toBeVisible();
			await expect(roleView).toContainText('Rôle du staff introuvable');
			await expect(roleView).not.toContainText('Role not found');

			await page.route('**/staff/staff-users/**', async (route) => {
				if (
					isApiPath(route.request().url(), `/staff/staff-users/${UNKNOWN_ID}`)
				) {
					await route.fulfill(problem('User not found'));
					return;
				}
				await route.fallback();
			});
			await page.goto(`/staff/staff-users/${UNKNOWN_ID}`);
			const userView = page.getByTestId('staff-user-details-not-found');
			await expect(userView).toBeVisible();
			await expect(userView).toContainText('Membre du staff introuvable');
			await expect(userView).not.toContainText('User not found');

			await page.route('**/staff/audit-logs/**', async (route) => {
				if (
					isApiPath(route.request().url(), `/staff/audit-logs/${UNKNOWN_ID}`)
				) {
					await route.fulfill(problem('Audit log not found'));
					return;
				}
				await route.fallback();
			});
			await page.goto(`/staff/audit-logs/${UNKNOWN_ID}`);
			const auditView = page.getByTestId('staff-audit-log-details-not-found');
			await expect(auditView).toBeVisible();
			await expect(auditView).toContainText("Journal d'audit introuvable");
			await expect(auditView).not.toContainText('audit log not found');
		});

		test('M2: the tenant identity metadata does not shatter the slug at 390px', async ({
			page,
		}) => {
			await openFrench(page);
			await mockTenantWorkspace(page);
			await page.setViewportSize({ width: 390, height: 844 });
			await page.goto(`/staff/tenants/${TENANT_ID}`);
			const meta = page.locator('.publy-tenant-identity-meta');
			await expect(meta).toBeVisible();

			const measured = await meta.evaluate((element) => {
				const code = element.querySelector('.publy-tenant-identity-meta-code');
				return {
					height: element.getBoundingClientRect().height,
					metaWidth: element.getBoundingClientRect().width,
					codeRects: code ? code.getClientRects().length : 0,
					codeWidth: code ? code.getBoundingClientRect().width : 0,
					documentScrollWidth: document.documentElement.scrollWidth,
					viewportWidth: window.innerWidth,
				};
			});

			expect(measured.codeRects).toBe(1);
			expect(measured.codeWidth).toBeLessThanOrEqual(measured.metaWidth);
			// The slug occupies one clipped line and the metadata its own
			// full-width row (the 32px copy button makes that row 32px tall, the
			// metadata wraps to two lines): the old 98px four-line shatter is
			// gone. Structural assertions below matter more than the exact height.
			expect(measured.height).toBeLessThan(80);
			expect(measured.documentScrollWidth).toBeLessThanOrEqual(
				measured.viewportWidth + 1,
			);
		});

		test('M3: the selection bar pluralises « 1 sélectionné » without "(s)"', async ({
			page,
		}) => {
			await openFrench(page);
			await page.goto('/staff/staff-users');
			await expect(page.getByTestId('staff-users-table-rows')).toBeVisible();
			await page
				.getByRole('checkbox', { name: /Sélectionner/ })
				.first()
				.click();
			const bar = page.getByTestId('floating-selection-bar');
			await expect(bar).toContainText('1 sélectionné');
			await expect(bar).not.toContainText('sélectionné(s)');
		});

		test('M4: the secondary heading names the page, Rapports included', async ({
			page,
		}) => {
			await openFrench(page);

			const cases = [
				['/staff/staff-users', 'Membres du staff'],
				['/staff/roles', 'Rôles'],
				['/staff/audit-logs', "Journaux d'audit"],
				['/staff/dashboard/reports', 'Rapports'],
			] as const;

			for (const [path, expected] of cases) {
				await page.goto(path);
				await expect(page.locator('#app-shell-secondary-heading')).toHaveText(
					expected,
				);
			}

			// #2337 redesign: every dashboard tab keeps the « Tableau de bord » h1
			// (prototype); « Rapports » is the secondary heading checked above.
			await page.goto('/staff/dashboard/reports');
			await expect(
				page.getByTestId('staff-dashboard-heading').locator('h1'),
			).toHaveText('Tableau de bord');
		});

		test('M5: the invite drawer traps Tab and Escape returns focus to the Invite button', async ({
			page,
		}) => {
			await openFrench(page);
			await mockTenantWorkspace(page);
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(`/staff/tenants/${TENANT_ID}/users?invite=1`);
			const drawer = page.locator('[data-slot="drawer"]');
			await expect(drawer).toBeVisible();

			const outside = new Set<string>();
			for (let index = 0; index < 40; index += 1) {
				await page.keyboard.press('Tab');
				const location = await page.evaluate(() => {
					const active = document.activeElement;
					if (!(active instanceof Element)) {
						return 'document';
					}
					if (active.closest('[data-slot="drawer"]')) {
						return 'inside';
					}
					// Base UI's focus trap bounces focus through two sentinel
					// spans (`data-base-ui-focus-guard`) at the ends of the
					// popup; they are trap machinery, not page controls.
					if (active.closest('[data-base-ui-focus-guard]')) {
						return 'inside';
					}
					return `${active.tagName}:${active.getAttribute('data-testid') ?? ''}`;
				});
				if (location !== 'inside') {
					outside.add(location);
				}
			}
			expect([...outside]).toEqual([]);

			await page.keyboard.press('Escape');
			await expect(drawer).toBeHidden();
			await expect(page.getByTestId('staff-tenant-users-invite')).toBeFocused();
		});

		test('M6: 403/404/500 paint distinct role=alert states with the right retry affordance', async ({
			page,
		}) => {
			await openFrench(page);

			const mockListFailure = async (status: number) => {
				await page.route('**/staff/tenants**', async (route) => {
					const url = new URL(route.request().url());
					if (
						route.request().method() === 'GET' &&
						url.origin === API_BASE_URL &&
						url.pathname === '/staff/tenants'
					) {
						await route.fulfill({
							status,
							contentType: 'application/problem+json',
							body: JSON.stringify({
								type: 'about:blank',
								title: 'Forbidden',
								status,
								detail: 'Access denied by upstream',
								translationKey: 'forbidden',
							}),
						});
						return;
					}
					await route.fallback();
				});
			};

			await mockListFailure(403);
			await page.goto('/staff/tenants');
			const forbidden = page.getByRole('alert');
			await expect(forbidden).toBeVisible();
			await expect(forbidden).toContainText('Accès refusé');
			await expect(forbidden).not.toContainText('Access denied by upstream');
			await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(
				0,
			);
			await page.unroute('**/staff/tenants**');

			await mockListFailure(404);
			await page.goto('/staff/tenants');
			const missing = page.getByRole('alert');
			await expect(missing).toBeVisible();
			await expect(missing).toContainText('Page introuvable');
			await expect(missing).not.toContainText('Access denied by upstream');
			// Owner decision 04/11: a 404 is retryable — only a 403 is « Retour
			// à l'accueil » alone, because retrying cannot grant access.
			await expect(
				page.getByRole('button', { name: 'Réessayer' }),
			).toBeVisible();
			await page.unroute('**/staff/tenants**');

			await mockListFailure(500);
			await page.goto('/staff/tenants');
			const failure = page.getByRole('alert');
			await expect(failure).toBeVisible();
			await expect(failure).toContainText('Impossible de charger');
			await expect(
				page.getByRole('button', { name: 'Réessayer' }),
			).toBeVisible();
		});

		test('M6b: page-scale 403/404/500 views are role=alert surfaces', async ({
			page,
		}) => {
			await openFrench(page);

			const mockTenantFailure = async (status: number, title: string) => {
				await page.route('**/staff/tenants/**', async (route) => {
					if (isApiPath(route.request().url(), `/staff/tenants/${TENANT_ID}`)) {
						await route.fulfill({
							status,
							contentType: 'application/problem+json',
							body: JSON.stringify({
								type: 'about:blank',
								title,
								status,
								detail: 'Access denied by upstream',
								translationKey: status === 403 ? 'forbidden' : 'request-failed',
							}),
						});
						return;
					}
					await route.fallback();
				});
			};

			await mockTenantFailure(403, 'Forbidden');
			await page.goto(`/staff/tenants/${TENANT_ID}`);
			const forbidden = page.getByTestId('view-403');
			await expect(forbidden).toBeVisible();
			await expect(forbidden.getByRole('alert')).toContainText('Accès refusé');
			await expect(forbidden).not.toContainText('Access denied by upstream');
			await page.unroute('**/staff/tenants/**');

			await mockTenantFailure(500, 'Internal Server Error');
			await page.goto(`/staff/tenants/${TENANT_ID}`);
			const failure = page.getByTestId('staff-tenant-details-error');
			await expect(failure).toBeVisible();
			await expect(failure.getByRole('alert')).toContainText(
				'Impossible de charger',
			);
			await expect(
				page.getByRole('button', { name: 'Réessayer' }),
			).toBeVisible();
		});

		test('M7: the role selector label can ellipsize instead of clipping its last letters', async ({
			page,
		}) => {
			await openFrench(page);
			await mockTenantWorkspace(page);
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(`/staff/tenants/${TENANT_ID}/users?invite=1`);
			const drawer = page.locator('[data-slot="drawer"]');
			await expect(drawer).toBeVisible();
			const trigger = drawer
				.locator('button')
				.filter({ hasText: 'Sélectionner les rôles' })
				.first();
			const label = trigger.locator('span').first();
			const measured = await label.evaluate((element) => ({
				textOverflow: getComputedStyle(element).textOverflow,
				minWidth: getComputedStyle(element).minWidth,
				flex: getComputedStyle(element).flex,
			}));
			expect(measured.textOverflow).toBe('ellipsis');
			expect(measured.minWidth).toBe('0px');
		});

		test('M8: the audit date filters use the French locale format while the URL stays ISO', async ({
			page,
		}) => {
			await openFrench(page);
			await page.goto('/staff/audit-logs');
			const start = page.getByTestId('staff-audit-logs-start-date');
			await expect(start).toHaveAttribute('placeholder', 'jj/mm/aaaa');
			await start.fill('02/11/2026');
			await start.press('Tab');
			await expect(page).toHaveURL(/[?&]start_date=2026-11-02(?:&|$)/);
			await expect(start).toHaveValue('02/11/2026');

			// An unparseable date shows a visible, associated error and leaves
			// the URL (the filter of record) untouched.
			await start.fill('31/02/2026');
			await start.press('Tab');
			await expect(start).toHaveAttribute('aria-invalid', 'true');
			await expect(page.getByText('Saisissez une date valide.')).toBeVisible();
			await expect(page).toHaveURL(/[?&]start_date=2026-11-02(?:&|$)/);

			// Clearing keeps focus in the field the user is typing in.
			await start.fill('');
			await expect(start).toBeFocused();
		});

		test('M9 + L2: the default role is translated and list cells truncate with an ellipsis', async ({
			page,
		}) => {
			await openFrench(page);
			await mockTenantWorkspace(page);
			await page.goto(`/staff/tenants/${TENANT_ID}/roles`);
			const defaultCard = page.getByTestId(
				`staff-tenant-role-card-${DEFAULT_ROLE_ID}`,
			);
			await expect(defaultCard).toContainText('Rôle par défaut');
			await expect(defaultCard).toContainText(
				'Rôle par défaut sans autorisations',
			);
			await expect(defaultCard).not.toContainText('Default role');

			// The invite drawer's role dropdown is the same flow: it must
			// show the translated default name too, never the raw seeded copy.
			await page.goto(`/staff/tenants/${TENANT_ID}/users?invite=1`);
			const drawer = page.locator('[data-slot="drawer"]');
			await expect(drawer).toBeVisible();
			const roleTrigger = drawer
				.locator('button')
				.filter({ hasText: 'Sélectionner les rôles' })
				.first();
			await expect(roleTrigger).toBeEnabled();
			await roleTrigger.click();
			await expect(
				page.getByRole('menuitemcheckbox', { name: /Rôle par défaut/ }),
			).toBeVisible();
			await expect(
				page.getByRole('menuitemcheckbox', { name: /Default role/ }),
			).toHaveCount(0);
			await page.keyboard.press('Escape');

			await page.goto('/staff/tenants');
			await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
			const invitationsCell = page
				.getByTestId('staff-tenants-table-rows')
				.locator('tbody tr')
				.first()
				.locator('td')
				.nth(8);
			const cell = await invitationsCell.evaluate((element) => ({
				text: element.textContent?.trim(),
				textOverflow: getComputedStyle(element).textOverflow,
				scrollWidth: element.scrollWidth,
				clientWidth: element.clientWidth,
			}));
			expect(cell.text).toBe('—');
			expect(cell.textOverflow).toBe('ellipsis');
			expect(cell.scrollWidth).toBeLessThanOrEqual(cell.clientWidth + 1);
		});

		test('M10: the Filters trigger accessible name starts with the visible « Filtres 1 »', async ({
			page,
		}) => {
			await openFrench(page);
			await page.goto('/staff/tenants?status=pending');
			await expect(
				page.getByRole('button', { name: /^Filtres 1/ }),
			).toBeVisible();
			await expect(
				page.getByRole('button', { name: /^Filtres 1/ }),
			).toHaveAttribute('aria-label', /^Filtres 1 — 1 filtre actif$/);
		});

		test('L1: no "preloaded but not used" console warning on a normal page load', async ({
			page,
		}) => {
			const warnings: string[] = [];
			page.on('console', (message) => {
				if (message.type() === 'warning') {
					warnings.push(message.text());
				}
			});
			await openFrench(page);
			await page.goto('/staff/staff-users');
			await expect(page.getByTestId('staff-users-table-rows')).toBeVisible();
			await page.waitForTimeout(1500);
			expect(
				warnings.filter((warning) =>
					warning.includes('preloaded using link preload'),
				),
			).toEqual([]);
		});
	},
);
