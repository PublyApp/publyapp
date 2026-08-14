/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
}));

const EN_LABELS: Record<string, string> = {
	organizations: 'Organizations',
	'stub-organizations-description':
		'Managing the organizations in this workspace is coming soon.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './organizations';

const TenantOrganizationsStubPage = (
	Route as unknown as { component: ComponentType }
).component;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantOrganizationsStubPage', () => {
	test('renders the honest stub state', () => {
		render(<TenantOrganizationsStubPage />);

		expect(screen.getByRole('heading', { name: 'Organizations' })).toBeTruthy();
		expect(screen.getByTestId('tenant-organizations-stub')).toBeTruthy();
	});
});
