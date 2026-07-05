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
import { createElement, type JSX, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	navigate: vi.fn(),
	inviteMutation: vi.fn(),
	useInviteTenantUserMutation: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
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
		createElement('div', props, children),
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
		children: React.ReactNode;
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
				'account-level': 'Account level',
				email: 'Email',
				'back-to-users': 'Back to users',
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

vi.mock('~/lib/query/staff-tenant-invitations', () => ({
	STAFF_TENANT_INVITATIONS_QUERY_KEY: ['staff-tenants', 'invitations'],
}));

vi.mock('~/lib/query/staff-tenant-users', () => ({
	STAFF_TENANT_USERS_QUERY_KEY: ['staff-tenants', 'users'],
	useInviteTenantUserMutation: mocks.useInviteTenantUserMutation,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './users-invite';

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

describe('staff tenant user invite route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.useInviteTenantUserMutation.mockReturnValue({
			mutateAsync: mocks.inviteMutation,
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
	});

	afterEach(() => {
		cleanup();
	});

	test('renders the invite form and link back to users', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-users-invite-page')).toBeTruthy();
		expect(screen.getByText('Invite tenant user')).toBeTruthy();
		expect(
			screen.getByRole('link', { name: 'Back to users' }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/users');
		expect(screen.getByLabelText('Email')).toBeTruthy();
		expect(screen.getByLabelText('Account level')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Invite user' })).toBeTruthy();
	});

	test('submits email + account level, invalidates tenant users+invitations, and navigates to tenant invitations', async () => {
		mocks.inviteMutation.mockResolvedValue({ id: 'inv-1' });

		renderPage();

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'alex@example.com' },
		});
		fireEvent.change(screen.getByLabelText('Account level'), {
			target: { value: 'Admin' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Invite user' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mocks.inviteMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				email: 'alex@example.com',
				accountLevel: 'Admin',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenNthCalledWith(1, {
				queryKey: ['staff', 'staff-tenants', 'users'],
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenNthCalledWith(2, {
				queryKey: ['staff', 'staff-tenants', 'invitations'],
			}),
		);
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/tenants/$tenantId/invitations',
				params: {
					tenantId: '11111111-1111-1111-1111-111111111111',
				},
			}),
		);
	});

	test('shows inline validation error for invalid email and does not mutate', async () => {
		renderPage();

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'invalid-email' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Invite user' }).closest('form')!,
		);

		await waitFor(() =>
			expect(screen.getByText('Invalid email address.')).toBeTruthy(),
		);
		expect(mocks.inviteMutation).not.toHaveBeenCalled();
	});

	test.each([
		[400, 'Bad request'],
		[403, 'Forbidden'],
	])(
		'shows an inline server error for non-401 problem errors (%i) and stays on the page',
		async (status, message) => {
			mocks.inviteMutation.mockRejectedValue({
				status,
				responseStatusCode: status,
				title: message,
				detail: message,
				kind: 'problem',
			});

			renderPage();

			fireEvent.change(screen.getByLabelText('Email'), {
				target: { value: 'alex@example.com' },
			});
			fireEvent.submit(
				screen.getByRole('button', { name: 'Invite user' }).closest('form')!,
			);

			await waitFor(() =>
				expect(mocks.inviteMutation).toHaveBeenCalledTimes(1),
			);
			await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
			expect(screen.queryByTestId('logout-redirect')).toBeNull();
		},
	);

	test('shows validation errors for 422 failures and stays on the page', async () => {
		mocks.inviteMutation.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			detail: 'Validation failed',
			errors: {
				email: ['Invalid email address.'],
				accountLevel: ['Invalid account level.'],
			},
		});

		renderPage();

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'alex@example.com' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Invite user' }).closest('form')!,
		);

		await waitFor(() => expect(mocks.inviteMutation).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(screen.getByText('Invalid email address.')).toBeTruthy(),
		);
		expect(screen.getByText('Invalid account level.')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout for a 401 mutation failure', async () => {
		mocks.inviteMutation.mockRejectedValue({
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Session expired',
			kind: 'problem',
		});
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		renderPage();

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'alex@example.com' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Invite user' }).closest('form')!,
		);

		await waitFor(() => expect(mocks.inviteMutation).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
	});

	test('redirects to logout for a tenant details 401 and does not render the form', () => {
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
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		renderPage();
		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
