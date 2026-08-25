/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	profileQuery: {
		data: undefined as unknown,
		isPending: false,
		isError: false,
		isSuccess: false,
		refetch: vi.fn(),
	},
	workspaceTenantId: 'tenant-1',
	mutation: {
		mutateAsync: vi.fn(),
		isPending: false,
	},
	invalidateAccountProfileQuery: vi.fn(),
	displayLocalMutationFailure: vi.fn(),
	toastLocalMutationResult: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
}));

vi.mock('~/lib/query/tenants-for-picker', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/query/tenants-for-picker')
	>('~/lib/query/tenants-for-picker');

	return {
		...actual,
		useResolvedWorkspaceTenantId: () => mocks.workspaceTenantId,
	};
});

vi.mock('~/lib/query/tenant-account-profile', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/query/tenant-account-profile')
	>('~/lib/query/tenant-account-profile');

	return {
		...actual,
		useAccountProfileQuery: () => mocks.profileQuery,
		useUpdateAccountProfileMutation: () => mocks.mutation,
		invalidateAccountProfileQuery: mocks.invalidateAccountProfileQuery,
	};
});

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: mocks.toastLocalMutationResult,
}));

const EN_LABELS: TestLabelMap = {
	profile: 'Profile',
	'personal-information': 'Personal information',
	preferences: 'Preferences',
	firstname: 'First name',
	'first-name': 'First name',
	lastname: 'Last name',
	'last-name': 'Last name',
	email: 'Email',
	'email-address': 'Email address',
	'avatar-url': 'Avatar URL',
	language: 'Language',
	'language-description': 'Preferred language for your account',
	timezone: 'Timezone',
	'timezone-description': 'Used for scheduling posts',
	'read-only': 'Read only',
	'not-available-yet': 'Not available yet',
	'un-named': 'Unnamed',
	'failed-to-load-profile': 'Failed to load profile',
	'failed-to-load-profile-description':
		'Your profile information could not be loaded. Try again.',
	retry: 'Retry',
	'save-changes': 'Save changes',
	'profile-updated-success': 'Profile updated successfully',
	'invalid-avatar-url': 'Enter a valid http(s) URL',
	'unknown-error': 'Unknown error',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key.replace(/^common:/, '')] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './profile';

const AccountProfilePage = Route.options.component as ComponentType;

const profileData = {
	id: 'user-1',
	email: 'jason@studio.io',
	firstName: 'Jason',
	lastName: 'Tatum',
	avatarUrl: null,
};

const renderPage = () => {
	const queryClient = new QueryClient();
	const view = render(
		<QueryClientProvider client={queryClient}>
			<AccountProfilePage />
		</QueryClientProvider>,
	);
	return { queryClient, view };
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('AccountProfilePage', () => {
	test('renders an editable form pre-filled from the tenant-scoped profile', () => {
		mocks.profileQuery = {
			data: profileData,
			isPending: false,
			isError: false,
			isSuccess: true,
			refetch: mocks.profileQuery.refetch,
		};
		renderPage();

		expect(screen.getByRole('heading', { name: 'Profile' })).toBeTruthy();
		expect(screen.getByText('Jason Tatum')).toBeTruthy();
		expect(
			(screen.getByLabelText('First name') as HTMLInputElement).value,
		).toBe('Jason');
		expect((screen.getByLabelText('Last name') as HTMLInputElement).value).toBe(
			'Tatum',
		);
		expect(
			(screen.getByLabelText('Avatar URL') as HTMLInputElement).value,
		).toBe('');
		expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
		// The editable identity card no longer carries the read-only badge;
		// the preferences card (no backend yet) still does.
		expect(screen.getAllByTestId('account-read-only-badge')).toHaveLength(1);
	});

	test('submits only the dirty fields through the tenant-scoped PATCH', async () => {
		mocks.profileQuery = {
			data: profileData,
			isPending: false,
			isError: false,
			isSuccess: true,
			refetch: mocks.profileQuery.refetch,
		};
		mocks.mutation.mutateAsync.mockResolvedValue({
			...profileData,
			firstName: 'Jay',
		});
		renderPage();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Jay' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => {
			expect(mocks.mutation.mutateAsync).toHaveBeenCalledTimes(1);
		});
		expect(mocks.mutation.mutateAsync).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			firstName: 'Jay',
		});
		expect(mocks.invalidateAccountProfileQuery).toHaveBeenCalledWith(
			expect.anything(),
			'tenant-1',
		);
		expect(mocks.toastLocalMutationResult.success).toHaveBeenCalledWith(
			'Profile updated successfully',
		);
	});

	test('clears a field by submitting null when the input is emptied', async () => {
		mocks.profileQuery = {
			data: { ...profileData, avatarUrl: 'https://cdn.example.test/a.png' },
			isPending: false,
			isError: false,
			isSuccess: true,
			refetch: mocks.profileQuery.refetch,
		};
		mocks.mutation.mutateAsync.mockResolvedValue({
			...profileData,
			avatarUrl: null,
		});
		renderPage();

		fireEvent.change(screen.getByLabelText('Avatar URL'), {
			target: { value: '' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => {
			expect(mocks.mutation.mutateAsync).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
				avatarUrl: null,
			});
		});
	});

	test('does not submit when nothing changed', async () => {
		mocks.profileQuery = {
			data: profileData,
			isPending: false,
			isError: false,
			isSuccess: true,
			refetch: mocks.profileQuery.refetch,
		};
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mocks.mutation.mutateAsync).not.toHaveBeenCalled();
	});

	test('shows a local failure message when the PATCH fails', async () => {
		mocks.profileQuery = {
			data: profileData,
			isPending: false,
			isError: false,
			isSuccess: true,
			refetch: mocks.profileQuery.refetch,
		};
		const failure = new Error('network down');
		mocks.mutation.mutateAsync.mockRejectedValue(failure);
		renderPage();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Jay' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => {
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
				failure,
				'Unknown error',
			);
		});
		expect(screen.getByRole('alert')).toBeTruthy();
		expect(mocks.invalidateAccountProfileQuery).not.toHaveBeenCalled();
	});

	test('blocks an invalid avatar URL client-side without calling the PATCH', async () => {
		mocks.profileQuery = {
			data: profileData,
			isPending: false,
			isError: false,
			isSuccess: true,
			refetch: mocks.profileQuery.refetch,
		};
		renderPage();

		fireEvent.change(screen.getByLabelText('Avatar URL'), {
			target: { value: 'not-a-url' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await screen.findByText('Enter a valid http(s) URL');
		expect(mocks.mutation.mutateAsync).not.toHaveBeenCalled();
	});

	test('falls back to skeletons while the profile query is pending', () => {
		mocks.profileQuery = {
			data: undefined,
			isPending: true,
			isError: false,
			isSuccess: false,
			refetch: mocks.profileQuery.refetch,
		};
		const { view } = renderPage();

		expect(
			view.container.querySelectorAll('[data-slot="skeleton"]').length,
		).toBeGreaterThan(0);
	});

	test('hydrates the form when the query resolves after mount', async () => {
		// Render while the query is still unresolved (disabled tenant / first
		// fetch): the page must not paint an empty "loaded" form yet.
		mocks.profileQuery = {
			data: undefined,
			isPending: true,
			isError: false,
			isSuccess: false,
			refetch: mocks.profileQuery.refetch,
		};
		const { queryClient, view } = renderPage();
		expect(screen.queryByLabelText('First name')).toBeNull();

		// The query resolves; the form must now hydrate from the loaded data
		// even though useForm captured its defaultValues at mount time.
		mocks.profileQuery = {
			data: profileData,
			isPending: false,
			isError: false,
			isSuccess: true,
			refetch: mocks.profileQuery.refetch,
		};
		view.rerender(
			<QueryClientProvider client={queryClient}>
				<AccountProfilePage />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(
				(screen.getByLabelText('First name') as HTMLInputElement).value,
			).toBe('Jason');
		});
		expect((screen.getByLabelText('Last name') as HTMLInputElement).value).toBe(
			'Tatum',
		);
		expect(
			(screen.getByLabelText('Avatar URL') as HTMLInputElement).value,
		).toBe('');
		expect(
			(screen.getByLabelText('Email address') as HTMLInputElement).value,
		).toBe('jason@studio.io');
	});

	test('shows an error state with a retry action when the profile query fails', () => {
		mocks.profileQuery = {
			data: undefined,
			isPending: false,
			isError: true,
			isSuccess: false,
			refetch: mocks.profileQuery.refetch,
		};
		renderPage();

		expect(screen.getByTestId('tenant-account-profile-error')).toBeTruthy();
		expect(screen.getByText('Failed to load profile')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(mocks.profileQuery.refetch).toHaveBeenCalledTimes(1);
	});

	test('keeps the read-only affordance only for fields with no backend', () => {
		mocks.profileQuery = {
			data: profileData,
			isPending: false,
			isError: false,
			isSuccess: true,
			refetch: mocks.profileQuery.refetch,
		};
		renderPage();

		// Timezone still has no API.
		expect(screen.getByText('Not available yet')).toBeTruthy();
		expect(screen.getByText('English')).toBeTruthy();
	});
});
