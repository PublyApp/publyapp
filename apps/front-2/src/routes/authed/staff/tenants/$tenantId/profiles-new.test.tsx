/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { createElement, type FormEventHandler } from 'react';
import { FormProvider, useFormContext } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	navigate: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	useCreateStaffTenantProfileMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn((_: unknown) => false),
}));

vi.mock('@heroui/react', () => ({
	Button: ({
		children,
		type,
		onPress,
		isDisabled,
		...props
	}: {
		children: ReactNode;
		type?: 'button' | 'submit' | 'reset';
		onPress?: () => void;
		isDisabled?: boolean;
	}) =>
		createElement(
			'button',
			{
				type: type ?? 'button',
				onClick: onPress,
				disabled: isDisabled,
				...props,
			},
			children,
		),
	Card: ({ children, ...props }: { children: ReactNode }) =>
		createElement('div', props, children),
	Chip: ({ children, ...props }: { children: ReactNode }) =>
		createElement('span', props, children),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useNavigate: () => mocks.navigate,
		useParams: () => ({
			tenantId: '11111111-1111-1111-1111-111111111111',
		}),
	}),
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		let href = to;

		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}

		return createElement('a', { href, ...props }, children);
	},
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			if (key === 'new-item') {
				return `New ${String(options?.item ?? '')}`;
			}

			const labels: Record<string, string> = {
				profile: 'profile',
				'profile-name': 'Profile name',
				description: 'Description',
				'create-profile': 'Create profile',
				'back-to-profiles': 'Back to profiles',
				'profile-save-failed': 'Unable to save the profile.',
			};

			return labels[key] ?? key;
		},
		i18n: {
			language: 'en',
		},
	}),
}));

vi.mock('~/components/error-views/AppErrorView', () => ({
	AppErrorView: ({
		testId,
		title,
		description,
	}: {
		testId?: string;
		title: string;
		description?: string;
	}) =>
		createElement(
			'div',
			{ 'data-testid': testId ?? 'app-error-view' },
			`${title}${description ? ` ${description}` : ''}`,
		),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () =>
		createElement('div', { 'data-testid': 'logout-redirect' }, 'logout'),
}));

vi.mock('~/components/error-views/View403', () => ({
	View403: () =>
		createElement('div', { 'data-testid': 'forbidden-view' }, 'forbidden'),
}));

vi.mock('~/components/field', () => ({
	Form: ({
		children,
		methods,
		onSubmit,
	}: {
		children: ReactNode;
		methods: import('react-hook-form').UseFormReturn;
		onSubmit?: FormEventHandler<HTMLFormElement>;
	}) =>
		createElement(
			FormProvider as never,
			{ ...methods } as never,
			createElement('form', { onSubmit }, children),
		),
	Field: {
		Text: ({
			name,
			label,
			placeholder,
			disabled,
		}: {
			name: string;
			label: string;
			placeholder?: string;
			disabled?: boolean;
		}) => {
			const { register } = useFormContext();

			return createElement(
				'label',
				undefined,
				createElement('span', undefined, label),
				createElement('input', {
					'aria-label': label,
					placeholder,
					disabled,
					...register(name),
				}),
			);
		},
	},
}));

vi.mock('~/lib/query/staff-tenant-profiles', () => ({
	STAFF_TENANT_PROFILES_QUERY_KEY: ['staff', 'staff-tenants', 'profiles'],
	useCreateStaffTenantProfileMutation:
		mocks.useCreateStaffTenantProfileMutation,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
	toStaffTenantDetails: mocks.toStaffTenantDetails,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './profiles-new';

const buildQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const renderPage = () => {
	const Component = (
		Route as unknown as {
			component: () => JSX.Element;
		}
	).component;

	return render(<Component />);
};

describe('staff tenant profile create route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.toStaffTenantDetails.mockReturnValue({
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Acme Corporation',
			code: 'ACME',
			status: 'Active',
			usersCount: 12,
			maxUsers: 50,
			logoUrl: null,
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
		});
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					tenantId: '11111111-1111-1111-1111-111111111111',
				},
			}),
		);
		mocks.useCreateStaffTenantProfileMutation.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({
				profile: {
					id: 'profile-1',
				},
			}),
			isPending: false,
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('renders the tenant shell and links back to the tenant profiles list', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-profile-create-page')).toBeTruthy();
		expect(screen.getByText('Acme Corporation')).toBeTruthy();
		expect(
			screen.getByText('Profiles', { selector: 'span[aria-current="page"]' }),
		).toBeTruthy();
		expect(
			screen
				.getByRole('link', { name: 'Back to profiles' })
				.getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/profiles');
	});

	test('submits name and description, invalidates the tenant list, and navigates to the created profile', async () => {
		const mutateAsync = vi.fn().mockResolvedValue({
			profile: {
				id: 'profile-1',
			},
		});

		mocks.useCreateStaffTenantProfileMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Profile name' }), {
			target: { value: 'Approvers' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
			target: { value: 'Can review approvals' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create profile' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mutateAsync).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				name: 'Approvers',
				description: 'Can review approvals',
				permissionKeys: [],
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-tenants', 'profiles'],
			}),
		);
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/tenants/$tenantId/profiles/$profileId',
				params: {
					tenantId: '11111111-1111-1111-1111-111111111111',
					profileId: 'profile-1',
				},
			}),
		);
	});

	test('renders logout redirect for submit 401 failures', async () => {
		const mutateAsync = vi
			.fn()
			.mockRejectedValue(new Response(null, { status: 401 }));

		mocks.useCreateStaffTenantProfileMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});
		mocks.shouldLogoutForFailure.mockImplementation(
			(error: unknown) => error instanceof Response && error.status === 401,
		);

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Profile name' }), {
			target: { value: 'Approvers' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create profile' }).closest('form')!,
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
	});

	test('shows an inline error and stays on the page for submit 403 failures', async () => {
		const mutateAsync = vi
			.fn()
			.mockRejectedValue(new Response(null, { status: 403 }));

		mocks.useCreateStaffTenantProfileMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});
		mocks.shouldLogoutForFailure.mockImplementation(
			(error: unknown) => error instanceof Response && error.status === 401,
		);

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Profile name' }), {
			target: { value: 'Approvers' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create profile' }).closest('form')!,
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
		await waitFor(() =>
			expect(screen.getByText('Unable to save the profile.')).toBeTruthy(),
		);
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('shows an inline error without logout, navigation, or invalidation for submit 400 problem failures', async () => {
		const mutateAsync = vi.fn().mockRejectedValue({
			status: 400,
			responseStatusCode: 400,
			title: 'Bad Request',
			detail: 'Profile name already exists.',
		});

		mocks.useCreateStaffTenantProfileMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});
		mocks.shouldLogoutForFailure.mockImplementation(
			(error: unknown) => error instanceof Response && error.status === 401,
		);

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Profile name' }), {
			target: { value: 'Approvers' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create profile' }).closest('form')!,
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(screen.getByText('Profile name already exists.')).toBeTruthy(),
		);
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});

	test('shows an inline error without logout, navigation, or invalidation for submit 422 validation failures', async () => {
		const mutateAsync = vi.fn().mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			detail: 'Name is required.',
			errors: {
				name: ['Name is required.'],
			},
		});

		mocks.useCreateStaffTenantProfileMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});
		mocks.shouldLogoutForFailure.mockImplementation(
			(error: unknown) => error instanceof Response && error.status === 401,
		);

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Profile name' }), {
			target: { value: 'Approvers' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create profile' }).closest('form')!,
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(screen.getByText('Name is required.')).toBeTruthy(),
		);
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});

	test('shows an inline error without logout, navigation, or invalidation for ordinary problem failures', async () => {
		const mutateAsync = vi.fn().mockRejectedValue({
			status: 500,
			responseStatusCode: 500,
			title: 'Server Error',
			detail: 'Unexpected failure',
		});

		mocks.useCreateStaffTenantProfileMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});
		mocks.shouldLogoutForFailure.mockImplementation(
			(error: unknown) => error instanceof Response && error.status === 401,
		);

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Profile name' }), {
			target: { value: 'Approvers' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create profile' }).closest('form')!,
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(screen.getByText('Unexpected failure')).toBeTruthy(),
		);
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});
});
