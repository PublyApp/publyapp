/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const previewQuery = vi.hoisted(() => ({
	value: {
		isPending: false,
		isError: false,
		data: { data: [] as Array<Record<string, unknown>> },
	},
}));

vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		let href = to;

		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}

		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

const LABELS: TestLabelMap = {
	'no-tenant-members': 'No members yet.',
	'tenant-users-preview-error': 'Unable to load members.',
	admin: 'Admin',
	'status-active': 'Active',
};

vi.mock('~/lib/query/staff-tenant-users', () => ({
	toStaffTenantUserRows: (
		rows: Array<Record<string, unknown>>,
	): Array<Record<string, unknown>> =>
		rows.map((row, index) => ({
			id: `row-${index}`,
			displayName: row.displayName,
			email: row.email,
			level: row.level,
			status: row.status,
			avatarUrl: row.avatarUrl ?? null,
		})),
	useStaffTenantUsersQuery: () => previewQuery.value,
}));

vi.mock('~/components/ui/person-avatar', () => ({
	PersonAvatar: () => <span data-testid="person-avatar" />,
}));

vi.mock('~/components/ui/product-page', () => ({
	StatusPill: ({ children }: { children: ReactNode }) => (
		<span>{children}</span>
	),
}));

vi.mock('~/components/ui/status-tone', () => ({
	statusPillTone: () => 'neutral',
}));

import { UsersPreviewCard } from './_tenant-users-preview-card';

const buildTenant = (): Parameters<typeof UsersPreviewCard>[0]['tenant'] => ({
	id: '33333333-3333-3333-3333-333333333333',
	name: 'Globex',
	usersCount: 2,
	maxUsers: 10,
	ownersCount: 1,
	pendingInvitationsCount: 0,
	expiringSoonInvitationsCount: 0,
	profilesCount: 1,
	code: null,
	logoUrl: null,
	legalName: null,
	description: null,
	websiteUrl: null,
	billingEmail: null,
	supportEmail: null,
	defaultLocale: null,
	timezone: null,
	notes: null,
	status: 'Active',
	createdAt: new Date('2026-01-15T09:00:00Z'),
	updatedAt: new Date('2026-02-20T10:00:00Z'),
	lastActivityAt: new Date('2026-03-01T08:00:00Z'),
});

describe('tenant users preview card (moved out of the $tenantId route file)', () => {
	afterEach(() => {
		cleanup();
	});

	test('renders member rows with level and status labels when data has landed', () => {
		previewQuery.value = {
			isPending: false,
			isError: false,
			data: {
				data: [
					{
						displayName: 'Ada Lovelace',
						email: 'ada@globex.test',
						level: 'admin',
						status: 'Active',
					},
				],
			},
		};
		render(
			<UsersPreviewCard
				tenant={buildTenant()}
				t={(key) => LABELS[key] ?? key}
			/>,
		);

		expect(screen.getByText('Ada Lovelace')).toBeTruthy();
		expect(screen.getByText('ada@globex.test')).toBeTruthy();
		expect(screen.getByText('Admin')).toBeTruthy();
		expect(screen.getByText('Active')).toBeTruthy();
	});

	test('renders the empty state instead of rows when no members exist', () => {
		previewQuery.value = {
			isPending: false,
			isError: false,
			data: { data: [] },
		};
		render(
			<UsersPreviewCard
				tenant={buildTenant()}
				t={(key) => LABELS[key] ?? key}
			/>,
		);

		expect(screen.getByText('No members yet.')).toBeTruthy();
		expect(screen.queryByText('Ada Lovelace')).toBeNull();
	});

	test('renders the error line instead of rows when the query failed', () => {
		previewQuery.value = {
			isPending: false,
			isError: true,
			data: { data: [] },
		};
		render(
			<UsersPreviewCard
				tenant={buildTenant()}
				t={(key) => LABELS[key] ?? key}
			/>,
		);

		expect(screen.getByText('Unable to load members.')).toBeTruthy();
	});
});
