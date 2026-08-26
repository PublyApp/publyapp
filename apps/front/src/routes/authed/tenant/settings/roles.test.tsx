/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
}));

const EN_LABELS: TestLabelMap = {
	'roles-and-permissions': 'Roles & permissions',
	'common:roles': 'Roles',
	'common:permissions': 'Permissions',
	'roles-coming-later-title': 'Roles are coming later',
	'roles-coming-later-description':
		'Custom roles and their permissions will appear here once the roles API ships.',
	'permissions-coming-later-title': 'The permission matrix is coming later',
	'permissions-coming-later-description':
		'The permission matrix editor will appear here once the roles API ships.',
	'read-only': 'Read only',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './roles';

const TenantSettingsRolesPage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantSettingsRolesPage', () => {
	test('renders the two read-only roles cards', () => {
		render(<TenantSettingsRolesPage />);

		expect(
			screen.getByRole('heading', { name: 'Roles & permissions' }),
		).toBeTruthy();
		expect(screen.getByText('Roles')).toBeTruthy();
		expect(screen.getByText('Permissions')).toBeTruthy();
		expect(screen.getAllByTestId('account-read-only-badge').length).toBe(2);
	});

	test('shows an honest coming-later empty state per card', () => {
		render(<TenantSettingsRolesPage />);

		expect(screen.getByTestId('tenant-settings-roles-empty')).toBeTruthy();
		expect(
			screen.getByTestId('tenant-settings-permissions-empty'),
		).toBeTruthy();
		expect(screen.getByText('Roles are coming later')).toBeTruthy();
		expect(
			screen.getByText('The permission matrix is coming later'),
		).toBeTruthy();
	});

	test('renders no mock role rows or pretend-to-work role controls', () => {
		render(<TenantSettingsRolesPage />);

		// No fake Owner/Admin/Editor/Viewer rows, no disabled create-role
		// button, no search box that pretends to filter.
		expect(screen.queryByText(/Viewer|Owner/i)).toBeNull();
		expect(screen.queryAllByRole('button').length).toBe(0);
		expect(screen.queryAllByRole('textbox').length).toBe(0);
	});
});
