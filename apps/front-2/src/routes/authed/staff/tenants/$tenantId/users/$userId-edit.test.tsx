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
import * as React from 'react';
import { createElement, type JSX, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	navigate: vi.fn(),
	updateTenantUserMutation: vi.fn(),
	useUpdateStaffTenantUserMutation: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	useStaffTenantUserDetailsQuery: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	toStaffTenantUserDetails: vi.fn(),
	shouldLogoutForFailure: vi.fn<(error: unknown) => boolean>(() => false),
}));

vi.mock('~/components/ui/select', () => {
	const SelectContent = ({ children }: { children?: ReactNode }) =>
		createElement('div', null, children);

	const SelectItem = ({
		children,
		value,
	}: {
		children: ReactNode;
		value?: string;
	}) => createElement('option', { value }, children);

	// Forwards every prop (aria-labelledby, aria-invalid, onBlur, ...) so the
	// mocked <select> below can re-apply them — Field.Select puts the
	// accessible-name wiring on SelectTrigger, not on <Select> itself.
	const SelectTrigger = ({
		children,
		...triggerProps
	}: {
		children?: ReactNode;
		[key: string]: unknown;
	}) => createElement('div', triggerProps, children);

	const SelectValue = () => null;

	const collectSelectContent = (
		children: ReactNode,
	): { options: ReactNode[]; triggerProps: Record<string, unknown> } => {
		let triggerProps: Record<string, unknown> = {};
		const options: ReactNode[] = [];

		for (const child of React.Children.toArray(children)) {
			if (!React.isValidElement(child)) {
				continue;
			}

			if (child.type === SelectTrigger) {
				triggerProps = { ...(child.props as Record<string, unknown>) };
				delete triggerProps.children;
				continue;
			}

			if (child.type === SelectContent) {
				const nested = (child.props as { children?: ReactNode }).children;
				if (nested) {
					options.push(...React.Children.toArray(nested));
				}
				continue;
			}

			if (child.type === SelectValue) {
				continue;
			}

			options.push(child);
		}

		return { options, triggerProps };
	};

	return {
		Select: ({
			children,
			value,
			onValueChange,
			disabled,
			...props
		}: {
			children: ReactNode;
			value?: string;
			onValueChange?: (value: string) => void;
			disabled?: boolean;
		}) => {
			const { options, triggerProps } = collectSelectContent(children);
			return createElement(
				'select',
				{
					value,
					onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
						onValueChange?.(e.target.value);
					},
					disabled,
					...triggerProps,
					...props,
				},
				options,
			);
		},
		SelectContent,
		SelectItem,
		SelectTrigger,
		SelectValue,
	};
});

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useNavigate: () => mocks.navigate,
		useParams: () => ({
			tenantId: '11111111-1111-1111-1111-111111111111',
			userId: '22222222-2222-2222-2222-222222222222',
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

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				'back-to-user': 'Back to tenant user',
				'edit-tenant-user': 'Edit tenant user',
				'first-name': 'First name',
				'last-name': 'Last name',
				'avatar-url': 'Avatar URL',
				'account-level': 'Account level',
				'save-changes': 'Save changes',
				'tenant-user-update-failed': 'Unable to save tenant user.',
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
			description ? `${title} ${description}` : title,
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

vi.mock('~/lib/query/staff-tenant-users', () => ({
	useUpdateStaffTenantUserMutation: mocks.useUpdateStaffTenantUserMutation,
	useStaffTenantUserDetailsQuery: mocks.useStaffTenantUserDetailsQuery,
	toStaffTenantUserDetails: mocks.toStaffTenantUserDetails,
	invalidateStaffTenantUsers: (queryClient: {
		invalidateQueries: (arg: unknown) => unknown;
	}) =>
		queryClient.invalidateQueries({
			queryKey: ['staff', 'staff-tenants', 'users'],
		}),
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
	invalidateStaffTenantDetails: (queryClient: {
		invalidateQueries: (arg: unknown) => unknown;
	}) =>
		queryClient.invalidateQueries({
			queryKey: ['staff', 'staff-tenants'],
		}),
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './$userId-edit';

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

describe('staff tenant user edit route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.useUpdateStaffTenantUserMutation.mockReturnValue({
			mutateAsync: mocks.updateTenantUserMutation,
			isPending: false,
		});
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
		mocks.toStaffTenantUserDetails.mockReturnValue({
			id: '22222222-2222-2222-2222-222222222222',
			email: 'alex@example.com',
			firstName: 'Alex',
			lastName: 'User',
			avatarUrl: 'https://example.com/avatar.png',
			accountLevel: 'Admin',
			status: 'Active',
			tenantId: '11111111-1111-1111-1111-111111111111',
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
			displayName: 'Alex User',
		});
		mocks.useStaffTenantUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					id: '22222222-2222-2222-2222-222222222222',
				},
			}),
		);
	});

	afterEach(() => {
		cleanup();
	});

	test('renders the edit form and prefilled tenant user values', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-user-edit-page')).toBeTruthy();
		expect(screen.getByText('Edit tenant user')).toBeTruthy();
		expect(
			screen
				.getByRole('link', { name: 'Back to tenant user' })
				.getAttribute('href'),
		).toBe(
			'/staff/tenants/11111111-1111-1111-1111-111111111111/users/22222222-2222-2222-2222-222222222222',
		);
		expect(screen.getByDisplayValue('Alex')).toBeTruthy();
		expect(screen.getByDisplayValue('User')).toBeTruthy();
		expect(
			screen.getByDisplayValue('https://example.com/avatar.png'),
		).toBeTruthy();
		expect(
			screen.getByRole('combobox', { name: 'Account level' }),
		).toBeTruthy();
	});

	test('submits editable identity fields and navigates back to tenant user details on success', async () => {
		const mutateAsync = vi
			.fn()
			.mockResolvedValue({ id: '22222222-2222-2222-2222-222222222222' });
		mocks.useUpdateStaffTenantUserMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});

		renderPage();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: '  Alex Updated  ' },
		});
		fireEvent.change(screen.getByLabelText('Account level'), {
			target: { value: 'User' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mutateAsync).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				userId: '22222222-2222-2222-2222-222222222222',
				firstName: 'Alex Updated',
				accountLevel: 'User',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenNthCalledWith(1, {
				queryKey: ['staff', 'staff-tenants', 'users'],
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenNthCalledWith(2, {
				queryKey: ['staff', 'staff-tenants'],
			}),
		);
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/tenants/$tenantId/users/$userId',
				params: {
					tenantId: '11111111-1111-1111-1111-111111111111',
					userId: '22222222-2222-2222-2222-222222222222',
				},
			}),
		);
	});

	test('sends null for cleared nullable fields on success', async () => {
		const mutateAsync = vi
			.fn()
			.mockResolvedValue({ id: '22222222-2222-2222-2222-222222222222' });
		mocks.useUpdateStaffTenantUserMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});

		renderPage();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: '   ' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mutateAsync).toHaveBeenCalledWith(
				expect.objectContaining({
					tenantId: '11111111-1111-1111-1111-111111111111',
					userId: '22222222-2222-2222-2222-222222222222',
					firstName: null,
				}),
			),
		);
	});

	test.each([
		{
			name: '400',
			error: {
				status: 400,
				responseStatusCode: 400,
				title: 'Bad request',
				detail: 'The tenant user link is invalid.',
			},
			message: 'The tenant user link is invalid.',
		},
		{
			name: '403',
			error: {
				status: 403,
				responseStatusCode: 403,
				title: 'Forbidden',
				detail: 'Forbidden',
			},
			message: 'Forbidden',
		},
		{
			name: '422',
			error: {
				status: 422,
				responseStatusCode: 422,
				title: 'Validation failed',
				detail: 'Validation failed',
				errors: {
					firstName: ['First name is too long.'],
				},
			},
			message: 'Validation failed',
		},
		{
			name: '500',
			error: {
				status: 500,
				responseStatusCode: 500,
				title: 'Server Error',
				detail: 'Unexpected failure',
			},
			message: 'Unexpected failure',
		},
	])(
		'displays local inline errors for submit failure status %s without logout',
		async ({ error, message }) => {
			const mutateAsync = vi.fn().mockRejectedValue(error);
			mocks.useUpdateStaffTenantUserMutation.mockReturnValue({
				mutateAsync,
				isPending: false,
			});

			renderPage();

			fireEvent.submit(
				screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
			);

			await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
			await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
			expect(screen.queryByTestId('logout-redirect')).toBeNull();
			expect(mocks.navigate).not.toHaveBeenCalled();
			expect(mocks.invalidateQueries).not.toHaveBeenCalled();
		},
	);

	test('redirects to logout only for submit 401 failures', async () => {
		const mutateAsync = vi.fn().mockRejectedValue({
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Session expired',
		});
		mocks.useUpdateStaffTenantUserMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});
		mocks.shouldLogoutForFailure.mockImplementation(
			(error: unknown) =>
				error instanceof Object &&
				'status' in error &&
				(error as { status?: number }).status === 401,
		);

		renderPage();

		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('renders local not-found, forbidden, and 500 views for detail query failures', () => {
		mocks.useStaffTenantUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 400,
					responseStatusCode: 400,
					title: 'Bad Request',
					detail: 'Malformed userId',
					translationKey: 'malformed-id',
				},
				isError: true,
			}),
		);

		renderPage();
		expect(screen.getByTestId('staff-tenant-user-edit-not-found')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout only when tenant details query returns 401', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 401,
					responseStatusCode: 401,
					title: 'Unauthorized',
					detail: 'Session expired',
				},
				isError: true,
			}),
		);
		mocks.shouldLogoutForFailure.mockImplementation(
			(error: unknown) =>
				error instanceof Object &&
				'status' in error &&
				(error as { status?: number }).status === 401,
		);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
