/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement, type JSX } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	locale: 'en',
	statusPillTone: vi.fn((value: string | null) =>
		value === 'active' ? 'success' : 'warning',
	),
}));

const labelMap: Record<string, Record<string, string>> = {
	en: {
		'status-active': 'Active',
		'status-suspended': 'Suspended',
		'status-unknown': 'Unknown',
	},
	fr: {
		'status-active': 'Actif',
		'status-suspended': 'Suspendu',
		'status-unknown': 'Inconnu',
	},
};

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: unknown) => options,
	Link: ({
		children,
		href,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		href?: string;
		to?: string;
		params?: Record<string, string>;
		target?: string;
	}) => {
		let targetHref = href ?? to ?? '';
		if (params && targetHref) {
			for (const [key, value] of Object.entries(params)) {
				targetHref = targetHref.replace(`$${key}`, value);
			}
		}

		return createElement('a', { href: targetHref, ...props }, children);
	},
}));

vi.mock('~/components/ui/product-page', () => ({
	StatusPill: ({ children }: { children: ReactNode }) =>
		createElement('span', { 'data-testid': 'status-pill' }, children),
}));

vi.mock('~/components/ui/status-tone', () => ({
	statusPillTone: mocks.statusPillTone,
}));

vi.mock('../../staff-users/status-labels', () => ({
	formatStaffStatusLabel: (
		status: string | null,
		t: (key: string) => string,
	) => {
		let key = 'status-unknown';
		if (status === 'active') {
			key = 'status-active';
		} else if (status === 'suspended') {
			key = 'status-suspended';
		}

		return t(key);
	},
}));

vi.mock('~/components/ui/initials-avatar', () => ({
	InitialsAvatar: ({ name }: { name: string }) =>
		createElement('span', { 'data-testid': 'initials', children: name }),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => labelMap[mocks.locale]?.[key] ?? key,
	}),
}));

vi.mock('~/lib/query/staff-profile-users', () => ({
	toStaffProfileUserRows: (rows: unknown[] | null | undefined) => rows ?? [],
}));

import { buildColumns } from './users';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('staff profile users columns', () => {
	test('applies a fixed width to every column except the fluid name column', () => {
		const columns = buildColumns((key: string) => key);
		const widthById = Object.fromEntries(
			columns.map((column) => [column.id, column.meta?.width]),
		);

		expect(widthById).toEqual({
			name: undefined,
			status: '122px',
		});
	});

	test('renders the first column as a link to staff user detail', () => {
		const columns = buildColumns((key: string) =>
			key === 'status-active' ? 'Active' : key,
		);
		const nameCell = columns.find((column) => column.id === 'name');
		const row = {
			original: {
				id: '333',
				firstName: 'Ada',
				lastName: 'Lovelace',
				email: 'ada@example.com',
				avatarUrl: null,
				status: 'active',
			},
		};
		const cellRenderer = nameCell?.cell as (props: {
			row: typeof row;
		}) => JSX.Element;

		render(<>{cellRenderer({ row })}</>);

		const userLink = screen.getByRole('link', {
			name: /Ada Lovelace/,
		}) as HTMLAnchorElement;
		expect(userLink.getAttribute('href')).toBe('/staff/staff-users/333');
		expect(userLink.className.includes('publy-record-link')).toBe(true);
	});

	test.each([
		['en', 'active', 'Active'],
		['en', 'suspended', 'Suspended'],
		['en', null, 'Unknown'],
		['fr', 'active', 'Actif'],
		['fr', 'suspended', 'Suspendu'],
		['fr', null, 'Inconnu'],
	])(
		'renders %s status %s as %s in a status pill and applies tone',
		(locale, status, expectedLabel) => {
			mocks.locale = locale;

			const columns = buildColumns(
				(key: string) => labelMap[locale]?.[key] ?? key,
			);
			const statusCell = columns.find((column) => column.id === 'status');
			const renderCell = statusCell?.cell as (props: {
				getValue: () => string | null;
			}) => JSX.Element;

			render(<>{renderCell({ getValue: () => status })}</>);

			expect(screen.getByTestId('status-pill').textContent).toBe(expectedLabel);
			expect(mocks.statusPillTone).toHaveBeenCalledWith(status);
		},
	);
});

describe('staff profile users columns — locale fallbacks', () => {
	test('uses status-unknown when the backend status is missing', () => {
		const columns = buildColumns((key: string) => key);
		const statusCell = columns.find((column) => column.id === 'status');
		const renderCell = statusCell?.cell as (props: {
			getValue: () => string | null;
		}) => JSX.Element;

		render(<>{renderCell({ getValue: () => 'mystery' })}</>);

		expect(screen.getByTestId('status-pill').textContent).toBe(
			'status-unknown',
		);
	});
});
