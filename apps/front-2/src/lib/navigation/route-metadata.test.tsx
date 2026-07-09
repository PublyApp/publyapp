import { describe, expect, test } from 'vitest';

import {
	getActiveRailItem,
	getBreadcrumbsForPath,
	getBottomRailItemForPath,
	getRailItems,
	getRailItemsForPath,
	getSecondaryPanelItems,
	getShellDisplayMode,
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

	test('staff dashboard panel has no secondary destinations', () => {
		expect(getSecondaryPanelItems('/staff/dashboard')).toEqual([]);
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
		expect(getShellDisplayMode('/tenant/posts/history')).toBe('default');
		expect(
			shouldShowSecondaryPanel('/tenant/posts/history', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(true);
		expect(getShellDisplayMode('/staff/audit-logs/sign-ins')).toBe('default');
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

	test('secondary panel is hidden on modules with fewer than two destinations', () => {
		expect(
			shouldShowSecondaryPanel('/staff/dashboard', {
				sidebarOpen: true,
				viewportWidth: 1280,
			}),
		).toBe(false);
	});

	test('secondary panel is hidden on detail routes', () => {
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

	test('detail-route exception list stays in default shell mode', () => {
		expect(getShellDisplayMode('/staff/tenants/new')).toBe('default');
		expect(getShellDisplayMode('/staff/profiles/new')).toBe('default');
		expect(getShellDisplayMode('/staff/invitations/new')).toBe('default');
	});

	test('active route detection should not prefix-match false positives', () => {
		expect(getActiveRailItem('/staff/staff-usersXYZ')).toBeUndefined();
		expect(getActiveRailItem('/tenant/postsXYZ')).toBeUndefined();
	});

	test('detail routes collapse secondary panel for staff list forms', () => {
		expect(getShellDisplayMode('/staff/staff-users/u-1')).toBe('full-detail');
		expect(getShellDisplayMode('/staff/invitations/i-1')).toBe('full-detail');
		expect(getShellDisplayMode('/staff/profiles/p-1')).toBe('full-detail');
		expect(getShellDisplayMode('/staff/tenants/t-1')).toBe('full-detail');
		expect(getShellDisplayMode('/staff/tenants/t-1/edit')).toBe('full-detail');
		expect(getShellDisplayMode('/staff/tenants/t-1/users/invite')).toBe(
			'full-detail',
		);
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
