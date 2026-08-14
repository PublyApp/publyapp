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
	settings: 'Settings',
	'stub-settings-description':
		'Organization-level settings — members, roles, billing, and integrations — are coming soon.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './settings';

const TenantSettingsStubPage = (
	Route as unknown as { component: ComponentType }
).component;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantSettingsStubPage', () => {
	test('renders the honest stub state', () => {
		render(<TenantSettingsStubPage />);

		expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
		expect(screen.getByTestId('tenant-settings-stub')).toBeTruthy();
	});
});
