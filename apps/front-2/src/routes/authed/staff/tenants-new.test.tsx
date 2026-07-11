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

const LABELS: Record<string, string> = {
	'back-to-staff-tenants': 'Back to staff tenants',
	'create-tenant': 'Create tenant',
	'create-tenant-description': 'Provision a new organization workspace.',
	organization: 'Organization',
	'organization-name': 'Organization name',
	seats: 'Seats',
	members: 'Members',
	'members-hint': 'At least one admin required',
	email: 'Email',
	'account-level': 'Account level',
	admin: 'Admin',
	user: 'User',
	'add-member': 'Add member',
	'remove-member': 'Remove member',
	preview: 'Preview',
	'untitled-organization': 'New organization',
	'assigned-after-creation': 'Assigned after creation',
	'preview-admins-checklist': '{{count}} admins get full access',
	'preview-members-checklist': '{{count}} members will be invited on creation',
	'create-tenant-summary':
		'{{admins}} admins · {{members}} members will be invited on creation',
	'tenant-should-have-at-least-one-admin':
		'A tenant should have at least one admin',
	'each-user-must-have-a-unique-email':
		'Each user must have a unique email address.',
	'max-users-reached': 'Maximum users number reached',
	'tenant-create-failed': 'Tenant create failed.',
	cancel: 'Cancel',
};

const translate = (key: string, params?: Record<string, unknown>): string => {
	let value = LABELS[key] ?? key;
	if (params) {
		for (const [paramKey, paramValue] of Object.entries(params)) {
			value = value.replaceAll(`{{${paramKey}}}`, String(paramValue));
		}
	}
	return value;
};

vi.mock('~/components/ui/button', () => ({
	Button: ({
		children,
		type,
		onClick,
		disabled,
		...props
	}: {
		children: ReactNode;
		type?: 'button' | 'submit' | 'reset';
		onClick?: () => void;
		disabled?: boolean;
	}) =>
		createElement(
			'button',
			{
				type: type ?? 'button',
				onClick,
				disabled,
				...props,
			},
			children,
		),
}));

vi.mock('~/components/ui/card', () => ({
	Card: ({ children, ...props }: { children: ReactNode }) =>
		createElement('div', props, children),
}));

vi.mock('~/components/ui/select', () => ({
	Select: ({
		children,
		value,
		onValueChange,
		disabled,
		...props
	}: {
		children: ReactNode;
		value: string;
		onValueChange?: (nextValue: string) => void;
		disabled?: boolean;
	}) =>
		createElement(
			'select',
			{
				value,
				onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
					onValueChange?.(event.target.value);
				},
				disabled,
				...props,
			},
			children,
		),
	SelectTrigger: ({ children: _children }: { children?: ReactNode }) => null,
	SelectContent: ({ children }: { children?: ReactNode }) => children,
	SelectItem: ({ children, value }: { children?: ReactNode; value: string }) =>
		createElement('option', { value }, children),
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
		t: translate,
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
	FormPageLayout: ({ children, ...props }: { children: ReactNode }) =>
		createElement('div', props, children),
	FormActionBar: ({
		status,
		children,
	}: {
		status?: ReactNode;
		children: ReactNode;
	}) =>
		createElement(
			'div',
			undefined,
			status ? createElement('div', undefined, status) : null,
			children,
		),
	Field: {
		Text: ({
			name,
			label,
			placeholder,
			isDisabled,
			type,
		}: {
			name: string;
			label: string;
			placeholder?: string;
			isDisabled?: boolean;
			type?: string;
		}) => {
			const { register } = useFormContext();

			return createElement(
				'label',
				undefined,
				createElement('span', undefined, label),
				createElement('input', {
					'aria-label': label,
					placeholder,
					disabled: isDisabled,
					type: type ?? 'text',
					...register(name),
				}),
			);
		},
		Email: ({
			name,
			label,
			placeholder,
			isDisabled,
		}: {
			name: string;
			label: string;
			placeholder?: string;
			isDisabled?: boolean;
		}) => {
			const { register } = useFormContext();

			return createElement(
				'label',
				undefined,
				createElement('span', undefined, label),
				createElement('input', {
					'aria-label': label,
					placeholder,
					disabled: isDisabled,
					type: 'email',
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

const fillOrganizationName = (name: string) => {
	fireEvent.change(screen.getByRole('textbox', { name: 'Organization name' }), {
		target: { value: name },
	});
};

const getEmailInputs = () =>
	screen.getAllByRole('textbox', { name: 'Email' }) as HTMLInputElement[];

const getLevelSelects = () =>
	screen.getAllByRole('combobox', { name: 'Account level' });

const submitForm = () => {
	fireEvent.submit(
		screen.getByRole('button', { name: 'Create tenant' }).closest('form')!,
	);
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

	test('renders the flat Organization and Members sections plus the preview card', () => {
		renderPage();

		expect(screen.getByText('Organization')).toBeTruthy();
		expect(screen.getAllByText('Members').length).toBeGreaterThan(0);
		expect(screen.getByTestId('staff-tenant-create-preview')).toBeTruthy();
		expect(getEmailInputs()).toHaveLength(1);
	});

	test('adds and removes member slots', () => {
		renderPage();

		expect(getEmailInputs()).toHaveLength(1);

		fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
		expect(getEmailInputs()).toHaveLength(2);

		fireEvent.click(
			screen.getAllByRole('button', { name: 'Remove member' })[1]!,
		);
		expect(getEmailInputs()).toHaveLength(1);
	});

	test('the sole remaining member row cannot be removed', () => {
		renderPage();

		const removeButtons = screen.getAllByRole('button', {
			name: 'Remove member',
		});
		expect(removeButtons).toHaveLength(1);
		expect((removeButtons[0] as HTMLButtonElement).disabled).toBe(true);
	});

	test('preview counts recompute live as members are added and role changes', () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'admin@acme.com' },
		});

		expect(screen.getByTestId('preview-seats').textContent).toBe('1 / 5');
		expect(screen.getByTestId('preview-admins').textContent).toBe('1');
		expect(screen.getByTestId('preview-members').textContent).toBe('0');

		fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
		fireEvent.change(getEmailInputs()[1]!, {
			target: { value: 'member@acme.com' },
		});

		expect(screen.getByTestId('preview-seats').textContent).toBe('2 / 5');
		expect(screen.getByTestId('preview-admins').textContent).toBe('1');
		expect(screen.getByTestId('preview-members').textContent).toBe('1');

		fireEvent.change(getLevelSelects()[1]!, { target: { value: 'Admin' } });

		expect(screen.getByTestId('preview-admins').textContent).toBe('2');
		expect(screen.getByTestId('preview-members').textContent).toBe('0');
	});

	test('shows a validation error when no admin is present among initial members', async () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'member@acme.com' },
		});
		fireEvent.change(getLevelSelects()[0]!, { target: { value: 'User' } });

		submitForm();

		await waitFor(() =>
			expect(
				screen.getByText('A tenant should have at least one admin'),
			).toBeTruthy(),
		);
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
	});

	test('shows a validation error for duplicate member emails', async () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'admin@acme.com' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
		fireEvent.change(getEmailInputs()[1]!, {
			target: { value: 'admin@acme.com' },
		});

		submitForm();

		await waitFor(() =>
			expect(
				screen.getByText('Each user must have a unique email address.'),
			).toBeTruthy(),
		);
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
	});

	test('shows a validation error when initial members exceed seats', async () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'admin@acme.com' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
		fireEvent.change(getEmailInputs()[1]!, {
			target: { value: 'member@acme.com' },
		});
		fireEvent.change(screen.getByRole('spinbutton', { name: 'Seats' }), {
			target: { value: '1' },
		});

		submitForm();

		await waitFor(() =>
			expect(screen.getByText('Maximum users number reached')).toBeTruthy(),
		);
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
	});

	test('creates a tenant with the exact contract body shape and navigates to the tenant detail', async () => {
		mocks.mutateAsync.mockResolvedValue({ id: 'tenant-001' });

		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'admin@acme.com' },
		});

		submitForm();

		await waitFor(() =>
			expect(mocks.mutateAsync).toHaveBeenCalledWith({
				name: 'Acme Corporation',
				maxUsers: 5,
				initialUsers: [
					{
						email: 'admin@acme.com',
						accountLevel: 'Admin',
					},
				],
			}),
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

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'admin@acme.com' },
		});

		submitForm();

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

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'admin@acme.com' },
		});

		submitForm();

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

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'admin@acme.com' },
		});

		submitForm();

		await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalled());
		await waitFor(() =>
			expect(screen.getByText('Tenant name is already used.')).toBeTruthy(),
		);

		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});
});
