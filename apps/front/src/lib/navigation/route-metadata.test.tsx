import { describe, expect, test } from 'vitest';

import {
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

	test('tenant scope has no rail items — only /tenant is registered so far', () => {
		expect(getRailItems('tenant')).toEqual([]);
	});

	test('rail items for scope are derived from pathname', () => {
		expect(
			getRailItemsForPath('/staff/staff-users').map((route) => route.id),
		).toEqual(['dashboard', 'tenants', 'staff']);
		expect(getRailItemsForPath('/tenant')).toEqual([]);
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

	test('tenant root resolves to no active rail item (no tenant routes registered yet)', () => {
		expect(getActiveRailItem('/tenant')).toBeUndefined();
		expect(getSecondaryPanelItems('/tenant')).toEqual([]);
	});

	test('secondary panel is shown on the staff dashboard (three destinations)', () => {
		expect(
			shouldShowSecondaryPanel('/staff/dashboard', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
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
});
