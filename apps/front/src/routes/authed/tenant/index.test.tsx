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
	'tenant-workspace-home-title': 'Welcome to your workspace',
	'tenant-workspace-home-description':
		'Select a section from the navigation to get started.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './index';

const TenantWorkspaceHomeState = (
	Route as unknown as { component: ComponentType }
).component;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantWorkspaceHomeState', () => {
	test('renders the workspace home state', () => {
		render(<TenantWorkspaceHomeState />);

		expect(screen.getByTestId('tenant-workspace-home')).toBeTruthy();
		expect(screen.getByText('Welcome to your workspace')).toBeTruthy();
	});
});
