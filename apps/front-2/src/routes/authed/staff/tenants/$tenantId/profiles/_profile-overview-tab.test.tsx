/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type {
	StaffTenantPermissionGroup,
	StaffTenantProfileDetails,
} from '~/lib/query/staff-tenant-profiles';

vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		to,
		params,
		search,
		...props
	}: {
		children: React.ReactNode;
		to: string;
		params?: Record<string, string>;
		search?: unknown;
	}) => {
		let href = to;
		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}
		const resolvedSearch =
			typeof search === 'function'
				? (search as (previous: Record<string, unknown>) => unknown)({})
				: search;
		return (
			<a
				href={href}
				data-search={
					resolvedSearch === undefined
						? undefined
						: JSON.stringify(resolvedSearch)
				}
				{...props}
			>
				{children}
			</a>
		);
	},
}));

vi.mock('../_tenant-details-shell', () => ({
	formatMonthYear: (value: Date | null | undefined, locale: string) =>
		value instanceof Date
			? value.toLocaleString(locale, { month: 'short', year: 'numeric' })
			: '—',
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const labels: Record<string, string> = {
				members: 'Members',
				permissions: 'Permissions',
				modules: 'Modules',
				type: 'Type',
				granted: 'Granted',
				'with-access': 'with access',
				'view-members': 'View members',
				'view-all-count': 'View all {{total}}',
				'about-this-profile': 'About this profile',
				'permissions-at-a-glance': 'Permissions at a glance',
				'profile-glance-summary':
					'{{granted}} of {{total}} granted across {{modules}} modules',
				'profile-glance-no-access': 'No access to {{modules}}',
				'profile-created-month': 'Created {{date}}',
				'system-profile': 'System profile',
				'custom-profile': 'Custom profile',
				manage: 'Manage',
				'danger-zone': 'Danger zone',
				'delete-profile': 'Delete profile',
				'default-profile-delete-disabled': "Default profiles can't be deleted.",
				'confirm-delete-tenant-profile-description':
					'This will permanently delete this tenant profile.',
				'loading-available-permissions': 'Loading available permissions…',
				'tenant-permission-catalog-load-failed':
					'Unable to load the tenant permission catalog.',
				'no-permissions-available': 'No permission keys are available.',
				'no-members-yet': 'No members yet.',
				'profile-members-preview-coming-soon':
					'Member details are coming soon.',
			};
			let text = labels[key] ?? key;
			if (options) {
				for (const [optionKey, value] of Object.entries(options)) {
					text = text.replaceAll(`{{${optionKey}}}`, String(value));
				}
			}
			return text;
		},
		i18n: { language: 'en' },
	}),
}));

import { ProfileOverviewTab } from './_profile-overview-tab';

const buildGroup = (
	moduleKey: string,
	moduleLabel: string,
	options: Array<{ key: string; name: string }>,
): StaffTenantPermissionGroup => ({
	moduleKey,
	moduleLabel,
	options: options.map((option) => ({
		key: option.key,
		label: option.name,
		description: null,
	})),
});

const catalog: StaffTenantPermissionGroup[] = [
	buildGroup('users', 'Users', [
		{ key: 'tenant.users.read', name: 'Read users' },
		{ key: 'tenant.users.write', name: 'Write users' },
	]),
	buildGroup('billing', 'Billing', [
		{ key: 'tenant.billing.view', name: 'View billing' },
	]),
];

const baseProfile: StaffTenantProfileDetails = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Approvers',
	description: 'Reviews approvals',
	isDefault: false,
	userAccountCount: 4,
	createdAt: new Date('2026-05-10T09:00:00Z'),
	updatedAt: new Date('2026-07-14T10:00:00Z'),
};

const renderTab = (
	overrides: Partial<Parameters<typeof ProfileOverviewTab>[0]> = {},
) =>
	render(
		<ProfileOverviewTab
			tenantId="11111111-1111-1111-1111-111111111111"
			profile={baseProfile}
			permissionKeys={['tenant.users.read']}
			permissionGroups={catalog}
			isCatalogPending={false}
			isCatalogError={false}
			locale="en"
			onDeleteRequest={vi.fn()}
			isDeletePending={false}
			{...overrides}
		/>,
	);

describe('ProfileOverviewTab', () => {
	afterEach(() => {
		cleanup();
	});

	test('renders the four stat cards with computed K/T and M/MT values', () => {
		renderTab();

		expect(screen.getByTestId('profile-stat-members').textContent).toContain(
			'4',
		);
		const permissions = screen.getByTestId('profile-stat-permissions');
		expect(permissions.textContent).toContain('1');
		expect(permissions.textContent).toContain('/ 3');
		const modules = screen.getByTestId('profile-stat-modules');
		expect(modules.textContent).toContain('1');
		expect(modules.textContent).toContain('/ 2');
		expect(modules.textContent).toContain('with access');
		const type = screen.getByTestId('profile-stat-type');
		expect(type.textContent).toContain('Custom profile');
		// Created month comes from the new createdAt timestamp.
		expect(type.textContent).toContain('Created');
		expect(type.textContent).toContain('2026');
	});

	test('renders a System profile pill for default profiles', () => {
		renderTab({ profile: { ...baseProfile, isDefault: true } });

		expect(screen.getByTestId('profile-stat-type').textContent).toContain(
			'System profile',
		);
	});

	test('renders the About card with the description, omitting it when null', () => {
		const withDescription = renderTab();
		expect(screen.getByText('About this profile')).toBeTruthy();
		expect(screen.getByText('Reviews approvals')).toBeTruthy();
		withDescription.unmount();

		renderTab({ profile: { ...baseProfile, description: null } });
		expect(screen.queryByText('About this profile')).toBeNull();
	});

	test('renders the glance summary, granted names, and zero-access footer', () => {
		renderTab();

		expect(screen.getByText('1 of 3 granted across 1 modules')).toBeTruthy();
		expect(screen.getByText('Read users')).toBeTruthy();
		expect(screen.getByText('Write users')).toBeTruthy();
		// Billing has no granted key → it appears in the no-access footer.
		expect(screen.getByText('No access to Billing')).toBeTruthy();
	});

	test('omits the no-access footer when every module has a grant', () => {
		renderTab({
			permissionKeys: ['tenant.users.read', 'tenant.billing.view'],
		});

		expect(screen.queryByText(/No access to/)).toBeNull();
	});

	test('links "Manage" to the permissions tab and "View all" to members', () => {
		renderTab();

		const manageLink = screen.getByRole('link', { name: /Manage/ });
		expect(manageLink.getAttribute('data-search')).toContain('"permissions"');

		const viewAll = screen.getByRole('link', { name: 'View all 4' });
		expect(viewAll.getAttribute('data-search')).toContain('"members"');
	});

	test('shows the honest members-preview fallback with a real count', () => {
		renderTab();

		expect(screen.getByRole('link', { name: 'View all 4' })).toBeTruthy();
		expect(screen.getByText('Member details are coming soon.')).toBeTruthy();
	});

	test('shows the empty members state when the profile has no members', () => {
		renderTab({ profile: { ...baseProfile, userAccountCount: 0 } });

		expect(screen.queryByRole('link', { name: /View all/ })).toBeNull();
		expect(screen.getByText('No members yet.')).toBeTruthy();
	});

	test('shows a delete action in the danger zone for non-default profiles', () => {
		const onDeleteRequest = vi.fn();
		renderTab({ onDeleteRequest });

		const deleteButton = screen.getByRole('button', { name: 'Delete profile' });
		fireEvent.click(deleteButton);
		expect(onDeleteRequest).toHaveBeenCalledTimes(1);
	});

	test('hides the delete action for default profiles', () => {
		renderTab({ profile: { ...baseProfile, isDefault: true } });

		expect(screen.queryByRole('button', { name: 'Delete profile' })).toBeNull();
		expect(screen.getByText("Default profiles can't be deleted.")).toBeTruthy();
	});

	test('shows a loading state while the catalog is pending', () => {
		renderTab({ isCatalogPending: true, permissionGroups: [] });

		expect(screen.getByText('Loading available permissions…')).toBeTruthy();
	});

	test('shows an error state when the catalog fails to load', () => {
		renderTab({ isCatalogError: true, permissionGroups: [] });

		expect(
			screen.getByText('Unable to load the tenant permission catalog.'),
		).toBeTruthy();
	});
});
