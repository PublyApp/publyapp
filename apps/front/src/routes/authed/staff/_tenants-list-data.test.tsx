/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import type { StaffTenantRow } from '~/lib/query/staff-tenants';

import { tenantColumns } from './_tenants-list-columns';
import {
	buildTenantFilters,
	buildTenantMobileCard,
} from './_tenants-list-config';
import { TenantStatCards } from './_tenants-list-stat-cards';

const t = (key: string): string => key;

const tenantRow: StaffTenantRow = {
	id: 'tenant-1',
	name: 'Acme Corporation',
	code: 'acme-corp',
	defaultLocale: 'fr',
	logoUrl: null,
	status: null,
	usersCount: 4,
	projectsCount: 2,
	maxUsers: 10,
	lastActivityAt: null,
};

const columnById = (id: string) =>
	tenantColumns(t, 'fr').find((column) => column.id === id);

afterEach(() => {
	cleanup();
});

describe('tenants list — « Identifiant » and « Langues »', () => {
	test('renders the slug in the Identifiant column, in a mono font', () => {
		const cell = columnById('code')?.cell?.(tenantRow);
		render(<>{cell}</>);

		const slug = screen.getByText('acme-corp');
		expect(slug.className).toContain('font-mono');
	});

	test('keeps « — » for an organisation without a slug', () => {
		const cell = columnById('code')?.cell?.({ ...tenantRow, code: null });
		render(<>{cell}</>);

		expect(screen.getByText('—')).toBeTruthy();
	});

	test('offers the Langues panel filter from the row default language', () => {
		const locale = buildTenantFilters(t).find(
			(filter) => filter.key === 'locale',
		);

		expect(locale?.panel).toBe(true);
		expect(locale?.choices.map((choice) => choice.value)).toEqual(['fr', 'en']);
		expect(locale?.valueOf(tenantRow)).toBe('fr');
		expect(locale?.valueOf({ ...tenantRow, defaultLocale: null })).toEqual([]);
	});

	test('shows the slug on the mobile card', () => {
		render(<>{buildTenantMobileCard(t, 'fr')(tenantRow).code}</>);

		expect(screen.getByText('acme-corp')).toBeTruthy();
	});
});

describe('tenants StatCards — « Invitations en attente »', () => {
	test('renders the pending invitation total, organisations and expiry', () => {
		render(
			<TenantStatCards
				t={t}
				counts={{
					total: 3,
					active: 3,
					pending: 0,
					suspended: 0,
					members: 12,
					seats: 15,
					projects: 2,
					almostFull: 1,
					full: 1,
					activeThisWeek: 2,
					pendingInvitations: 7,
					pendingInvitationTenants: 4,
					expiringInvitations: 2,
					byLocale: [],
				}}
			/>,
		);

		const card = screen.getByTestId('tenant-stat-pending-invitations');
		// `t` is key-only here, so the figure is the only interpolated number.
		expect(card.textContent).toContain('7');
		expect(card.textContent).toContain('list-stat-pending-invitations-tenants');
		expect(card.textContent).toContain(
			'list-stat-pending-invitations-expiring',
		);
	});
});
