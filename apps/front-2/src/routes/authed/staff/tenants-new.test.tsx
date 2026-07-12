/** @vitest-environment jsdom */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
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
	parseXlsxFile: vi.fn(),
}));

const LABELS: Record<string, string> = {
	'back-to-staff-tenants': 'Back to staff tenants',
	'create-tenant': 'Create tenant',
	'create-tenant-description': 'Provision a new organization workspace.',
	organization: 'Organization',
	'organization-name': 'Organization name',
	seats: 'Seats',
	'workspace-slug': 'Workspace slug',
	'workspace-slug-hint': 'Optional — leave blank to auto-generate',
	'workspace-slug-invalid':
		'Use lowercase letters, numbers, and hyphens only (3-40 characters).',
	owners: 'Owners',
	'owners-hint': 'Full access · at least one required',
	'add-owner': 'Add owner',
	primary: 'Primary',
	'owner-chip-label': 'Owner',
	'remove-owner': 'Remove owner',
	'initial-members-optional': 'Initial members (optional)',
	'drag-csv-or-excel-file': 'Drag a CSV or Excel file, or browse',
	'csv-excel-columns-hint': 'Columns: email, role',
	'download-template': 'Download template',
	'parsed-file-summary': '{{detected}} members detected · {{valid}} valid',
	'parsed-file-invalid-rows': '{{count}} rows skipped (invalid email)',
	'or-add-manually': 'or add manually',
	email: 'Email',
	'account-level': 'Account level',
	admin: 'Admin',
	user: 'User',
	'add-member': 'Add member',
	'remove-member': 'Remove member',
	remove: 'Remove',
	setup: 'Setup',
	'seed-default-profiles': 'Seed default profiles',
	'require-sso': 'Require SSO',
	'require-sso-hint': 'Coming soon',
	preview: 'Preview',
	status: 'Status',
	active: 'Active',
	'untitled-organization': 'New organization',
	'assigned-after-creation': 'Assigned after creation',
	'preview-owners-checklist': '{{count}} owners get full access',
	'preview-members-checklist-detailed':
		'{{count}} members invited ({{csv}} CSV · {{manual}} manual)',
	'preview-default-profile-checklist': 'Default profile seeded',
	'preview-sso-not-required': 'SSO not required',
	'create-tenant-summary-owners': '{{count}} owner(s)',
	'create-tenant-summary-members': '{{count}} member(s)',
	'create-tenant-summary-suffix': 'will be invited on creation',
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

vi.mock('~/components/ui/switch', () => ({
	Switch: ({
		checked,
		disabled,
		onCheckedChange: _onCheckedChange,
		...props
	}: {
		checked?: boolean;
		disabled?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}) =>
		createElement('input', {
			type: 'checkbox',
			checked: Boolean(checked),
			disabled,
			readOnly: true,
			...props,
		}),
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
		Switch: ({
			name,
			label,
			description,
			isDisabled,
		}: {
			name: string;
			label: string;
			description?: string;
			isDisabled?: boolean;
		}) => {
			const { register } = useFormContext();

			return createElement(
				'label',
				undefined,
				createElement('span', undefined, label),
				description ? createElement('span', undefined, description) : null,
				createElement('input', {
					'aria-label': label,
					type: 'checkbox',
					disabled: isDisabled,
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

vi.mock('./tenants-new-xlsx', () => ({
	parseXlsxFile: mocks.parseXlsxFile,
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

const submitForm = () => {
	fireEvent.submit(
		screen.getByRole('button', { name: 'Create tenant' }).closest('form')!,
	);
};

const confirmCreate = async () => {
	const dialog = await screen.findByRole('alertdialog');
	fireEvent.click(
		within(dialog).getByRole('button', { name: 'Create tenant' }),
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

	test('renders the workspace slug field with the publyapp.com/ prefix', () => {
		renderPage();

		expect(screen.getAllByText('publyapp.com/').length).toBeGreaterThan(0);
		expect(
			screen.getByRole('textbox', { name: 'Workspace slug' }),
		).toBeTruthy();
	});

	test('renders one owner row tagged Primary by default, and the members/setup sections', () => {
		renderPage();

		expect(screen.getAllByText('Owners').length).toBeGreaterThan(0);
		expect(screen.getByText('Primary')).toBeTruthy();
		expect(getEmailInputs()).toHaveLength(1);
		expect(screen.getByText('Initial members (optional)')).toBeTruthy();
		expect(screen.getByText('Setup')).toBeTruthy();
		expect(
			screen.getByRole('link', { name: 'Download template' }),
		).toBeTruthy();
	});

	test('seed default profiles defaults on and require SSO is disabled with a hint', () => {
		renderPage();

		const seedSwitch = screen.getByRole('checkbox', {
			name: 'Seed default profiles',
		}) as HTMLInputElement;
		expect(seedSwitch.checked).toBe(true);

		const ssoSwitch = screen.getByRole('checkbox', {
			name: 'Require SSO',
		}) as HTMLInputElement;
		expect(ssoSwitch.disabled).toBe(true);
		expect(ssoSwitch.checked).toBe(false);
		expect(screen.getByText('Coming soon')).toBeTruthy();
	});

	test('adds and removes owner rows, tagging only the first as Primary', () => {
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Add owner' }));
		expect(getEmailInputs()).toHaveLength(2);
		expect(screen.getByText('Primary')).toBeTruthy();
		expect(screen.getAllByText('Owner')).toHaveLength(1);

		fireEvent.click(
			screen.getAllByRole('button', { name: 'Remove owner' })[1]!,
		);
		expect(getEmailInputs()).toHaveLength(1);
	});

	test('the sole remaining owner row cannot be removed', () => {
		renderPage();

		const removeButtons = screen.getAllByRole('button', {
			name: 'Remove owner',
		});
		expect(removeButtons).toHaveLength(1);
		expect((removeButtons[0] as HTMLButtonElement).disabled).toBe(true);
	});

	test('adds and removes manual member rows independently from owners', () => {
		renderPage();

		expect(getEmailInputs()).toHaveLength(1);

		fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
		expect(getEmailInputs()).toHaveLength(2);

		fireEvent.click(
			screen.getAllByRole('button', { name: 'Remove member' })[0]!,
		);
		expect(getEmailInputs()).toHaveLength(1);
	});

	test('a manual member set to the Admin role submits with accountLevel Admin', async () => {
		mocks.mutateAsync.mockResolvedValue({ id: 'tenant-001' });

		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
		fireEvent.change(getEmailInputs()[1]!, {
			target: { value: 'member@acme.com' },
		});
		fireEvent.change(screen.getByRole('combobox', { name: 'Account level' }), {
			target: { value: 'Admin' },
		});

		submitForm();

		await confirmCreate();

		await waitFor(() =>
			expect(mocks.mutateAsync).toHaveBeenCalledWith(
				expect.objectContaining({
					initialUsers: [
						{ email: 'owner@acme.com', accountLevel: 'Admin' },
						{ email: 'member@acme.com', accountLevel: 'Admin' },
					],
				}),
			),
		);
	});

	test('preview counts recompute live as owners and members are added', () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		expect(screen.getByTestId('preview-seats').textContent).toBe('1 / 5');
		expect(screen.getByTestId('preview-owners').textContent).toBe('1');
		expect(screen.getByTestId('preview-members').textContent).toBe('0');

		fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
		fireEvent.change(getEmailInputs()[1]!, {
			target: { value: 'member@acme.com' },
		});

		expect(screen.getByTestId('preview-seats').textContent).toBe('2 / 5');
		expect(screen.getByTestId('preview-owners').textContent).toBe('1');
		expect(screen.getByTestId('preview-members').textContent).toBe('1');
	});

	test('preview shows the Active status chip and the honest checklist', () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		const preview = screen.getByTestId('staff-tenant-create-preview');
		expect(within(preview).getByText('Active')).toBeTruthy();
		expect(
			screen.getByTestId('preview-checklist-owners').textContent,
		).toContain('1 owners get full access');
		expect(screen.getByTestId('preview-checklist-profile').textContent).toBe(
			'Default profile seeded',
		);
		expect(screen.getByTestId('preview-checklist-sso').textContent).toBe(
			'SSO not required',
		);
	});

	test('unchecking seed default profiles flips the preview checklist row to unchecked', () => {
		renderPage();

		expect(
			screen
				.getByTestId('preview-checklist-profile')
				.getAttribute('data-checked'),
		).toBe('true');

		fireEvent.click(
			screen.getByRole('checkbox', { name: 'Seed default profiles' }),
		);

		expect(
			screen
				.getByTestId('preview-checklist-profile')
				.getAttribute('data-checked'),
		).toBe('false');
	});

	test('the sticky bar summary is plural-aware for owners and members', () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		expect(screen.getByTestId('create-tenant-summary').textContent).toBe(
			'1 owner(s) · 0 member(s) will be invited on creation',
		);
	});

	test('shows a validation error when owner emails are duplicated', async () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
		fireEvent.change(getEmailInputs()[1]!, {
			target: { value: 'owner@acme.com' },
		});

		submitForm();

		await waitFor(() =>
			expect(
				screen.getByText('Each user must have a unique email address.'),
			).toBeTruthy(),
		);
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
	});

	test('shows a validation error when owners and members exceed seats', async () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
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

	test('shows a validation error for a malformed workspace slug', async () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'Workspace slug' }), {
			target: { value: 'Not Valid!' },
		});

		submitForm();

		await waitFor(() =>
			expect(
				screen.getByText(
					'Use lowercase letters, numbers, and hyphens only (3-40 characters).',
				),
			).toBeTruthy(),
		);
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
	});

	test('creates a tenant with owners and manual members merged into initialUsers, owners first', async () => {
		mocks.mutateAsync.mockResolvedValue({ id: 'tenant-001' });

		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'Workspace slug' }), {
			target: { value: 'acme-corp' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
		fireEvent.change(getEmailInputs()[1]!, {
			target: { value: 'member@acme.com' },
		});

		submitForm();

		await confirmCreate();

		await waitFor(() =>
			expect(mocks.mutateAsync).toHaveBeenCalledWith({
				name: 'Acme Corporation',
				maxUsers: 5,
				code: 'acme-corp',
				seedDefaultProfile: true,
				initialUsers: [
					{ email: 'owner@acme.com', accountLevel: 'Admin' },
					{ email: 'member@acme.com', accountLevel: 'User' },
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

	test('omits the code field from the submit body when the slug is left blank', async () => {
		mocks.mutateAsync.mockResolvedValue({ id: 'tenant-001' });

		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		submitForm();

		await confirmCreate();

		await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalled());
		const body = mocks.mutateAsync.mock.calls[0]![0];
		expect(body.code).toBeUndefined();
	});

	test('falls back to the tenants list when tenant id is missing in the create result', async () => {
		mocks.mutateAsync.mockResolvedValue({ name: 'Acme Corporation' });

		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		submitForm();

		await confirmCreate();

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
			target: { value: 'owner@acme.com' },
		});

		submitForm();

		await confirmCreate();

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
			target: { value: 'owner@acme.com' },
		});

		submitForm();

		await confirmCreate();

		await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalled());
		await waitFor(() =>
			expect(screen.getByText('Tenant name is already used.')).toBeTruthy(),
		);

		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});

	test('surfaces a server 422 code-already-taken failure on the workspace slug field', async () => {
		mocks.mutateAsync.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			detail: 'This workspace code is already taken',
			errors: { code: ['This workspace code is already taken'] },
		});

		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'Workspace slug' }), {
			target: { value: 'acme-corp' },
		});

		submitForm();

		await confirmCreate();

		await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalled());
		await waitFor(() =>
			expect(
				screen.getByText('This workspace code is already taken'),
			).toBeTruthy(),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('parses an uploaded CSV file and merges the valid rows into the submitted initialUsers', async () => {
		mocks.mutateAsync.mockResolvedValue({ id: 'tenant-001' });

		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		const csvContent = 'email,role\ncsv1@acme.com,user\nnot-an-email,user\n';
		const file = new File([csvContent], 'members.csv', { type: 'text/csv' });
		Object.defineProperty(file, 'text', {
			value: () => Promise.resolve(csvContent),
		});

		const fileInput = screen.getByLabelText(
			'Drag a CSV or Excel file, or browse',
		) as HTMLInputElement;
		fireEvent.change(fileInput, { target: { files: [file] } });

		await waitFor(() => expect(screen.getByText('members.csv')).toBeTruthy());
		expect(screen.getByText('2 members detected · 1 valid')).toBeTruthy();
		expect(screen.getByText('1 rows skipped (invalid email)')).toBeTruthy();
		expect(screen.getByTestId('preview-members').textContent).toBe('1');

		submitForm();

		await confirmCreate();

		await waitFor(() =>
			expect(mocks.mutateAsync).toHaveBeenCalledWith(
				expect.objectContaining({
					initialUsers: [
						{ email: 'owner@acme.com', accountLevel: 'Admin' },
						{ email: 'csv1@acme.com', accountLevel: 'User' },
					],
				}),
			),
		);
	});
});
