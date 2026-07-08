/** @vitest-environment jsdom */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { createElement, type ReactNode, type FormEventHandler } from 'react';
import { FormProvider, useFormContext } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	invalidateQueries: vi.fn(),
	mutateAsync: vi.fn(),
	useCreateStaffTenantMutation: vi.fn(),
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
	Select: {
		Root: ({
			children,
			selectedKey,
			onSelectionChange,
			isDisabled,
			...props
		}: {
			children: ReactNode;
			selectedKey?: string;
			onSelectionChange?: (key: string) => void;
			isDisabled?: boolean;
		}) =>
			createElement(
				'select',
				{
					value: selectedKey,
					onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
						onSelectionChange?.(e.target.value);
					},
					disabled: isDisabled,
					...props,
				},
				children,
			),
		Trigger: ({ children: c }: { children?: ReactNode }) => c,
		Value: () => null,
		Indicator: () => null,
		Popover: ({ children: c }: { children?: ReactNode }) => c,
	},
	ListBox: Object.assign(({ children: c }: { children?: ReactNode }) => c, {
		Item: ({ children: c, id }: { children?: ReactNode; id?: string }) =>
			createElement('option', { value: id }, c),
	}),
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
	}),
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) =>
		createElement('a', { href: to, ...props }, children),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				'back-to-staff-tenants': 'Back to staff tenants',
				'tenant-name': 'Tenant name',
				'create-tenant': 'Create tenant',
				'new-item': 'Create Tenant',
				tenant: 'Tenant',
				'tenant-create-failed': 'Tenant create failed.',
			};

			return labels[key] ?? key;
		},
		i18n: {
			language: 'en',
			getFixedT: () => (key: string) => key,
			t: (key: string) => key,
		},
	}),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () =>
		createElement('div', { 'data-testid': 'logout-redirect' }, 'logout'),
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

vi.mock('~/lib/query/staff-tenants', () => ({
	STAFF_TENANTS_QUERY_KEY: ['staff-tenants'],
	useCreateStaffTenantMutation: mocks.useCreateStaffTenantMutation,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './tenants-new';

const renderPage = () => {
	const Component = (
		Route as unknown as {
			component: () => ReturnType<typeof createElement>;
		}
	).component;

	return render(<Component />);
};

describe('staff tenant create route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.useCreateStaffTenantMutation.mockReturnValue({
			mutateAsync: mocks.mutateAsync,
			isPending: false,
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('links back to the staff tenants list', () => {
		renderPage();

		expect(
			screen
				.getByRole('link', { name: 'Back to staff tenants' })
				.getAttribute('href'),
		).toBe('/staff/tenants');
	});

	test('creates a tenant and navigates to the tenant detail when id is returned', async () => {
		mocks.mutateAsync.mockResolvedValue({ id: 'tenant-001' });

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Tenant name' }), {
			target: { value: 'Acme Corporation' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'email' }), {
			target: { value: 'admin@acme.com' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create tenant' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mocks.mutateAsync).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'Acme Corporation',
					maxUsers: expect.any(Number),
					initialUsers: [
						{
							email: 'admin@acme.com',
							accountLevel: 'Admin',
						},
					],
				}),
			),
		);

		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-tenants'],
			}),
		);
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/tenants/$tenantId',
				params: {
					tenantId: 'tenant-001',
				},
			}),
		);
	});

	test('falls back to the tenants list when tenant id is missing in the create result', async () => {
		mocks.mutateAsync.mockResolvedValue({ name: 'Acme Corporation' });

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Tenant name' }), {
			target: { value: 'Acme Corporation' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'email' }), {
			target: { value: 'admin@acme.com' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create tenant' }).closest('form')!,
		);

		await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalled());
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/tenants',
			}),
		);
	});

	test('shows logout redirect for 401 submit failures', async () => {
		mocks.mutateAsync.mockRejectedValue(new Response(null, { status: 401 }));
		mocks.shouldLogoutForFailure.mockImplementation(
			(error: unknown) => error instanceof Response && error.status === 401,
		);

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Tenant name' }), {
			target: { value: 'Acme Corporation' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'email' }), {
			target: { value: 'admin@acme.com' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create tenant' }).closest('form')!,
		);

		await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalled());
		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
	});

	test('shows an inline error for ordinary non-401 failures and stays on the page', async () => {
		mocks.mutateAsync.mockRejectedValue({
			status: 400,
			responseStatusCode: 400,
			title: 'Bad Request',
			detail: 'Tenant name is already used.',
		});

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Tenant name' }), {
			target: { value: 'Acme Corporation' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'email' }), {
			target: { value: 'admin@acme.com' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create tenant' }).closest('form')!,
		);

		await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalled());
		await waitFor(() =>
			expect(screen.getByText('Tenant name is already used.')).toBeTruthy(),
		);

		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});
});
