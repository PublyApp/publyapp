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
import type { JSX, ReactNode, SubmitEventHandler } from 'react';
import { createElement } from 'react';
import { FormProvider, useFormContext } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	navigate: vi.fn(),
	updateTenantMutation: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	useUpdateStaffTenantMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn<(error: unknown) => boolean>(() => false),
	useBlocker: vi.fn(),
	blockerResolver: {
		status: 'idle' as 'idle' | 'blocked',
		proceed: undefined as (() => void) | undefined,
		reset: undefined as (() => void) | undefined,
	},
	capturedShouldBlockFn: undefined as (() => boolean) | undefined,
}));

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
	buttonVariants: () => '',
}));

vi.mock('~/components/ui/card', () => ({
	Card: ({ children, ...props }: { children: ReactNode }) =>
		createElement('div', props, children),
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
	Field: {
		Text: ({
			name,
			label,
			isDisabled,
			type,
		}: {
			name: string;
			label: string;
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
			isDisabled,
		}: {
			name: string;
			label: string;
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
					type: 'email',
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
	FormPageLayout: ({ children, ...props }: { children: ReactNode }) =>
		createElement('div', props, children),
	FormActionBar: ({ children, ...props }: { children: ReactNode }) =>
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
		options,
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
	useBlocker: (opts: { shouldBlockFn: () => boolean }) => {
		mocks.capturedShouldBlockFn = opts.shouldBlockFn;
		return mocks.blockerResolver;
	},
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				'back-to-tenant': 'Back to tenant',
				organization: 'Organization',
				'organization-name': 'Organization name',
				'workspace-slug': 'Workspace slug',
				'workspace-slug-immutable-hint': "The workspace slug can't be changed",
				seats: 'Seats',
				logo: 'Logo',
				'logo-url': 'Logo URL',
				'clear-logo': 'Clear logo',
				identity: 'Identity',
				'legal-name': 'Legal name',
				description: 'Description',
				'website-url': 'Website URL',
				contact: 'Contact',
				'billing-email': 'Billing email',
				'support-email': 'Support email',
				regional: 'Regional',
				'default-locale': 'Default locale',
				timezone: 'Timezone',
				'not-set': 'Not set',
				'internal-notes': 'Internal notes',
				'internal-notes-hint':
					'Visible to staff only — never shown to tenant members.',
				preview: 'Preview',
				status: 'Status',
				unknown: 'Unknown',
				owners: 'Owners',
				members: 'Members',
				created: 'Created',
				updated: 'Updated',
				'last-active': 'Last active',
				'seats-below-current-members-warning':
					'Fewer seats than the current members',
				'save-changes': 'Save changes',
				cancel: 'Cancel',
				close: 'Close',
				'reset-to-saved': 'Reset',
				'unsaved-changes': 'Unsaved changes',
				'unsaved-changes-dialog-title': 'Leave without saving?',
				'unsaved-changes-dialog-description':
					'You have unsaved changes that will be lost if you leave this page.',
				'leave-page': 'Leave page',
				'tenant-update-failed': 'Unable to save tenant.',
				tenant: 'Tenant',
				'edit-item': 'Edit Tenant',
				'edit-tenant-description': 'Update this tenant’s core details.',
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

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateStaffTenants: (queryClient: {
		invalidateQueries: (arg: unknown) => void;
	}) =>
		queryClient.invalidateQueries({
			queryKey: ['staff', 'staff-tenants'],
		}),
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
	useUpdateStaffTenantMutation: mocks.useUpdateStaffTenantMutation,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
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
const RouteComponent = Route.options.component as () => JSX.Element;

const renderPage = () => {
	return render(<RouteComponent />);
};

const buildTenant = (overrides: Record<string, unknown> = {}) => ({
	id: '11111111-1111-1111-1111-111111111111',
	name: 'Acme Corporation',
	code: 'ACME',
	status: 'Active',
	usersCount: 12,
	maxUsers: 12,
	ownersCount: 2,
	logoUrl: 'https://cdn.example.com/acme.png',
	legalName: 'Acme Corporation Ltd',
	description: 'A social media platform',
	websiteUrl: 'https://acme.com',
	billingEmail: 'billing@acme.com',
	supportEmail: 'support@acme.com',
	defaultLocale: 'en',
	timezone: 'Europe/Paris',
	notes: 'Handled by the enterprise team.',
	lastActivityAt: new Date('2026-07-11T09:00:00Z'),
	createdAt: new Date('2026-07-01T09:00:00Z'),
	updatedAt: new Date('2026-07-02T10:00:00Z'),
	...overrides,
});

describe('staff tenant edit route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.blockerResolver.status = 'idle';
		mocks.blockerResolver.proceed = undefined;
		mocks.blockerResolver.reset = undefined;
		mocks.capturedShouldBlockFn = undefined;
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.useUpdateStaffTenantMutation.mockReturnValue({
			mutateAsync: mocks.updateTenantMutation,
			isPending: false,
		});
		mocks.toStaffTenantDetails.mockImplementation(() => buildTenant());
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: buildTenant(),
			}),
		);
	});

	afterEach(() => {
		cleanup();
	});

	test('renders the not-found view without logging out for a malformed id', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 400,
					responseStatusCode: 400,
					title: 'Bad Request',
					detail: 'Invalid tenantId',
					translationKey: 'malformed-id',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenant-details-not-found')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders a local not found view for 404 failures', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 404,
					responseStatusCode: 404,
					title: 'Not Found',
					detail: 'Missing tenant',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenant-details-not-found')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders forbidden without logging out for 403 failures', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 403,
					responseStatusCode: 403,
					title: 'Forbidden',
					detail: 'Forbidden',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('forbidden-view')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders the details error view without logging out for ordinary problem failures', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 500,
					responseStatusCode: 500,
					title: 'Server Error',
					detail: 'Unexpected failure',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenant-details-error')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('does not reset unsaved edits when tenant query data is remapped on rerender', () => {
		const renderResult = renderPage();
		const nameInput = screen.getByLabelText(
			'Organization name',
		) as HTMLInputElement;

		fireEvent.change(nameInput, {
			target: { value: 'Acme Corporation Edited' },
		});

		renderResult.rerender(<RouteComponent />);

		expect(
			(screen.getByLabelText('Organization name') as HTMLInputElement).value,
		).toBe('Acme Corporation Edited');
	});

	test('keeps a dirty field but applies a genuine refetch change to other fields (r5-tenants-F2)', () => {
		const renderResult = renderPage();
		const nameInput = screen.getByLabelText(
			'Organization name',
		) as HTMLInputElement;

		fireEvent.change(nameInput, {
			target: { value: 'Acme Corporation Edited' },
		});

		// A real background refetch: another admin raised the seat count while
		// this tab was unfocused. This changes tenantFormValues' identity,
		// unlike the byte-identical-data rerender above.
		const refetchedTenant = buildTenant({ maxUsers: 40 });
		mocks.toStaffTenantDetails.mockImplementation(() => refetchedTenant);
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({ data: refetchedTenant }),
		);

		renderResult.rerender(<RouteComponent />);

		expect(
			(screen.getByLabelText('Organization name') as HTMLInputElement).value,
		).toBe('Acme Corporation Edited');
		expect((screen.getByLabelText('Seats') as HTMLInputElement).value).toBe(
			'40',
		);
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

	test('disables Save on a pristine form and enables it once a field is edited (r3-tenants-F17)', () => {
		renderPage();

		const saveButton = screen.getByRole('button', {
			name: 'Save changes',
		}) as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);

		fireEvent.change(screen.getByLabelText('Organization name'), {
			target: { value: 'Acme Corporation Updated' },
		});

		expect(saveButton.disabled).toBe(false);
	});

	test('renders the Identity, Contact, Regional, and Internal notes sections with the tenant values', () => {
		renderPage();

		expect(screen.getByText('Identity')).toBeTruthy();
		expect(screen.getByDisplayValue('Acme Corporation Ltd')).toBeTruthy();
		expect(screen.getByDisplayValue('A social media platform')).toBeTruthy();
		expect(screen.getByDisplayValue('https://acme.com')).toBeTruthy();

		expect(screen.getByText('Contact')).toBeTruthy();
		expect(screen.getByDisplayValue('billing@acme.com')).toBeTruthy();
		expect(screen.getByDisplayValue('support@acme.com')).toBeTruthy();

		expect(screen.getByText('Regional')).toBeTruthy();
		expect(
			(screen.getByLabelText('Default locale') as HTMLSelectElement).value,
		).toBe('en');
		expect((screen.getByLabelText('Timezone') as HTMLSelectElement).value).toBe(
			'Europe/Paris',
		);

		expect(screen.getByText('Internal notes')).toBeTruthy();
		expect(
			screen.getByDisplayValue('Handled by the enterprise team.'),
		).toBeTruthy();
		expect(
			screen.getByText(
				'Visible to staff only — never shown to tenant members.',
			),
		).toBeTruthy();
	});

	test('shows the copy-slug affordance and the metadata footer with created, updated, and last active', () => {
		renderPage();

		expect(screen.getByTestId('edit-tenant-slug').textContent).toBe('ACME');
		const metadata = screen.getByTestId('edit-tenant-metadata').textContent;
		expect(metadata).toContain('Created');
		expect(metadata).toContain('Updated');
		expect(metadata).toContain('Last active');
	});

	test('clears the logo via a tri-state PATCH null when emptied and dirty', async () => {
		mocks.updateTenantMutation.mockResolvedValue({
			tenantId: '11111111-1111-1111-1111-111111111111',
		});

		renderPage();

		fireEvent.change(screen.getByLabelText('Logo'), {
			target: { value: '' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mocks.updateTenantMutation).toHaveBeenCalledWith(
				expect.objectContaining({ logoUrl: null }),
			),
		);
	});

	test('sends the uploaded logo URL when the field changes', async () => {
		mocks.updateTenantMutation.mockResolvedValue({
			tenantId: '11111111-1111-1111-1111-111111111111',
		});

		renderPage();

		fireEvent.change(screen.getByLabelText('Logo'), {
			target: { value: 'https://cdn.example.com/new-logo.png' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mocks.updateTenantMutation).toHaveBeenCalledWith(
				expect.objectContaining({
					logoUrl: 'https://cdn.example.com/new-logo.png',
				}),
			),
		);
	});

	test('warns when seats are set below the current member count without blocking submission', () => {
		renderPage();

		fireEvent.change(screen.getByLabelText('Seats'), {
			target: { value: '5' },
		});

		expect(screen.getByTestId('edit-tenant-seats-warning')).toBeTruthy();
	});

	test('submits changed tenant values and navigates to tenant details on success', async () => {
		mocks.updateTenantMutation.mockResolvedValue({
			tenantId: '11111111-1111-1111-1111-111111111111',
		});

		renderPage();

		fireEvent.change(screen.getByLabelText('Seats'), {
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
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-tenants'],
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

	test('clears the legal name via a tri-state PATCH null when emptied and dirty', async () => {
		mocks.updateTenantMutation.mockResolvedValue({
			tenantId: '11111111-1111-1111-1111-111111111111',
		});

		renderPage();

		fireEvent.change(screen.getByLabelText('Legal name'), {
			target: { value: '' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mocks.updateTenantMutation).toHaveBeenCalledWith(
				expect.objectContaining({ legalName: null }),
			),
		);
	});

	test('sends a trimmed value for legal name when changed', async () => {
		mocks.updateTenantMutation.mockResolvedValue({
			tenantId: '11111111-1111-1111-1111-111111111111',
		});

		renderPage();

		fireEvent.change(screen.getByLabelText('Legal name'), {
			target: { value: '  Acme Holdings  ' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mocks.updateTenantMutation).toHaveBeenCalledWith(
				expect.objectContaining({ legalName: 'Acme Holdings' }),
			),
		);
	});

	test('does not include untouched optional fields in the PATCH payload', async () => {
		mocks.updateTenantMutation.mockResolvedValue({
			tenantId: '11111111-1111-1111-1111-111111111111',
		});

		renderPage();

		fireEvent.change(screen.getByLabelText('Seats'), {
			target: { value: '25' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() => expect(mocks.updateTenantMutation).toHaveBeenCalled());
		const payload = mocks.updateTenantMutation.mock.calls[0]![0];
		expect(payload.legalName).toBeUndefined();
		expect(payload.description).toBeUndefined();
		expect(payload.websiteUrl).toBeUndefined();
		expect(payload.billingEmail).toBeUndefined();
		expect(payload.supportEmail).toBeUndefined();
		expect(payload.defaultLocale).toBeUndefined();
		expect(payload.timezone).toBeUndefined();
		expect(payload.notes).toBeUndefined();
	});

	// tenants-r6-F1: create and edit must enforce the SAME contract as the API
	// (min 5, max 256 — TenantValidationRules.NameMaxLength). Edit previously
	// allowed 1-4 characters and rejected anything over 128; these boundary
	// cases pin the exact edges the API actually enforces.
	test('blocks submission at exactly 4 characters (one below the API minimum)', async () => {
		renderPage();

		fireEvent.change(screen.getByLabelText('Organization name'), {
			target: { value: 'Acme' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mocks.updateTenantMutation).not.toHaveBeenCalled(),
		);
	});

	test('accepts exactly 5 characters (the API minimum)', async () => {
		mocks.updateTenantMutation.mockResolvedValue({
			tenantId: '11111111-1111-1111-1111-111111111111',
		});
		renderPage();

		fireEvent.change(screen.getByLabelText('Organization name'), {
			target: { value: 'Acme1' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mocks.updateTenantMutation).toHaveBeenCalledWith(
				expect.objectContaining({ name: 'Acme1' }),
			),
		);
	});

	test('accepts exactly 256 characters (the API maximum, previously rejected at 128)', async () => {
		mocks.updateTenantMutation.mockResolvedValue({
			tenantId: '11111111-1111-1111-1111-111111111111',
		});
		renderPage();

		const longName = 'A'.repeat(256);
		fireEvent.change(screen.getByLabelText('Organization name'), {
			target: { value: longName },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mocks.updateTenantMutation).toHaveBeenCalledWith(
				expect.objectContaining({ name: longName }),
			),
		);
	});

	test('blocks submission at 257 characters (one above the API maximum) instead of round-tripping a 422', async () => {
		renderPage();

		fireEvent.change(screen.getByLabelText('Organization name'), {
			target: { value: 'A'.repeat(257) },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mocks.updateTenantMutation).not.toHaveBeenCalled(),
		);
	});

	test('the reset-to-saved button restores saved values and hides once the form is clean', () => {
		renderPage();

		expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();

		fireEvent.change(screen.getByLabelText('Organization name'), {
			target: { value: 'Acme Corporation Edited' },
		});
		expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

		expect(
			(screen.getByLabelText('Organization name') as HTMLInputElement).value,
		).toBe('Acme Corporation');
		expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
	});

	test('the nav-guard shouldBlockFn blocks while dirty and stops blocking once the save completes', async () => {
		mocks.updateTenantMutation.mockResolvedValue({
			tenantId: '11111111-1111-1111-1111-111111111111',
		});

		renderPage();

		expect(mocks.capturedShouldBlockFn?.()).toBe(false);

		fireEvent.change(screen.getByLabelText('Organization name'), {
			target: { value: 'Acme Corporation Edited' },
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

		const dialog = screen.getByRole('alertdialog');
		fireEvent.click(
			dialog.querySelector('[aria-label="Close"]') as HTMLElement,
		);
		expect(reset).toHaveBeenCalled();
		expect(proceed).not.toHaveBeenCalled();
	});

	test('keeps server-side field validation inline without a duplicate general result', async () => {
		const updateError = {
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			detail: 'The tenant payload is invalid.',
			errors: { MaxUsers: ['Seats must be at least the current user count.'] },
		};
		mocks.updateTenantMutation.mockRejectedValue(updateError);

		renderPage();

		fireEvent.change(screen.getByLabelText('Seats'), {
			target: { value: '25' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(
				screen.getByText('Seats must be at least the current user count.'),
			).toBeTruthy(),
		);
		expect(screen.queryByText('The tenant payload is invalid.')).toBeNull();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.shouldLogoutForFailure).toHaveBeenCalled();
	});

	test('promotes unmapped and root validation messages to a summary while preserving mapped field messages', async () => {
		const updateError = {
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			detail: 'The tenant payload is invalid.',
			errors: {
				maxUsers: [
					'Seats must be at least the current user count.',
					'Seats must be greater than zero.',
				],
				TenantId: ['Tenant is no longer active.'],
				'': ['The request was rejected by a tenant policy.'],
			},
		};
		mocks.updateTenantMutation.mockRejectedValue(updateError);

		renderPage();

		fireEvent.change(screen.getByLabelText('Seats'), {
			target: { value: '25' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(
				screen.getByText(
					'Seats must be at least the current user count. Seats must be greater than zero.',
				),
			).toBeTruthy(),
		);
		const summary = screen.getByRole('alert');
		expect(summary.textContent).toContain(
			'Tenant is no longer active. The request was rejected by a tenant policy.',
		);
		expect(screen.queryByText('The tenant payload is invalid.')).toBeNull();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('leaves ordinary update failures to the central toast owner', async () => {
		mocks.updateTenantMutation.mockRejectedValue({
			status: 500,
			responseStatusCode: 500,
			title: 'Update failed',
			detail: 'Tenant update is temporarily unavailable.',
		});

		renderPage();

		fireEvent.change(screen.getByLabelText('Seats'), {
			target: { value: '25' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() => expect(mocks.updateTenantMutation).toHaveBeenCalled());
		expect(
			screen.queryByText('Tenant update is temporarily unavailable.'),
		).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
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

		fireEvent.change(screen.getByLabelText('Seats'), {
			target: { value: '25' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
	});
});
