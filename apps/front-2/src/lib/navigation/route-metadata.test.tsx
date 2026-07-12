import { describe, expect, test } from 'vitest';

import {
	getActiveRailItem,
	getBreadcrumbsForPath,
	getBottomRailItemForPath,
	getRailItems,
	getRailItemsForPath,
	getSecondaryPanelItems,
	isSecondaryPanelItemActive,
	shouldShowSecondaryPanel,
} from './route-metadata';

describe('front-2 route metadata', () => {
	test('staff visible rail labels are scoped and exact', () => {
		expect(getRailItems('staff').map((route) => route.label)).toEqual([
			'Dashboard',
			'Tenants',
			'Staff',
			'Audit logs',
		]);
	});

	test('tenant visible rail labels are scoped and exact', () => {
		expect(getRailItems('tenant').map((route) => route.label)).toEqual([
			'Posts',
			'Members',
			'Settings',
		]);
	});

	test('staff has no bottom rail item and tenant has Account', () => {
		expect(getBottomRailItemForPath('/staff/staff-users')).toBeUndefined();
		expect(getBottomRailItemForPath('/tenant/posts')?.label).toBe('Account');
	});

	test('rail items for scope are derived from pathname', () => {
		expect(
			getRailItemsForPath('/staff/staff-users').map((route) => route.id),
		).toEqual(['dashboard', 'tenants', 'staff', 'audit-logs']);
		expect(
			getRailItemsForPath('/tenant/posts').map((route) => route.id),
		).toEqual(['posts', 'members', 'settings']);
	});

	test('staff dashboard panel items are exact', () => {
		expect(
			getSecondaryPanelItems('/staff/dashboard').map((item) => item.label),
		).toEqual(['Overview', 'Activity', 'Reports']);
	});

	test('staff tenants panel items are exact', () => {
		expect(
			getSecondaryPanelItems('/staff/tenants').map((item) => item.label),
		).toEqual(['All tenants', 'Active', 'Suspended']);
	});

	test('staff users panel items are exact', () => {
		expect(
			getSecondaryPanelItems('/staff/staff-users').map((item) => item.label),
		).toEqual(['All users', 'Invitations', 'Profiles']);
	});

	test('staff audit-logs panel items are exact', () => {
		expect(
			getSecondaryPanelItems('/staff/audit-logs').map((item) => item.label),
		).toEqual([
			'All events',
			'Sign-ins & sessions',
			'User management',
			'Tenant lifecycle',
			'Destructive actions',
		]);
	});

	test('tenant posts panel items are exact', () => {
		expect(
			getSecondaryPanelItems('/tenant/posts').map((item) => item.label),
		).toEqual(['Calendar', 'Queue', 'Drafts', 'History']);
	});

	test('tenant root resolves to the Posts module without requiring child routes', () => {
		expect(getActiveRailItem('/tenant')?.label).toBe('Posts');
		expect(getSecondaryPanelItems('/tenant').map((item) => item.label)).toEqual(
			['Calendar', 'Queue', 'Drafts', 'History'],
		);
	});

	test('tenant and audit panel destinations keep the secondary panel visible', () => {
		expect(
			shouldShowSecondaryPanel('/tenant/posts/history', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
		expect(
			shouldShowSecondaryPanel('/staff/audit-logs/sign-ins', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
	});

	test('tenant members panel items are exact', () => {
		expect(
			getSecondaryPanelItems('/tenant/members').map((item) => item.label),
		).toEqual(['Members', 'Invitations', 'Roles']);
	});

	test('tenant settings panel items are exact', () => {
		expect(
			getSecondaryPanelItems('/tenant/settings').map((item) => item.label),
		).toEqual(['General', 'Workspaces', 'Integrations', 'Billing', 'Security']);
	});

	test('tenant account panel items are exact', () => {
		expect(
			getSecondaryPanelItems('/tenant/account').map((item) => item.label),
		).toEqual(['Profile', 'Security', 'Notifications']);
	});

	test('secondary panel is shown on the staff dashboard (three destinations)', () => {
		expect(
			shouldShowSecondaryPanel('/staff/dashboard', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
	});

	test('secondary panel collapses on detail routes regardless of sidebarOpen (rail-only)', () => {
		expect(
			shouldShowSecondaryPanel('/staff/staff-users/u-1', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(false);
		expect(
			shouldShowSecondaryPanel('/staff/invitations/i-1', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(false);
		expect(
			shouldShowSecondaryPanel('/staff/profiles/p-1', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(false);
		expect(
			shouldShowSecondaryPanel('/staff/tenants/t-1', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(false);
		expect(
			shouldShowSecondaryPanel('/staff/tenants/t-1/edit', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(false);
		expect(
			shouldShowSecondaryPanel('/staff/tenants/t-1/users/invite', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(false);
	});

	test('secondary panel opens on rail-only routes when railOnlyPanelOpen is explicitly set', () => {
		expect(
			shouldShowSecondaryPanel('/staff/staff-users/u-1', {
				sidebarOpen: true,
				railOnlyPanelOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
		expect(
			shouldShowSecondaryPanel('/staff/tenants/t-1', {
				sidebarOpen: false,
				railOnlyPanelOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
	});

	test('rail-only routes stay closed at the default (no railOnlyPanelOpen passed)', () => {
		expect(
			shouldShowSecondaryPanel('/staff/staff-users/u-1', {
				viewportWidth: 1280,
			}),
		).toBe(false);
	});

	test('form (create) routes are also rail-only — the secondary panel collapses', () => {
		expect(
			shouldShowSecondaryPanel('/staff/tenants/new', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(false);
		expect(
			shouldShowSecondaryPanel('/staff/profiles/new', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(false);
		expect(
			shouldShowSecondaryPanel('/staff/invitations/new', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(false);
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
		expect(getActiveRailItem('/tenant/postsXYZ')).toBeUndefined();
	});

	test('secondary panel is hidden on small viewports', () => {
		expect(
			shouldShowSecondaryPanel('/staff/staff-users', {
				sidebarOpen: true,
				viewportWidth: 1023,
			}),
		).toBe(false);
		expect(
			shouldShowSecondaryPanel('/tenant/posts', {
				sidebarOpen: true,
				viewportWidth: 767,
			}),
		).toBe(false);
	});

	test('tenants panel items distinguish All tenants from the status filters', () => {
		const [allTenants, active, suspended] =
			getSecondaryPanelItems('/staff/tenants');
		if (!allTenants || !active || !suspended) {
			throw new Error('expected all three tenants panel items to exist');
		}

		expect(isSecondaryPanelItemActive(allTenants, '/staff/tenants', {})).toBe(
			true,
		);
		expect(isSecondaryPanelItemActive(active, '/staff/tenants', {})).toBe(
			false,
		);
		expect(isSecondaryPanelItemActive(suspended, '/staff/tenants', {})).toBe(
			false,
		);

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
	});

	test('breadcrumbs use staff/tenant handoff roots', () => {
		expect(getBreadcrumbsForPath('/staff/dashboard')).toEqual([
			{ label: 'Staff', path: '/staff' },
			{ label: 'Dashboard', path: '/staff/dashboard' },
		]);
		expect(getBreadcrumbsForPath('/staff/staff-users')).toEqual([
			{ label: 'Staff', path: '/staff' },
			{ label: 'Users', path: '/staff/staff-users' },
		]);
		expect(getBreadcrumbsForPath('/staff/staff-users/u-1')).toEqual([
			{ label: 'Staff', path: '/staff' },
			{ label: 'Users', path: '/staff/staff-users' },
			{ label: 'User detail' },
		]);
		expect(getBreadcrumbsForPath('/staff/invitations/i-1')).toEqual([
			{ label: 'Staff', path: '/staff' },
			{ label: 'Invitations', path: '/staff/invitations' },
			{ label: 'Invitation detail' },
		]);
		expect(getBreadcrumbsForPath('/tenant/posts')).toEqual([
			{ label: 'Lattice Cloud', path: '/tenant' },
			{ label: 'Posts', path: '/tenant/posts' },
		]);
		expect(getBreadcrumbsForPath('/tenant/posts/history')).toEqual([
			{ label: 'Lattice Cloud', path: '/tenant' },
			{ label: 'Posts', path: '/tenant/posts' },
			{ label: 'History', path: '/tenant/posts/history' },
		]);
	});
});
