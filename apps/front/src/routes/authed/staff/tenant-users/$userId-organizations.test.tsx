/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	locale: 'en',
	formatTenantStatusLabel: vi.fn(
		(status: string | null, t: (key: string) => string) =>
			status ? t(`status-${status.toLowerCase()}`) : t('status-unknown'),
	),
}));

const labelMap: Record<string, Record<string, string>> = {
	en: {
		name: 'Name',
		level: 'Level',
		status: 'Status',
		admin: 'Admin',
		user: 'User',
		unknown: 'Unknown',
		'status-active': 'Active',
		'status-suspended': 'Suspended',
		'status-globallysuspended': 'Globally suspended',
		'status-unknown': 'Unknown',
	},
	fr: {
		'status-active': 'Actif',
		'status-suspended': 'Suspendu',
	},
};

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({}),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useParams: () => ({ userId: 'user-1' }),
		useSearch: () => ({}),
		useNavigate: () => () => ({}),
	}),
}));

vi.mock('~/components/table/data-table', () => ({
	DataTable: () => document.createElement('div'),
}));

vi.mock('../tenants/$tenantId/_tenant-display', () => ({
	formatTenantStatusLabel: mocks.formatTenantStatusLabel,
}));

import { buildOrganizationColumns as buildOrganizationColumnsForTests } from './_organizations-columns';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	mocks.locale = 'en';
});

describe('tenant-user companies columns', () => {
	test('declares the expected column ids and fixed widths', () => {
		const columns = buildOrganizationColumnsForTests(
			(key) => key,
			'en',
			'user-1',
		);

		const widthById = Object.fromEntries(
			columns.map((column) => [
				column.id,
				(column.meta as { width?: string } | undefined)?.width,
			]),
		);

		expect(Object.keys(widthById)).toEqual([
			'name',
			'level',
			'status',
			'member-since',
			'actions',
		]);
		expect(widthById['name']).toBe('260px');
		expect(widthById['actions']).toBe('40px');
	});

	test('renders the name cell with a truncated label', () => {
		const columns = buildOrganizationColumnsForTests(
			(key) => labelMap.en[key] ?? key,
			'en',
			'user-1',
		);
		const nameCell = columns.find((column) => column.id === 'name');
		const row = {
			original: {
				id: 'tenant-1',
				name: 'Acme Corp',
				logoUrl: null,
				level: null,
				status: null,
				createdAt: null,
				updatedAt: null,
			},
		};
		const cellRenderer = nameCell?.cell as (props: {
			row: typeof row;
		}) => ReactNode;

		render(<>{cellRenderer({ row })}</>);

		expect(screen.getByText('Acme Corp')).toBeTruthy();
	});

	test.each([
		['en', 'Active', 'status-active'],
		['en', 'Suspended', 'status-suspended'],
		['fr', 'Active', 'status-active'],
	])(
		'localizes the status cell through formatTenantStatusLabel (%s %s)',
		(locale, status, key) => {
			const columns = buildOrganizationColumnsForTests(
				(k) => labelMap[locale]?.[k] ?? k,
				locale,
				'user-1',
			);
			const statusCell = columns.find((column) => column.id === 'status');
			const cellRenderer = statusCell?.cell as (props: {
				getValue: () => string | null;
			}) => ReactNode;

			render(<>{cellRenderer({ getValue: () => status })}</>);

			expect(mocks.formatTenantStatusLabel).toHaveBeenCalledWith(
				status,
				expect.any(Function),
			);
			expect(screen.getByText(labelMap[locale]?.[key] ?? key)).toBeTruthy();
		},
	);

	test('coerces a missing status to the empty string before formatting', () => {
		const columns = buildOrganizationColumnsForTests(
			(key) => key,
			'en',
			'user-1',
		);
		const statusCell = columns.find((column) => column.id === 'status');
		const cellRenderer = statusCell?.cell as (props: {
			getValue: () => string | null;
		}) => ReactNode;

		render(<>{cellRenderer({ getValue: () => null })}</>);

		expect(mocks.formatTenantStatusLabel).toHaveBeenCalledWith(
			'',
			expect.any(Function),
		);
	});
});
