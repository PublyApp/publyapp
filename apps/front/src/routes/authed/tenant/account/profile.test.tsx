/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { CurrentUser } from '~/lib/query/auth';

const mocks = vi.hoisted(() => ({
	currentUserQuery: {
		data: undefined as unknown,
		isLoading: false,
		isError: false,
	},
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
}));

vi.mock('~/lib/query/auth', async () => {
	const actual =
		await vi.importActual<typeof import('~/lib/query/auth')>(
			'~/lib/query/auth',
		);

	return {
		...actual,
		useCurrentUserQuery: () => mocks.currentUserQuery,
	};
});

const EN_LABELS: Record<string, string> = {
	profile: 'Profile',
	'personal-information': 'Personal information',
	preferences: 'Preferences',
	firstname: 'First name',
	lastname: 'Last name',
	email: 'Email',
	bio: 'Bio',
	'bio-description': 'Brief description for your profile',
	language: 'Language',
	'language-description': 'Preferred language for your account',
	timezone: 'Timezone',
	'timezone-description': 'Used for scheduling posts',
	'read-only': 'Read only',
	'not-available-yet': 'Not available yet',
	'un-named': 'Unnamed',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './profile';

const AccountProfilePage = (Route as unknown as { component: ComponentType })
	.component;

const currentUser: CurrentUser = {
	id: 'user-1',
	email: 'jason@studio.io',
	firstName: 'Jason',
	lastName: 'Tatum',
	avatarUrl: null,
	displayName: 'Jason Tatum',
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('AccountProfilePage', () => {
	test('renders the read-only profile surface with the real signed-in identity', () => {
		mocks.currentUserQuery = {
			data: currentUser,
			isLoading: false,
			isError: false,
		};
		render(<AccountProfilePage />);

		expect(screen.getByRole('heading', { name: 'Profile' })).toBeTruthy();
		expect(screen.getAllByTestId('account-read-only-badge')).toHaveLength(2);
		expect(screen.getByText('Jason Tatum')).toBeTruthy();
		// The email appears in the identity block and in the email field row.
		expect(screen.getAllByText('jason@studio.io').length).toBeGreaterThan(0);
		expect(screen.getByText('Jason')).toBeTruthy();
		expect(screen.getByText('Tatum')).toBeTruthy();
	});

	test('renders a muted placeholder for fields with no API yet', () => {
		mocks.currentUserQuery = {
			data: currentUser,
			isLoading: false,
			isError: false,
		};
		render(<AccountProfilePage />);

		// Bio and timezone both have no API yet.
		expect(screen.getAllByText('Not available yet')).toHaveLength(2);
	});

	test('shows the current language and leaves timezone unavailable', () => {
		mocks.currentUserQuery = {
			data: currentUser,
			isLoading: false,
			isError: false,
		};
		render(<AccountProfilePage />);

		expect(screen.getByText('English')).toBeTruthy();
	});

	test('never renders a save or update mutation control', () => {
		mocks.currentUserQuery = {
			data: currentUser,
			isLoading: false,
			isError: false,
		};
		render(<AccountProfilePage />);

		expect(screen.queryAllByRole('button')).toHaveLength(0);
	});

	test('falls back to skeletons while the identity query is loading', () => {
		mocks.currentUserQuery = {
			data: undefined,
			isLoading: true,
			isError: false,
		};
		const { container } = render(<AccountProfilePage />);

		expect(
			container.querySelectorAll('[data-slot="skeleton"]').length,
		).toBeGreaterThan(0);
	});
});
