/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

const LABELS: TestLabelMap = {
	organization: 'Organization',
	edit: 'Edit',
	name: 'Name',
	'legal-name': 'Legal name',
	code: 'Code',
	'tenant-id': 'Tenant ID',
	status: 'Status',
	active: 'Active',
	created: 'Created',
	updated: 'Updated',
	'last-active': 'Last active',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const resolvedKey = key.replace(/^common:/, '');
			if (resolvedKey === 'never-active') {
				return 'Never active';
			}
			void options;
			return LABELS[resolvedKey] ?? resolvedKey;
		},
	}),
}));

import { OrganizationCard } from './_tenant-org-card';

const buildTenant = (
	overrides: Partial<Parameters<typeof OrganizationCard>[0]['tenant']> = {},
): Parameters<typeof OrganizationCard>[0]['tenant'] => ({
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Acme Corporation',
	usersCount: 3,
	maxUsers: 10,
	ownersCount: 1,
	pendingInvitationsCount: 2,
	expiringSoonInvitationsCount: 0,
	profilesCount: 4,
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
	...overrides,
});

describe('tenant organization card (moved out of the $tenantId route file)', () => {
	afterEach(() => {
		cleanup();
	});

	test('renders every metadata field with copy affordances for id and slug', () => {
		render(
			<OrganizationCard
				tenant={buildTenant({
					legalName: 'Acme Legal Name',
					code: 'acme-corp',
					websiteUrl: 'https://www.acme.test/about',
				})}
				locale="en"
				t={(key) => LABELS[key] ?? key}
			/>,
		);

		expect(screen.getByText('Acme Corporation')).toBeTruthy();
		expect(screen.getByText('Acme Legal Name')).toBeTruthy();
		expect(screen.getByText('acme-corp')).toBeTruthy();
		expect(screen.getByTestId('tenant-id-copy')).toBeTruthy();
		expect(screen.getByTestId('tenant-code-copy')).toBeTruthy();
	});

	test('shows em-dash placeholders for missing optional fields and omits the website row', () => {
		render(
			<OrganizationCard
				tenant={buildTenant({ legalName: null, code: null, websiteUrl: null })}
				locale="en"
				t={(key) => LABELS[key] ?? key}
			/>,
		);

		expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
		expect(screen.queryByText('www.acme.test')).toBeNull();
	});
});
