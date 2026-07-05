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
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	navigate: vi.fn(),
	updateTenantMutation: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	useUpdateStaffTenantMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn<(error: unknown) => boolean>(() => false),
}));

vi.mock('@heroui/react', () => ({
	Button: ({
		children,
		type,
		isDisabled,
		onPress,
		...props
	}: {
		children: ReactNode;
		type?: 'button' | 'submit' | 'reset';
		isDisabled?: boolean;
		onPress?: () => void;
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

		return createElement(
			'a',
			{
				href,
				...props,
			},
			children,
		);
	},
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				'back-to-tenant': 'Back to tenant',
				'tenant-name': 'Tenant name',
				'max-users': 'Max users',
				'logo-url': 'Logo URL',
				'save-changes': 'Save changes',
				'tenant-update-failed': 'Unable to save tenant.',
				tenant: 'Tenant',
				'edit-item': 'Edit Tenant',
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

vi.mock('~/lib/query/staff-tenants', () => ({
	STAFF_TENANT_DETAILS_QUERY_KEY: ['staff-tenants', 'detail'],
	STAFF_TENANTS_QUERY_KEY: ['staff-tenants'],
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
	useUpdateStaffTenantMutation: mocks.useUpdateStaffTenantMutation,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './$tenantId-edit';

const buildQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});
const RouteComponent = (
	Route as unknown as {
		component: () => JSX.Element;
	}
).component;

const renderPage = () => {
	return render(<RouteComponent />);
};

describe('staff tenant edit route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.useUpdateStaffTenantMutation.mockReturnValue({
			mutateAsync: mocks.updateTenantMutation,
			isPending: false,
		});
		mocks.toStaffTenantDetails.mockImplementation(() => ({
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Acme Corporation',
			code: 'ACME',
			status: 'Active',
			usersCount: 12,
			maxUsers: 12,
			logoUrl: 'https://cdn.example.com/acme.png',
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
		}));
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					tenantId: '11111111-1111-1111-1111-111111111111',
					name: 'Acme Corporation',
					maxUsers: 12,
					logoUrl: 'https://cdn.example.com/acme.png',
					status: 'Active',
					usersCount: 5,
					code: 'ACME',
					createdAt: null,
					updatedAt: null,
				},
			}),
		);
	});

	afterEach(() => {
		cleanup();
	});

	test('does not reset unsaved edits when tenant query data is remapped on rerender', () => {
		const renderResult = renderPage();
		const nameInput = screen.getByLabelText('Tenant name') as HTMLInputElement;

		fireEvent.change(nameInput, {
			target: { value: 'Acme Corporation Edited' },
		});

		renderResult.rerender(<RouteComponent />);

		expect(
			(screen.getByLabelText('Tenant name') as HTMLInputElement).value,
		).toBe('Acme Corporation Edited');
	});

	test('renders the edit form with tenant values and navigation action', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-edit-page')).toBeTruthy();
		expect(screen.getByDisplayValue('Acme Corporation')).toBeTruthy();
		expect(screen.getByDisplayValue('12')).toBeTruthy();
		expect(
			screen.getByRole('link', { name: 'Back to tenant' }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111');
	});

	test('submits changed tenant values and navigates to tenant details on success', async () => {
		mocks.updateTenantMutation.mockResolvedValue({
			tenantId: '11111111-1111-1111-1111-111111111111',
		});

		renderPage();

		fireEvent.change(screen.getByLabelText('Max users'), {
			target: { value: '25' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mocks.updateTenantMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				maxUsers: 25,
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenNthCalledWith(1, {
				queryKey: ['staff', 'staff-tenants'],
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenNthCalledWith(2, {
				queryKey: ['staff', 'staff-tenants', 'detail'],
			}),
		);
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/tenants/$tenantId',
				params: {
					tenantId: '11111111-1111-1111-1111-111111111111',
				},
			}),
		);
	});

	test('renders a local failure without logging out for non-401 API failures', async () => {
		const updateError = {
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			detail: 'The tenant payload is invalid.',
		};
		mocks.updateTenantMutation.mockRejectedValue(updateError);

		renderPage();

		fireEvent.change(screen.getByLabelText('Max users'), {
			target: { value: '25' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(screen.getByText('The tenant payload is invalid.')).toBeTruthy(),
		);
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.shouldLogoutForFailure).toHaveBeenCalled();
	});
});

test('redirects to logout when an update failure should end the session', async () => {
	const updateError = {
		status: 401,
		responseStatusCode: 401,
		title: 'Unauthorized',
		detail: 'Session expired.',
	};
	mocks.updateTenantMutation.mockRejectedValue(updateError);
	mocks.shouldLogoutForFailure.mockReturnValue(true);

	renderPage();

	fireEvent.change(screen.getByLabelText('Max users'), {
		target: { value: '25' },
	});
	fireEvent.submit(
		screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
	);

	await waitFor(() =>
		expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
	);
});
