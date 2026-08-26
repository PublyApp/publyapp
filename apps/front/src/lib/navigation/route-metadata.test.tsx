import { describe, expect, test } from 'vitest';

import {
	filterRailItemsByPermissions,
	getActiveRailItem,
	getRailItems,
	getRailItemsForPath,
	getSecondaryPanelItems,
	isSecondaryPanelItemActive,
	shouldShowSecondaryPanel,
} from './route-metadata';

describe('front route metadata', () => {
	test('staff visible rail label keys are scoped and exact', () => {
		expect(getRailItems('staff').map((route) => route.labelKey)).toEqual([
			'nav-dashboard',
			'nav-tenants',
			'nav-staff',
		]);
	});

	test('tenant rail entries are the three shipped workspace sections', () => {
		// #818 F8: Organizations is hidden from the rail until an organizations
		// API exists; the page itself stays reachable by deep link.
		expect(getRailItems('tenant').map((route) => route.labelKey)).toEqual([
			'account',
			'settings',
			'posts',
		]);
	});

	test('rail items for scope are derived from pathname', () => {
		expect(
			getRailItemsForPath('/staff/staff-users').map((route) => route.id),
		).toEqual(['dashboard', 'tenants', 'staff']);
		expect(getRailItemsForPath('/tenant').map((route) => route.id)).toEqual([
			'account',
			'settings',
			'posts',
		]);
		expect(
			getRailItemsForPath('/tenant/account').map((route) => route.id),
		).toEqual(['account', 'settings', 'posts']);
	});

	test('staff dashboard panel items are exact', () => {
		expect(
			getSecondaryPanelItems('/staff/dashboard').map((item) => item.labelKey),
		).toEqual([
			'nav-dashboard-overview',
			'nav-dashboard-activity',
			'nav-dashboard-reports',
		]);
	});

	test('staff tenants panel items are exact', () => {
		expect(
			getSecondaryPanelItems('/staff/tenants').map((item) => item.labelKey),
		).toEqual([
			'nav-tenants-all',
			'nav-tenants-pending',
			'nav-tenants-active',
			'nav-tenants-suspended',
		]);
	});

	test('staff users panel items are exact', () => {
		expect(
			getSecondaryPanelItems('/staff/staff-users').map((item) => item.labelKey),
		).toEqual([
			'nav-staff-all-users',
			'nav-staff-invitations',
			'nav-staff-profiles',
			'nav-staff-audit-logs',
		]);
	});

	test('tenant root resolves to no active rail item — the picker has no module', () => {
		expect(getActiveRailItem('/tenant')).toBeUndefined();
		expect(getSecondaryPanelItems('/tenant')).toEqual([]);
	});

	test('tenant child routes resolve to their workspace module', () => {
		expect(getActiveRailItem('/tenant/account')?.id).toBe('account');
		expect(getActiveRailItem('/tenant/account/security')?.id).toBe('account');
		expect(getActiveRailItem('/tenant/account/notifications')?.id).toBe(
			'account',
		);
		expect(getActiveRailItem('/tenant/settings')?.id).toBe('settings');
		expect(getActiveRailItem('/tenant/posts')?.id).toBe('posts');
		// Organizations is hidden from the rail (#818): the route still renders,
		// but no rail item owns it while the API gap stands.
		expect(getActiveRailItem('/tenant/organizations')).toBeUndefined();
	});

	test('tenant account panel items are exact', () => {
		// #818 F8: Security and Notifications are hidden until their APIs
		// exist; only Profile ships today.
		expect(
			getSecondaryPanelItems('/tenant/account').map((item) => item.labelKey),
		).toEqual(['profile']);
	});

	test('tenant account panel: only the deepest matching row is active', () => {
		const [profile] = getSecondaryPanelItems('/tenant/account');
		if (!profile) {
			throw new Error('expected the profile account panel item to exist');
		}

		expect(isSecondaryPanelItemActive(profile, '/tenant/account', {})).toBe(
			true,
		);

		// The Profile row matches `/tenant/account` by prefix — `matchExact`
		// must keep it off children's routes, including deep-linked hidden
		// sections whose routes stay registered.
		expect(
			isSecondaryPanelItemActive(profile, '/tenant/account/security', {}),
		).toBe(false);
		expect(
			isSecondaryPanelItemActive(profile, '/tenant/account/notifications', {}),
		).toBe(false);
	});

	test('secondary panel is shown on the staff dashboard (three destinations)', () => {
		expect(
			shouldShowSecondaryPanel('/staff/dashboard', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
	});

	test('secondary panel auto-drops on the tenant account module once below two destinations', () => {
		// #818 F8: with Security and Notifications hidden, account ships a
		// single panel row — below the >=2 threshold the panel requires.
		expect(
			shouldShowSecondaryPanel('/tenant/account', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(false);
		expect(
			shouldShowSecondaryPanel('/tenant/settings', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(false);
	});

	test('staff users panel destinations keep the secondary panel visible', () => {
		expect(
			shouldShowSecondaryPanel('/staff/staff-users', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
	});

	test('detail routes follow the same sidebarOpen preference as list routes', () => {
		expect(
			shouldShowSecondaryPanel('/staff/staff-users/u-1', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
		expect(
			shouldShowSecondaryPanel('/staff/invitations/i-1', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
		expect(
			shouldShowSecondaryPanel('/staff/profiles/p-1', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
		expect(
			shouldShowSecondaryPanel('/staff/tenants/t-1', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
		expect(
			shouldShowSecondaryPanel('/staff/tenants/t-1/edit', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
		expect(
			shouldShowSecondaryPanel('/staff/tenants/t-1/users/invite', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
	});

	test('closed sidebar preference still collapses detail routes', () => {
		expect(
			shouldShowSecondaryPanel('/staff/staff-users/u-1', {
				sidebarOpen: false,
				viewportWidth: 1280,
			}),
		).toBe(false);
	});

	test('form (create) routes follow sidebarOpen preference', () => {
		expect(
			shouldShowSecondaryPanel('/staff/tenants/new', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
		expect(
			shouldShowSecondaryPanel('/staff/profiles/new', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
		expect(
			shouldShowSecondaryPanel('/staff/invitations/new', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
	});

	test('list routes (non-detail) keep the secondary panel visible when open', () => {
		expect(
			shouldShowSecondaryPanel('/staff/staff-users', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
		expect(
			shouldShowSecondaryPanel('/staff/tenants', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
	});

	test('active route detection should not prefix-match false positives', () => {
		expect(getActiveRailItem('/staff/staff-usersXYZ')).toBeUndefined();
	});

	test('secondary panel is hidden on small viewports', () => {
		expect(
			shouldShowSecondaryPanel('/staff/staff-users', {
				sidebarOpen: true,
				viewportWidth: 1023,
			}),
		).toBe(false);
		expect(
			shouldShowSecondaryPanel('/staff/tenants', {
				sidebarOpen: true,
				viewportWidth: 767,
			}),
		).toBe(false);
	});

	test('tenants panel items distinguish All tenants from the status filters', () => {
		const [allTenants, pending, active, suspended] =
			getSecondaryPanelItems('/staff/tenants');
		if (!allTenants || !pending || !active || !suspended) {
			throw new Error('expected all four tenants panel items to exist');
		}

		expect(isSecondaryPanelItemActive(allTenants, '/staff/tenants', {})).toBe(
			true,
		);
		expect(isSecondaryPanelItemActive(pending, '/staff/tenants', {})).toBe(
			false,
		);
		expect(isSecondaryPanelItemActive(active, '/staff/tenants', {})).toBe(
			false,
		);
		expect(isSecondaryPanelItemActive(suspended, '/staff/tenants', {})).toBe(
			false,
		);

		expect(
			isSecondaryPanelItemActive(pending, '/staff/tenants', {
				status: 'pending',
			}),
		).toBe(true);
		expect(
			isSecondaryPanelItemActive(allTenants, '/staff/tenants', {
				status: 'pending',
			}),
		).toBe(false);

		expect(
			isSecondaryPanelItemActive(active, '/staff/tenants', {
				status: 'active',
			}),
		).toBe(true);
		expect(
			isSecondaryPanelItemActive(allTenants, '/staff/tenants', {
				status: 'active',
			}),
		).toBe(false);
		expect(
			isSecondaryPanelItemActive(suspended, '/staff/tenants', {
				status: 'active',
			}),
		).toBe(false);

		expect(
			isSecondaryPanelItemActive(suspended, '/staff/tenants', {
				status: 'suspended',
			}),
		).toBe(true);
		expect(
			isSecondaryPanelItemActive(allTenants, '/staff/tenants', {
				status: 'suspended',
			}),
		).toBe(false);

		for (const item of [pending, active, suspended, allTenants]) {
			expect(
				isSecondaryPanelItemActive(item, '/staff/tenants', {
					status: 'active,suspended',
				}),
			).toBe(false);
		}
	});

	// Lane #142 — permission-based navigation filtering. The rail items
	// declare the permission key(s) they require; an item without a key
	// (e.g. the tenant "Account" rail) is always visible. The shape is
	// a pure function of the items and a permission set, so it must be
	// exhaustively testable without rendering or mocking the network.
	describe('rail items are filtered by the user permission set (#142)', () => {
		test('every tenant rail item declares the permission keys it requires', () => {
			const items = getRailItems('tenant');
			const requiredKeys = items.map((item) => item.requiredPermissions);
			// Each key mirrors the gate the API enforces on the underlying
			// surface, so a hidden rail entry and a direct URL hit fail on the
			// SAME key: settings maps to the canonical tenant-module key
			// (TenantModulePermissionsForTenant), posts to the very key
			// `.WithTenantPermission([Posts.VIEW])` checks on GET /posts.
			// "Account" is the personal settings rail and "Organizations" is
			// still a static placeholder with no server resource behind it —
			// both stay unconditionally visible (empty array = no filter).
			expect(requiredKeys).toEqual([
				[],
				['tenant.modules.access_settings'],
				['tenant.posts.view'],
				[],
			]);
		});

		test('every staff rail item declares the permission key it requires', () => {
			const items = getRailItems('staff');
			const requiredKeys = items.map((item) => item.requiredPermissions);
			// Staff has no module-level gate yet — the staff rail is always
			// visible. The empty array encodes that contract: NO filter.
			expect(requiredKeys).toEqual([[], [], []]);
		});

		test('filterRailItemsByPermissions keeps items whose required key is granted', () => {
			const items = getRailItems('tenant');
			const allowed = new Set<string>(['tenant.posts.view']);
			const filtered = filterRailItemsByPermissions(items, allowed);
			// `account` and `organizations` have no required key → always
			// visible; `posts` survives because its key is granted; `settings`
			// drops (key missing).
			expect(filtered.map((item) => item.id)).toEqual([
				'account',
				'posts',
				'organizations',
			]);
		});

		test('filterRailItemsByPermissions keeps only unconditioned items when the set is empty', () => {
			const items = getRailItems('tenant');
			const filtered = filterRailItemsByPermissions(items, new Set());
			// Only `account` and the placeholder `organizations` survive (both
			// require no permission).
			expect(filtered.map((item) => item.id)).toEqual([
				'account',
				'organizations',
			]);
		});

		test('filterRailItemsByPermissions keeps everything when every key is allowed', () => {
			const items = getRailItems('tenant');
			const allowed = new Set<string>([
				'tenant.modules.access_dashboard',
				'tenant.modules.access_settings',
				'tenant.posts.view',
				'tenant.modules.access_users',
			]);
			const filtered = filterRailItemsByPermissions(items, allowed);
			expect(filtered).toEqual(items);
		});

		test('the "*" admin sentinel keeps the whole rail visible without listing keys', () => {
			// Tenant admins pass every TenantPermissionFilter gate via the
			// backend's "*" sentinel (user-auth-data materialises it for
			// AccountLevel.Admin); scope-auth-data carries IsAdmin alongside
			// profile keys, so the filter honours the same sentinel instead
			// of hiding modules from an admin whose profile lists no keys.
			const items = getRailItems('tenant');
			const filtered = filterRailItemsByPermissions(items, new Set(['*']));
			expect(filtered).toEqual(items);
		});

		test('getRailItemsForPath with no permission set returns the full rail (back-compat)', () => {
			// Pre-permission-filtering callers (unit tests, marketing shell,
			// the neutral authed shell) MUST keep seeing the full rail.
			expect(getRailItemsForPath('/tenant/posts').map((i) => i.id)).toEqual([
				'account',
				'settings',
				'posts',
				'organizations',
			]);
		});

		test('getRailItemsForPath with a permission set narrows the rail to allowed items', () => {
			const allowed = new Set<string>(['tenant.modules.access_settings']);
			expect(
				getRailItemsForPath('/tenant/posts', {
					allowedPermissions: allowed,
				}).map((i) => i.id),
			).toEqual(['account', 'settings', 'organizations']);
		});
	});
});
