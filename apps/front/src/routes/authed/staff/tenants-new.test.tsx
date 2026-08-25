/** @vitest-environment jsdom */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react';
import { createElement, type ReactNode, type SubmitEventHandler } from 'react';
import { FormProvider, useFormContext } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	invalidateQueries: vi.fn(),
	mutateAsync: vi.fn(),
	updateTenantMutateAsync: vi.fn(),
	useCreateStaffTenantMutation: vi.fn(),
	useUpdateStaffTenantMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn((_: unknown) => false),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	blockerResolver: {
		status: 'idle' as 'idle' | 'blocked',
		proceed: undefined as (() => void) | undefined,
		reset: undefined as (() => void) | undefined,
	},
	capturedShouldBlockFn: undefined as (() => boolean) | undefined,
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
	'drag-csv-file': 'Drag a CSV file, or browse',
	'csv-columns-hint': 'Columns: email, role',
	'download-template': 'Download template',
	'parsed-file-summary': '{{detected}} members detected · {{valid}} valid',
	'parsed-file-invalid-rows': '{{count}} rows skipped (invalid email)',
	'parsed-file-duplicate-rows': '{{count}} rows skipped (already added)',
	'import-file-too-large': 'This file is too large. Choose a file under 2 MB.',
	'import-file-invalid-type': 'Unsupported file type. Choose a CSV file.',
	'import-file-parse-failed':
		"We couldn't read that file. Check the format and try again.",
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
	preview: 'Preview',
	status: 'Status',
	active: 'Active',
	pending: 'Pending',
	'untitled-organization': 'New organization',
	'assigned-after-creation': 'Assigned after creation',
	'preview-owners-checklist': '{{count}} owners get full access',
	'preview-members-checklist-detailed':
		'{{count}} members invited ({{csv}} CSV · {{manual}} manual)',
	'preview-default-profile-checklist': 'Default profile seeded',
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
	close: 'Close',
	'unsaved-changes-dialog-title': 'Leave without saving?',
	'unsaved-changes-dialog-description':
		'You have unsaved changes that will be lost if you leave this page.',
	'leave-page': 'Leave page',
	'organization-details': 'Organization details',
	'organization-details-optional-hint':
		'Optional — add these details now or edit them later.',
	'legal-name': 'Legal name',
	description: 'Description',
	'website-url': 'Website URL',
	'website-url-invalid': 'Enter a valid URL starting with http:// or https://',
	'billing-email': 'Billing email',
	'support-email': 'Support email',
	'default-locale': 'Default locale',
	timezone: 'Timezone',
	'internal-notes': 'Internal notes',
	'internal-notes-hint':
		'Visible to staff only — never shown to tenant members.',
	'not-set': 'Not set',
	'invalid-email-address': 'Invalid email address',
	'tenant-name-too-short': 'Enter at least 5 characters.',
	logo: 'Logo',
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
		options,
		useNavigate: () => mocks.navigate,
	}),
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) =>
		createElement('a', { href: to, ...props }, children),
	useBlocker: (opts: { shouldBlockFn: () => boolean }) => {
		mocks.capturedShouldBlockFn = opts.shouldBlockFn;
		return mocks.blockerResolver;
	},
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
		onSubmit?: SubmitEventHandler<HTMLFormElement>;
	}) =>
		createElement(FormProvider, {
			...methods,
			children: createElement('form', { onSubmit }, children),
		}),
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
			const {
				register,
				formState: { errors },
			} = useFormContext();
			const message = (errors[name] as { message?: string } | undefined)
				?.message;

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
				message ? createElement('span', undefined, message) : null,
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
		Textarea: ({
			name,
			label,
			helperText,
			isDisabled,
		}: {
			name: string;
			label: string;
			helperText?: string;
			isDisabled?: boolean;
		}) => {
			const { register } = useFormContext();

			return createElement(
				'label',
				undefined,
				createElement('span', undefined, label),
				helperText ? createElement('span', undefined, helperText) : null,
				createElement('textarea', {
					'aria-label': label,
					disabled: isDisabled,
					...register(name),
				}),
			);
		},
		Select: ({
			name,
			label,
			options,
			isDisabled,
		}: {
			name: string;
			label: string;
			options: { value: string; label: string }[];
			isDisabled?: boolean;
		}) => {
			const { register } = useFormContext();

			return createElement(
				'label',
				undefined,
				createElement('span', undefined, label),
				createElement(
					'select',
					{
						'aria-label': label,
						disabled: isDisabled,
						...register(name),
					},
					options.map((option) =>
						createElement(
							'option',
							{ key: option.value, value: option.value },
							option.label,
						),
					),
				),
			);
		},
		ImageUpload: ({
			name,
			label,
			isDisabled,
		}: {
			name: string;
			label: string;
			previewName?: string;
			isDisabled?: boolean;
		}) => {
			const { register } = useFormContext();

			return createElement(
				'label',
				undefined,
				createElement('span', undefined, label),
				createElement('input', {
					'aria-label': label,
					disabled: isDisabled,
					type: 'text',
					...register(name),
				}),
			);
		},
	},
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateStaffTenants: (queryClient: {
		invalidateQueries: (arg: unknown) => void;
	}) =>
		queryClient.invalidateQueries({
			queryKey: ['staff', 'staff-tenants'],
		}),
	useCreateStaffTenantMutation: mocks.useCreateStaffTenantMutation,
	useUpdateStaffTenantMutation: mocks.useUpdateStaffTenantMutation,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/lib/mutation-toast', () => ({
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		error: mocks.toastError,
	},
}));

import { Route } from './tenants-new';

const renderPage = () => {
	const Component = Route.options.component as () => ReturnType<
		typeof createElement
	>;

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

/**
 * The create form's Zod resolver validates asynchronously, so the confirm
 * dialog does not open synchronously with `submitForm()` — a bare
 * `waitFor(() => expect(dialog).toBeNull())` would pass trivially on its
 * very first (pre-validation) check and never actually prove the submission
 * was rejected. This settles past that validation tick with a real delay
 * before asserting the dialog never opened, so a validation regression that
 * lets the dialog open can't hide behind the race.
 */
const expectFormSubmissionBlocked = async () => {
	await new Promise((resolve) => {
		setTimeout(resolve, 50);
	});
	expect(screen.queryByRole('alertdialog')).toBeNull();
	expect(mocks.mutateAsync).not.toHaveBeenCalled();
};

describe('staff tenant create route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.blockerResolver.status = 'idle';
		mocks.blockerResolver.proceed = undefined;
		mocks.blockerResolver.reset = undefined;
		mocks.capturedShouldBlockFn = undefined;
		mocks.useCreateStaffTenantMutation.mockReturnValue({
			mutateAsync: mocks.mutateAsync,
			isPending: false,
		});
		mocks.useUpdateStaffTenantMutation.mockReturnValue({
			mutateAsync: mocks.updateTenantMutateAsync,
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
			screen.getByRole('button', { name: 'Download template' }),
		).toBeTruthy();
	});

	test('renders the optional Organization details section between Organization and Owners with the legal name, description, website, contact, regional, and notes fields', () => {
		renderPage();

		expect(screen.getByText('Organization details')).toBeTruthy();
		expect(
			screen.getByText('Optional — add these details now or edit them later.'),
		).toBeTruthy();
		expect(screen.getByRole('textbox', { name: 'Legal name' })).toBeTruthy();
		expect(screen.getByRole('textbox', { name: 'Description' })).toBeTruthy();
		expect(screen.getByRole('textbox', { name: 'Website URL' })).toBeTruthy();
		expect(screen.getByRole('textbox', { name: 'Billing email' })).toBeTruthy();
		expect(screen.getByRole('textbox', { name: 'Support email' })).toBeTruthy();
		expect(screen.getByLabelText('Default locale')).toBeTruthy();
		expect(screen.getByLabelText('Timezone')).toBeTruthy();
		expect(
			screen.getByRole('textbox', { name: 'Internal notes' }),
		).toBeTruthy();
		expect(
			screen.getByText(
				'Visible to staff only — never shown to tenant members.',
			),
		).toBeTruthy();
	});

	test('seed default profiles defaults on', () => {
		renderPage();

		const seedSwitch = screen.getByRole('checkbox', {
			name: 'Seed default profiles',
		}) as HTMLInputElement;
		expect(seedSwitch.checked).toBe(true);
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

	test('disables Add owner once owners + manual members reach the seat cap (F10)', () => {
		renderPage();

		fireEvent.change(screen.getByLabelText('Seats'), {
			target: { value: '3' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
		fireEvent.click(screen.getByRole('button', { name: 'Add member' }));

		expect(
			(screen.getByRole('button', { name: 'Add owner' }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
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

	test('preview shows the Pending status chip (tenants are created Pending) and the honest checklist', () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		const preview = screen.getByTestId('staff-tenant-create-preview');
		expect(within(preview).getByText('Pending')).toBeTruthy();
		expect(within(preview).queryByText('Active')).toBeNull();
		expect(
			screen.getByTestId('preview-checklist-owners').textContent,
		).toContain('1 owners get full access');
		expect(screen.getByTestId('preview-checklist-profile').textContent).toBe(
			'Default profile seeded',
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

	test('blocks submission when the organization name is under 5 characters (name.min(5))', async () => {
		renderPage();

		fillOrganizationName('Ac');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		submitForm();

		await expectFormSubmissionBlocked();
	});

	// tenants-r6-F1: create and edit must enforce the SAME contract as the API
	// (min 5, max 256 — TenantValidationRules.NameMaxLength), so these boundary
	// cases pin the exact edges instead of only the pre-existing under-5 case.
	test('blocks submission at exactly 4 characters (one below the API minimum)', async () => {
		renderPage();

		fillOrganizationName('Acme');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		submitForm();

		await expectFormSubmissionBlocked();
	});

	test('accepts exactly 5 characters (the API minimum)', async () => {
		mocks.mutateAsync.mockResolvedValue({ id: 'tenant-001' });
		renderPage();

		fillOrganizationName('Acme1');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		submitForm();
		await confirmCreate();

		await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalled());
	});

	test('accepts exactly 256 characters (the API maximum)', async () => {
		mocks.mutateAsync.mockResolvedValue({ id: 'tenant-001' });
		renderPage();

		fillOrganizationName('A'.repeat(256));
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		submitForm();
		await confirmCreate();

		await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalled());
	});

	test('blocks submission at 257 characters (one above the API maximum) instead of round-tripping a 422', async () => {
		renderPage();

		fillOrganizationName('A'.repeat(257));
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		submitForm();

		await expectFormSubmissionBlocked();
	});

	test('blocks submission when the website URL is invalid (websiteUrl schema rule)', async () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'Website URL' }), {
			target: { value: 'not-a-url' },
		});

		submitForm();

		await waitFor(() => expect(mocks.mutateAsync).not.toHaveBeenCalled());
	});

	test('blocks submission when the billing email is invalid (billingEmail schema rule)', async () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'Billing email' }), {
			target: { value: 'not-an-email' },
		});

		submitForm();

		await waitFor(() => expect(mocks.mutateAsync).not.toHaveBeenCalled());
	});

	test('blocks submission when the support email is invalid (supportEmail schema rule)', async () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'Support email' }), {
			target: { value: 'not-an-email' },
		});

		submitForm();

		await waitFor(() => expect(mocks.mutateAsync).not.toHaveBeenCalled());
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

	test('sends the uploaded logo in the create body', async () => {
		mocks.mutateAsync.mockResolvedValue({ id: 'tenant-001' });

		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});
		fireEvent.change(screen.getByLabelText('Logo'), {
			target: { value: 'https://cdn.example.com/logo.png' },
		});

		submitForm();
		await confirmCreate();

		await waitFor(() =>
			expect(mocks.mutateAsync).toHaveBeenCalledWith(
				expect.objectContaining({
					logoUrl: 'https://cdn.example.com/logo.png',
				}),
			),
		);
		expect(mocks.updateTenantMutateAsync).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/tenants/$tenantId',
				params: { tenantId: 'tenant-001' },
			}),
		);
	});

	test('omits the logo from the create body when none was uploaded', async () => {
		mocks.mutateAsync.mockResolvedValue({ id: 'tenant-001' });

		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		submitForm();
		await confirmCreate();

		await waitFor(() =>
			expect(mocks.mutateAsync).toHaveBeenCalledWith(
				expect.objectContaining({ logoUrl: undefined }),
			),
		);
		expect(mocks.updateTenantMutateAsync).not.toHaveBeenCalled();
	});

	test('includes the trimmed organization details fields in the submit body when filled', async () => {
		mocks.mutateAsync.mockResolvedValue({ id: 'tenant-001' });

		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'Legal name' }), {
			target: { value: '  Acme Corporation Ltd  ' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'Website URL' }), {
			target: { value: '  https://acme.com  ' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'Billing email' }), {
			target: { value: '  billing@acme.com  ' },
		});
		fireEvent.change(screen.getByLabelText('Default locale'), {
			target: { value: 'fr' },
		});

		expect(screen.getByText('acme.com')).toBeTruthy();

		submitForm();
		await confirmCreate();

		await waitFor(() =>
			expect(mocks.mutateAsync).toHaveBeenCalledWith(
				expect.objectContaining({
					legalName: 'Acme Corporation Ltd',
					websiteUrl: 'https://acme.com',
					billingEmail: 'billing@acme.com',
					defaultLocale: 'fr',
				}),
			),
		);
	});

	test('omits the organization details fields from the submit body when left blank', async () => {
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
		expect(body.legalName).toBeUndefined();
		expect(body.description).toBeUndefined();
		expect(body.websiteUrl).toBeUndefined();
		expect(body.billingEmail).toBeUndefined();
		expect(body.supportEmail).toBeUndefined();
		expect(body.defaultLocale).toBeUndefined();
		expect(body.timezone).toBeUndefined();
		expect(body.notes).toBeUndefined();
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

	test('leaves ordinary non-401 failure feedback to the central toast owner', async () => {
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
		expect(screen.queryByText('Tenant name is already used.')).toBeNull();

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

	test('maps a server validation error for a known create field inline', async () => {
		mocks.mutateAsync.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			detail: 'The tenant payload is invalid.',
			errors: { Name: ['This organization name is unavailable.'] },
		});

		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});
		submitForm();
		await confirmCreate();

		await waitFor(() =>
			expect(
				screen.getByText('This organization name is unavailable.'),
			).toBeTruthy(),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
	});

	test('shows unmappable initial-user validation in an inline form summary', async () => {
		mocks.mutateAsync.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			detail: 'The tenant payload is invalid.',
			errors: {
				InitialUsers: ['One or more initial users cannot be invited.'],
			},
		});

		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});
		submitForm();
		await confirmCreate();

		await waitFor(() =>
			expect(
				screen.getByRole('alert', {
					name: 'One or more initial users cannot be invited.',
				}),
			).toBeTruthy(),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
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
			'Drag a CSV file, or browse',
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

	test('shows a duplicate-rows hint when the CSV re-lists an already-added member (r3-tenants-F13)', async () => {
		renderPage();

		fillOrganizationName('Acme Corporation');
		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		const csvContent = 'email,role\ncsv1@acme.com,user\nowner@acme.com,user\n';
		const file = new File([csvContent], 'members.csv', { type: 'text/csv' });
		Object.defineProperty(file, 'text', {
			value: () => Promise.resolve(csvContent),
		});

		const fileInput = screen.getByLabelText(
			'Drag a CSV file, or browse',
		) as HTMLInputElement;
		fireEvent.change(fileInput, { target: { files: [file] } });

		await waitFor(() => expect(screen.getByText('members.csv')).toBeTruthy());
		expect(screen.getByText('2 members detected · 1 valid')).toBeTruthy();
		expect(screen.getByText('1 rows skipped (already added)')).toBeTruthy();
	});

	test('rejects an oversized import file via the file input without reading it', () => {
		renderPage();

		const csvContent = 'email,role\ncsv1@acme.com,user\n';
		const file = new File([csvContent], 'members.csv', { type: 'text/csv' });
		Object.defineProperty(file, 'size', { value: 3_000_000 });
		const textSpy = vi.fn(() => Promise.resolve(csvContent));
		Object.defineProperty(file, 'text', { value: textSpy });

		const fileInput = screen.getByLabelText(
			'Drag a CSV file, or browse',
		) as HTMLInputElement;
		fireEvent.change(fileInput, { target: { files: [file] } });

		expect(
			screen.getByText('This file is too large. Choose a file under 2 MB.'),
		).toBeTruthy();
		expect(textSpy).not.toHaveBeenCalled();
		expect(screen.queryByTestId('tenant-member-parsed-summary')).toBeNull();
	});

	test('rejects an unsupported file type via the file input without reading it', () => {
		renderPage();

		const file = new File(['%PDF-1.4'], 'members.pdf', {
			type: 'application/pdf',
		});
		const textSpy = vi.fn(() => Promise.resolve('%PDF-1.4'));
		Object.defineProperty(file, 'text', { value: textSpy });

		const fileInput = screen.getByLabelText(
			'Drag a CSV file, or browse',
		) as HTMLInputElement;
		fireEvent.change(fileInput, { target: { files: [file] } });

		expect(
			screen.getByText('Unsupported file type. Choose a CSV file.'),
		).toBeTruthy();
		expect(textSpy).not.toHaveBeenCalled();
	});

	test('rejects a .xlsx file — spreadsheet import was dropped for known CVEs (round-1 review shell-F1)', () => {
		renderPage();

		const file = new File(['not-real-xlsx-bytes'], 'members.xlsx', {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		});
		const textSpy = vi.fn(() => Promise.resolve('not-real-xlsx-bytes'));
		Object.defineProperty(file, 'text', { value: textSpy });

		const fileInput = screen.getByLabelText(
			'Drag a CSV file, or browse',
		) as HTMLInputElement;
		fireEvent.change(fileInput, { target: { files: [file] } });

		expect(
			screen.getByText('Unsupported file type. Choose a CSV file.'),
		).toBeTruthy();
		expect(textSpy).not.toHaveBeenCalled();
	});

	test('rejects an oversized file dropped onto the dropzone without reading it', () => {
		renderPage();

		const csvContent = 'email,role\ncsv1@acme.com,user\n';
		const file = new File([csvContent], 'members.csv', { type: 'text/csv' });
		Object.defineProperty(file, 'size', { value: 3_000_000 });
		const textSpy = vi.fn(() => Promise.resolve(csvContent));
		Object.defineProperty(file, 'text', { value: textSpy });

		fireEvent.drop(screen.getByTestId('tenant-member-dropzone'), {
			dataTransfer: { files: [file] },
		});

		expect(
			screen.getByText('This file is too large. Choose a file under 2 MB.'),
		).toBeTruthy();
		expect(textSpy).not.toHaveBeenCalled();
	});

	test('the nav-guard shouldBlockFn blocks while the form is dirty and stops blocking once the tenant is created', async () => {
		mocks.mutateAsync.mockResolvedValue({ id: 'tenant-001' });

		renderPage();

		expect(mocks.capturedShouldBlockFn?.()).toBe(false);

		fillOrganizationName('Acme Corporation');
		expect(mocks.capturedShouldBlockFn?.()).toBe(true);

		fireEvent.change(getEmailInputs()[0]!, {
			target: { value: 'owner@acme.com' },
		});

		submitForm();
		await confirmCreate();

		await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
		expect(mocks.capturedShouldBlockFn?.()).toBe(false);
	});

	// tenants-r6-F3: `isDirty` only tracks RHF-registered fields; a populated
	// CSV/Excel import lives in separate `parsedFile` state, so an
	// otherwise-pristine form used to let an import-only navigation through
	// the nav guard without confirmation.
	test('the nav-guard shouldBlockFn blocks after an import-only change, with no RHF field touched', async () => {
		renderPage();

		expect(mocks.capturedShouldBlockFn?.()).toBe(false);

		const csvContent = 'email,role\ncsv1@acme.com,user\n';
		const file = new File([csvContent], 'members.csv', { type: 'text/csv' });
		Object.defineProperty(file, 'text', {
			value: () => Promise.resolve(csvContent),
		});

		const fileInput = screen.getByLabelText(
			'Drag a CSV file, or browse',
		) as HTMLInputElement;
		fireEvent.change(fileInput, { target: { files: [file] } });

		await waitFor(() => expect(screen.getByText('members.csv')).toBeTruthy());

		expect(mocks.capturedShouldBlockFn?.()).toBe(true);
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

		const dialog = screen.getByRole('alertdialog');
		fireEvent.click(
			dialog.querySelector('[aria-label="Close"]') as HTMLElement,
		);
		expect(reset).toHaveBeenCalled();
		expect(proceed).not.toHaveBeenCalled();
	});
});
