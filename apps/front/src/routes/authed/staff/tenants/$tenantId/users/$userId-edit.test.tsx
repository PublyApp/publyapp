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
import type { TestLabelMap } from '~/lib/testing/test-label-map';

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
	displayLocalMutationFailure: vi.fn(),
	toastSuccess: vi.fn(),
	blockerResolver: {
		status: 'idle' as 'idle' | 'blocked',
		proceed: undefined as (() => void) | undefined,
		reset: undefined as (() => void) | undefined,
	},
	capturedShouldBlockFn: undefined as (() => boolean) | undefined,
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: { success: mocks.toastSuccess },
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
	// mocked native control below can re-apply them — Field.Select puts the
	// accessible-name wiring on SelectTrigger, not on the outer Select.
	type SelectProbeProps = {
		children?: ReactNode;
		[key: string]: unknown;
	};

	const SelectTrigger = ({ children, ...triggerProps }: SelectProbeProps) =>
		createElement('div', triggerProps, children);

	const SelectValue = () => null;

	// Foreign elements carry `props: unknown`; narrow at runtime instead of casting.
	const omitSelectChildren = (
		element: React.ReactElement,
	): SelectProbeProps => {
		const source: Record<string, unknown> = {};
		Object.assign(source, element.props);
		const { children: _children, ...rest } = source;
		return rest;
	};

	const collectSelectContent = (children: ReactNode) => {
		const options: ReactNode[] = [];
		let selectedTrigger: React.ReactElement | undefined;

		for (const child of React.Children.toArray(children)) {
			if (!React.isValidElement(child)) {
				continue;
			}

			if (child.type === SelectTrigger) {
				selectedTrigger = child;
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

		return {
			options,
			triggerProps: selectedTrigger ? omitSelectChildren(selectedTrigger) : {},
		};
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
		options,
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
	useBlocker: (opts: { shouldBlockFn: () => boolean }) => {
		mocks.capturedShouldBlockFn = opts.shouldBlockFn;
		return mocks.blockerResolver;
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
			const labels: TestLabelMap = {
				'back-to-user': 'Back to tenant user',
				'edit-tenant-user': 'Edit tenant user',
				'first-name': 'First name',
				'last-name': 'Last name',
				'avatar-url': 'Avatar URL',
				'account-level': 'Account level',
				'save-changes': 'Save changes',
				'tenant-user-update-failed': 'Unable to save tenant user.',
				'avatar-url-invalid':
					'Enter a valid avatar URL starting with http:// or https://.',
				cancel: 'Cancel',
				'leave-page': 'Leave page',
				'unsaved-changes-dialog-title': 'Leave without saving?',
				'unsaved-changes-dialog-description':
					'You have unsaved changes that will be lost if you leave this page.',
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
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
	invalidateAllStaffTenantScopes: (queryClient: {
		invalidateQueries: (arg: unknown) => void;
	}) =>
		queryClient.invalidateQueries({
			queryKey: ['staff', 'staff-tenants'],
		}),
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
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

const RouteComponent = Route.options.component as () => JSX.Element;

const renderPage = () => {
	return render(<RouteComponent />);
};

describe('staff tenant user edit route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.blockerResolver.status = 'idle';
		mocks.blockerResolver.proceed = undefined;
		mocks.blockerResolver.reset = undefined;
		mocks.capturedShouldBlockFn = undefined;
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
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
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

	test('keeps a dirty field but applies a genuine refetch change to other fields (r5-tenants-F2)', () => {
		const renderResult = renderPage();
		const firstNameInput = screen.getByLabelText(
			'First name',
		) as HTMLInputElement;

		fireEvent.change(firstNameInput, { target: { value: 'Alex Edited' } });

		// A real background refetch: another admin changed the account level
		// while this tab was unfocused. This changes userFormValues' identity.
		mocks.toStaffTenantUserDetails.mockReturnValue({
			id: '22222222-2222-2222-2222-222222222222',
			email: 'alex@example.com',
			firstName: 'Alex',
			lastName: 'User',
			avatarUrl: 'https://example.com/avatar.png',
			accountLevel: 'User',
			status: 'Active',
			tenantId: '11111111-1111-1111-1111-111111111111',
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
			displayName: 'Alex User',
		});

		renderResult.rerender(<RouteComponent />);

		expect(
			(screen.getByLabelText('First name') as HTMLInputElement).value,
		).toBe('Alex Edited');
		expect(
			screen.getByRole('combobox', { name: 'Account level' }),
		).toHaveProperty('value', 'User');
	});

	test('the nav-guard shouldBlockFn blocks while dirty and stops blocking once the save completes', async () => {
		const mutateAsync = vi
			.fn()
			.mockResolvedValue({ id: '22222222-2222-2222-2222-222222222222' });
		mocks.useUpdateStaffTenantUserMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});

		renderPage();

		expect(mocks.capturedShouldBlockFn?.()).toBe(false);

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Alex Edited' },
		});
		expect(mocks.capturedShouldBlockFn?.()).toBe(true);

		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
		expect(mocks.capturedShouldBlockFn?.()).toBe(false);
	});

	test('shows the unsaved-changes confirm dialog when the router blocks navigation, and Leave page proceeds', () => {
		const proceed = vi.fn();
		const reset = vi.fn();
		mocks.blockerResolver.status = 'blocked';
		mocks.blockerResolver.proceed = proceed;
		mocks.blockerResolver.reset = reset;

		renderPage();

		expect(screen.getByText('Leave without saving?')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));
		expect(proceed).toHaveBeenCalled();
		expect(reset).not.toHaveBeenCalled();
	});

	test('cancelling the unsaved-changes confirm dialog calls reset, not proceed', () => {
		const proceed = vi.fn();
		const reset = vi.fn();
		mocks.blockerResolver.status = 'blocked';
		mocks.blockerResolver.proceed = proceed;
		mocks.blockerResolver.reset = reset;

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(reset).toHaveBeenCalled();
		expect(proceed).not.toHaveBeenCalled();
	});

	test('rejects an invalid avatar URL client-side without firing the mutation', async () => {
		const mutateAsync = vi.fn();
		mocks.useUpdateStaffTenantUserMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});

		renderPage();

		fireEvent.change(screen.getByLabelText('Avatar URL'), {
			target: { value: 'not-a-url' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(
				screen.getByText(
					'Enter a valid avatar URL starting with http:// or https://.',
				),
			).toBeTruthy(),
		);
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	test('marks the avatar URL field invalid on a server 422 for avatarUrl, not the generic form error', async () => {
		const mutateAsync = vi.fn().mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			detail: 'The avatar URL must be an absolute http(s) URL.',
			errors: {
				AvatarUrl: ['The avatar URL must be an absolute http(s) URL.'],
			},
		});
		mocks.useUpdateStaffTenantUserMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});

		renderPage();

		fireEvent.change(screen.getByLabelText('Avatar URL'), {
			target: { value: 'https://example.com/new-avatar.png' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(
				screen.getByLabelText('Avatar URL').getAttribute('aria-invalid'),
			).toBe('true'),
		);
		expect(
			screen.queryByText('The avatar URL must be an absolute http(s) URL.'),
		).toBeTruthy();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	test('shows both the avatar error and root summary for mixed validation fields', async () => {
		const mutateAsync = vi.fn().mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			detail: 'Validation failed',
			errors: {
				AvatarUrl: ['The avatar URL must be an absolute http(s) URL.'],
				FirstName: ['First name is too long.'],
			},
		});
		mocks.useUpdateStaffTenantUserMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});

		renderPage();

		fireEvent.change(screen.getByLabelText('Avatar URL'), {
			target: { value: 'https://example.com/new-avatar.png' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
		await waitFor(() =>
			expect(
				screen.getByLabelText('Avatar URL').getAttribute('aria-invalid'),
			).toBe('true'),
		);
		expect(screen.getByRole('alert').textContent).toBe('Validation failed');
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
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
			message: null,
		},
		{
			name: '403',
			error: {
				status: 403,
				responseStatusCode: 403,
				title: 'Forbidden',
				detail: 'Forbidden',
			},
			message: null,
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
			message: null,
		},
	])(
		'keeps only handled validation inline for submit failure status %s',
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
			if (message) {
				await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
			} else {
				expect(screen.queryByText(error.detail)).toBeNull();
			}
			expect(screen.queryByTestId('logout-redirect')).toBeNull();
			expect(mocks.navigate).not.toHaveBeenCalled();
			expect(mocks.invalidateQueries).not.toHaveBeenCalled();
			expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
			expect(mocks.toastSuccess).not.toHaveBeenCalled();
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
