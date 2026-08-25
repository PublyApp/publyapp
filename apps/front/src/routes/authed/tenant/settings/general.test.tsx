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
	settingsQuery: {
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
	invalidateTenantSettingsGeneralQuery: vi.fn(),
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

vi.mock('~/lib/query/tenant-settings-general', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/query/tenant-settings-general')
	>('~/lib/query/tenant-settings-general');

	return {
		...actual,
		useTenantSettingsGeneralQuery: () => mocks.settingsQuery,
		useUpdateTenantSettingsGeneralMutation: () => mocks.mutation,
		invalidateTenantSettingsGeneralQuery:
			mocks.invalidateTenantSettingsGeneralQuery,
	};
});

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: mocks.toastLocalMutationResult,
}));

const EN_LABELS: TestLabelMap = {
	general: 'General',
	'organization-details': 'Organization details',
	logo: 'Logo',
	'logo-description': '150x150px JPEG, PNG image',
	name: 'Name',
	'legal-name': 'Legal name',
	website: 'Website',
	description: 'Description',
	'save-changes': 'Save changes',
	'not-set': 'Not set',
	'default-locale': 'Default locale',
	timezone: 'Timezone',
	'billing-email': 'Billing email',
	'support-email': 'Support email',
	'danger-zone': 'Danger zone',
	retry: 'Retry',
	'danger-zone-coming-later-title': 'Organization deletion is coming later',
	'danger-zone-coming-later-description':
		'Deleting this organization will be possible here once the settings API ships.',
	'regional-and-contact-settings': 'Regional & contact',
	'failed-to-load-settings': 'Failed to load settings',
	'failed-to-load-settings-description':
		'Your workspace settings could not be loaded. Try again.',
	'settings-updated-success': 'General settings updated successfully',
	'unknown-error': 'Unknown error',
	'name-min-length': 'Name must be at least 5 characters',
	'name-max-length': 'Name must be 256 characters or less',
	'logo-url-max-length': 'Logo URL must be 2048 characters or less',
	'legal-name-max-length': 'Legal name must be 256 characters or less',
	'description-max-length': 'Description must be 1024 characters or less',
	'website-max-length': 'Website must be 2048 characters or less',
	'email-max-length': 'Email must be 320 characters or less',
	'invalid-logo-url': 'Enter a valid http(s) URL or /files/ upload path',
	'invalid-website-url': 'Enter a valid http(s) URL',
	'invalid-email': 'Enter a valid email address',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) =>
			EN_LABELS[key.replace(/^(common|settings):/, '')] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './general';

const TenantSettingsGeneralPage = Route.options.component as ComponentType;

const settingsData = {
	id: 'tenant-1',
	code: 'acme-corp',
	name: 'Acme Corporation',
	logoUrl: 'https://cdn.example.test/logo.png',
	legalName: 'Acme Corporation SA',
	description: 'The Acme description',
	websiteUrl: 'https://acme.example.com',
	billingEmail: 'billing@acme.example.com',
	supportEmail: 'support@acme.example.com',
	defaultLocale: 'en',
	timezone: 'Europe/Paris',
};

const renderPage = () => {
	const queryClient = new QueryClient();
	const view = render(
		<QueryClientProvider client={queryClient}>
			<TenantSettingsGeneralPage />
		</QueryClientProvider>,
	);
	return { queryClient, view };
};

const markQueryLoaded = () => {
	mocks.settingsQuery = {
		data: settingsData,
		isPending: false,
		isError: false,
		isSuccess: true,
		refetch: mocks.settingsQuery.refetch,
	};
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantSettingsGeneralPage', () => {
	test('renders an editable form pre-filled from the tenant-scoped settings', () => {
		markQueryLoaded();
		renderPage();

		expect(screen.getByRole('heading', { name: 'General' })).toBeTruthy();
		expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(
			'Acme Corporation',
		);
		expect(
			(screen.getByLabelText('Legal name') as HTMLInputElement).value,
		).toBe('Acme Corporation SA');
		expect((screen.getByLabelText('Website') as HTMLInputElement).value).toBe(
			'https://acme.example.com',
		);
		expect((screen.getByLabelText('Logo') as HTMLInputElement).value).toBe(
			'https://cdn.example.test/logo.png',
		);
		expect(
			(screen.getByLabelText('Billing email') as HTMLInputElement).value,
		).toBe('billing@acme.example.com');
		expect(
			(screen.getByLabelText('Support email') as HTMLInputElement).value,
		).toBe('support@acme.example.com');
		expect(screen.getAllByRole('button', { name: 'Save changes' }).length).toBe(
			2,
		);
		// The danger zone card still has no backend and keeps the read-only
		// badge; the two editable cards no longer carry it.
		expect(screen.getAllByTestId('account-read-only-badge')).toHaveLength(1);
	});

	test('submits only the dirty fields through the tenant-scoped PATCH', async () => {
		markQueryLoaded();
		mocks.mutation.mutateAsync.mockResolvedValue({
			...settingsData,
			name: 'Acme Corporation Updated',
		});
		renderPage();

		fireEvent.change(screen.getByLabelText('Name'), {
			target: { value: 'Acme Corporation Updated' },
		});
		fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]);

		await waitFor(() => {
			expect(mocks.mutation.mutateAsync).toHaveBeenCalledTimes(1);
		});
		expect(mocks.mutation.mutateAsync).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			name: 'Acme Corporation Updated',
		});
		expect(mocks.invalidateTenantSettingsGeneralQuery).toHaveBeenCalledWith(
			expect.anything(),
			'tenant-1',
		);
		expect(mocks.toastLocalMutationResult.success).toHaveBeenCalledWith(
			'General settings updated successfully',
		);
	});

	test('clears a field by submitting null when the input is emptied', async () => {
		markQueryLoaded();
		mocks.mutation.mutateAsync.mockResolvedValue({
			...settingsData,
			websiteUrl: null,
		});
		renderPage();

		fireEvent.change(screen.getByLabelText('Website'), {
			target: { value: '' },
		});
		fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]);

		await waitFor(() => {
			expect(mocks.mutation.mutateAsync).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
				websiteUrl: null,
			});
		});
	});

	test('does not submit when nothing changed', async () => {
		markQueryLoaded();
		renderPage();

		fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]);

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mocks.mutation.mutateAsync).not.toHaveBeenCalled();
	});

	test('shows a local failure message when the PATCH fails', async () => {
		markQueryLoaded();
		const failure = new Error('network down');
		mocks.mutation.mutateAsync.mockRejectedValue(failure);
		renderPage();

		fireEvent.change(screen.getByLabelText('Name'), {
			target: { value: 'Acme Corporation Updated' },
		});
		fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]);

		await waitFor(() => {
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
				failure,
				'Unknown error',
			);
		});
		expect(screen.getByRole('alert')).toBeTruthy();
		expect(mocks.invalidateTenantSettingsGeneralQuery).not.toHaveBeenCalled();
	});

	test('blocks an invalid website URL client-side without calling the PATCH', async () => {
		markQueryLoaded();
		renderPage();

		fireEvent.change(screen.getByLabelText('Website'), {
			target: { value: 'not-a-url' },
		});
		fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]);

		await screen.findByText('Enter a valid http(s) URL');
		expect(mocks.mutation.mutateAsync).not.toHaveBeenCalled();
	});

	test('falls back to skeletons while the settings query is pending', () => {
		mocks.settingsQuery = {
			data: undefined,
			isPending: true,
			isError: false,
			isSuccess: false,
			refetch: mocks.settingsQuery.refetch,
		};
		const { view } = renderPage();

		expect(
			view.container.querySelectorAll('[data-slot="skeleton"]').length,
		).toBeGreaterThan(0);
	});

	test('hydrates the form when the query resolves after mount', async () => {
		// Render while the query is still unresolved (disabled tenant / first
		// fetch): the page must not paint an empty "loaded" form yet.
		mocks.settingsQuery = {
			data: undefined,
			isPending: true,
			isError: false,
			isSuccess: false,
			refetch: mocks.settingsQuery.refetch,
		};
		const { queryClient, view } = renderPage();
		expect(screen.queryByLabelText('Name')).toBeNull();

		// The query resolves; the form must now hydrate from the loaded data
		// even though useForm captured its defaultValues at mount time.
		markQueryLoaded();
		view.rerender(
			<QueryClientProvider client={queryClient}>
				<TenantSettingsGeneralPage />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(
				'Acme Corporation',
			);
		});
		expect(
			(screen.getByLabelText('Description') as HTMLInputElement).value,
		).toBe('The Acme description');
		expect(
			(screen.getByLabelText('Billing email') as HTMLInputElement).value,
		).toBe('billing@acme.example.com');
	});

	test('shows an error state with a retry action when the settings query fails', () => {
		mocks.settingsQuery = {
			data: undefined,
			isPending: false,
			isError: true,
			isSuccess: false,
			refetch: mocks.settingsQuery.refetch,
		};
		renderPage();

		expect(screen.getByTestId('tenant-settings-general-error')).toBeTruthy();
		expect(screen.getByText('Failed to load settings')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(mocks.settingsQuery.refetch).toHaveBeenCalledTimes(1);
	});
});
