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
import {
	createElement,
	type ChangeEvent,
	type SubmitEventHandler,
	type ReactNode,
} from 'react';
import { Controller, FormProvider, useFormContext } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	navigate: vi.fn(),
	useCreateStaffRoleMutation: vi.fn(),
	useStaffPermissionCatalogQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn((_: unknown) => false),
	blockerResolver: {
		status: 'idle' as 'idle' | 'blocked',
		proceed: undefined as (() => void) | undefined,
		reset: undefined as (() => void) | undefined,
	},
	capturedShouldBlockFn: undefined as (() => boolean) | undefined,
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
		t: (key: string) => {
			const labels: TestLabelMap = {
				'staff-roles': 'Staff roles',
				'new-item': 'New role',
				'role-name': 'Role name',
				description: 'Description',
				permissions: 'Permissions',
				'create-role': 'Create role',
				'back-to-staff-roles': 'Back to staff roles',
				'role-created-successfully': 'Role created successfully',
				'unable-to-load-staff-permissions': 'Unable to load staff permissions.',
				'role-save-failed': 'Unable to save the role.',
				'unsaved-changes-dialog-title': 'Leave without saving?',
				'unsaved-changes-dialog-description':
					'You have unsaved changes that will be lost if you leave this page.',
				'leave-page': 'Leave page',
				cancel: 'Cancel',
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

// #980: the create form embeds the shared role-style picker. The mock
// mirrors the real contract: value in, full {icon, tone} out on change.
vi.mock('~/components/ui/icon-color-picker', () => ({
	IconColorPicker: ({
		value,
		onChange,
	}: {
		value: { icon?: string | null; tone?: string | null };
		onChange: (next: { icon: string; tone: string }) => void;
	}) =>
		createElement(
			'button',
			{
				type: 'button',
				'aria-label': 'Choose icon and color',
				'data-icon': value.icon ?? '',
				'data-tone': value.tone ?? '',
				onClick: () => onChange({ icon: 'briefcase', tone: '6' }),
			},
			'Choose icon and color',
		),
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
	}) => (
		<FormProvider {...methods}>
			<form onSubmit={onSubmit}>{children}</form>
		</FormProvider>
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
			const { register, getFieldState, formState } = useFormContext();
			const error = getFieldState(name, formState).error;

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
				error?.message
					? createElement('span', { role: 'alert' }, error.message)
					: null,
			);
		},
		CheckboxGroup: ({
			name,
			label,
			options,
			isDisabled,
		}: {
			name: string;
			label: string;
			options: Array<{ value: string; label: string; isDisabled?: boolean }>;
			isDisabled?: boolean;
		}) => {
			const { control } = useFormContext();

			return createElement(Controller, {
				name,
				control,
				render: ({
					field,
				}: {
					field: { value: unknown; onChange: (value: string[]) => void };
				}) => {
					const value = Array.isArray(field.value) ? field.value : [];

					return createElement(
						'fieldset',
						undefined,
						createElement('legend', undefined, label),
						...options.map((option) =>
							createElement(
								'label',
								{ key: option.value },
								createElement('input', {
									type: 'checkbox',
									'aria-label': option.label,
									checked: value.includes(option.value),
									disabled: isDisabled || option.isDisabled,
									onChange: (event: ChangeEvent<HTMLInputElement>) => {
										const nextValue = event.target.checked
											? [...value, option.value]
											: value.filter((item) => item !== option.value);
										field.onChange(nextValue);
									},
								}),
								createElement('span', undefined, option.label),
							),
						),
					);
				},
			});
		},
	},
}));

vi.mock('~/lib/query/staff-roles', () => ({
	// The route's query spec reads the factory object; this suite never runs
	// the loader, so the stub is never called.
	staffPermissionCatalogQueryOptions: {
		queryKey: () => ['staffPermissionCatalogQueryOptions'],
		fetcher: () => Promise.resolve({}),
	},
	invalidateStaffRoles: (queryClient: {
		invalidateQueries: (options: { queryKey: unknown[] }) => Promise<void>;
	}) => queryClient.invalidateQueries({ queryKey: ['staff', 'staff-roles'] }),
	useCreateStaffRoleMutation: mocks.useCreateStaffRoleMutation,
	useStaffPermissionCatalogQuery: mocks.useStaffPermissionCatalogQuery,
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { buildStaffPermissionOptions } from './_staff-permission-options';
import { Route } from './roles-new';

const buildPermissionCatalogQuery = (
	overrides: Record<string, unknown> = {},
) => ({
	data: {
		additionalData: {
			users: {
				read: {
					key: 'staff.users.read',
					name: 'Read users',
					description: 'Read staff users',
				},
			},
		},
	},
	isPending: false,
	isFetching: false,
	isError: false,
	error: null,
	...overrides,
});

const renderPage = () => {
	const Component = Route.options.component as () => ReturnType<
		typeof createElement
	>;
	return render(createElement(Component));
};

describe('staff role create route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.blockerResolver.status = 'idle';
		mocks.blockerResolver.proceed = undefined;
		mocks.blockerResolver.reset = undefined;
		mocks.capturedShouldBlockFn = undefined;

		mocks.useStaffPermissionCatalogQuery.mockReturnValue(
			buildPermissionCatalogQuery(),
		);
		mocks.useCreateStaffRoleMutation.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({ roleId: 'role-1' }),
			isPending: false,
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('builds sorted permission options from the catalog', () => {
		expect(
			buildStaffPermissionOptions({
				team_admin: {
					manage: {
						key: 'staff.team_admin.manage',
						name: 'Manage team admins',
						description: 'Manage privileged users',
					},
				},
				users: {
					read: {
						key: 'staff.users.read',
						name: 'Read users',
						description: 'View staff users',
					},
					missingKey: {
						key: '',
						name: 'Skip me',
					},
				},
			}),
		).toEqual([
			{
				value: 'staff.team_admin.manage',
				label: 'staff.team_admin.manage',
				description:
					'Team Admin • Manage team admins • Manage privileged users',
			},
			{
				value: 'staff.users.read',
				label: 'staff.users.read',
				description: 'Users • Read users • View staff users',
			},
		]);
	});

	test('skips malformed permission catalog entries without throwing', () => {
		expect(
			buildStaffPermissionOptions({
				users: {
					read: {
						key: '  staff.users.read  ',
						name: '  Read users  ',
						description: '  View staff users  ',
					},
					invalid: null,
				},
				audit: null,
				settings: 'not-an-object',
			}),
		).toEqual([
			{
				value: 'staff.users.read',
				label: 'staff.users.read',
				description: 'Users • Read users • View staff users',
			},
		]);
	});

	test('links back to the staff roles list', () => {
		renderPage();

		expect(
			screen
				.getByRole('link', { name: 'Back to staff roles' })
				.getAttribute('href'),
		).toBe('/staff/roles');
	});

	test('renders logout redirect for permission catalog 401 failures', () => {
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.useStaffPermissionCatalogQuery.mockReturnValue(
			buildPermissionCatalogQuery({
				isError: true,
				error: new Response(null, { status: 401 }),
			}),
		);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});

	test('submits the role and returns to the roles list', async () => {
		const mutateAsync = vi.fn().mockResolvedValue({ roleId: 'role-1' });

		mocks.useCreateStaffRoleMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});

		renderPage();

		const picker = screen.getByRole('button', {
			name: 'Choose icon and color',
		});
		// #980: an untouched picker submits no style (null on the wire), and
		// picking a style flows through to the create payload.
		expect(picker.getAttribute('data-icon')).toBe('');
		fireEvent.click(picker);
		expect(picker.getAttribute('data-icon')).toBe('briefcase');
		expect(picker.getAttribute('data-tone')).toBe('6');

		fireEvent.change(screen.getByRole('textbox', { name: 'Role name' }), {
			target: { value: 'Platform admin' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
			target: { value: 'Full access' },
		});
		fireEvent.click(screen.getByRole('checkbox', { name: 'staff.users.read' }));
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create role' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mutateAsync).toHaveBeenCalledWith({
				name: 'Platform admin',
				description: 'Full access',
				permissions: ['staff.users.read'],
				emails: [],
				icon: 'briefcase',
				tone: '6',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-roles'],
			}),
		);
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/roles',
			}),
		);
	});

	test('renders logout redirect for submit 401 failures', async () => {
		const mutateAsync = vi
			.fn()
			.mockRejectedValue(new Response(null, { status: 401 }));

		mocks.useCreateStaffRoleMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});
		mocks.shouldLogoutForFailure.mockImplementation(
			(error: unknown) => error instanceof Response && error.status === 401,
		);

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Role name' }), {
			target: { value: 'Platform admin' },
		});
		fireEvent.click(screen.getByRole('checkbox', { name: 'staff.users.read' }));
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create role' }).closest('form')!,
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
	});

	test('leaves general submit failures to central feedback and stays on the page', async () => {
		const mutateAsync = vi
			.fn()
			.mockRejectedValue(new Response(null, { status: 403 }));

		mocks.useCreateStaffRoleMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});
		mocks.shouldLogoutForFailure.mockImplementation(
			(error: unknown) => error instanceof Response && error.status === 401,
		);

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Role name' }), {
			target: { value: 'Platform admin' },
		});
		fireEvent.click(screen.getByRole('checkbox', { name: 'staff.users.read' }));
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create role' }).closest('form')!,
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
		expect(screen.queryByText('Unable to save the role.')).toBeNull();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('maps known server validation fields inline without a general banner', async () => {
		const mutateAsync = vi.fn().mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			errors: { Name: ['This role name is unavailable.'] },
		});
		mocks.useCreateStaffRoleMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});

		renderPage();
		fireEvent.change(screen.getByRole('textbox', { name: 'Role name' }), {
			target: { value: 'Platform admin' },
		});
		fireEvent.click(screen.getByRole('checkbox', { name: 'staff.users.read' }));
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create role' }).closest('form')!,
		);

		expect(
			await screen.findByText('This role name is unavailable.'),
		).toBeTruthy();
		expect(screen.queryByText('Unable to save the role.')).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('shows unmappable server validation in an inline form summary', async () => {
		const mutateAsync = vi.fn().mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			errors: { UnknownField: ['The role payload is invalid.'] },
		});
		mocks.useCreateStaffRoleMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});

		renderPage();
		fireEvent.change(screen.getByRole('textbox', { name: 'Role name' }), {
			target: { value: 'Platform admin' },
		});
		fireEvent.click(screen.getByRole('checkbox', { name: 'staff.users.read' }));
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create role' }).closest('form')!,
		);

		expect(
			await screen.findByText('The role payload is invalid.'),
		).toBeTruthy();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	// users-auth-r1-F4: this Back-link-only create route had no `useBlocker`,
	// so a Back click discarded a dirty draft with no confirmation.
	test('the nav-guard shouldBlockFn blocks while dirty and stops blocking once the save completes', async () => {
		const mutateAsync = vi.fn().mockResolvedValue({ roleId: 'role-1' });
		mocks.useCreateStaffRoleMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});
		renderPage();

		expect(mocks.capturedShouldBlockFn?.()).toBe(false);

		fireEvent.change(screen.getByRole('textbox', { name: 'Role name' }), {
			target: { value: 'Platform admin' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
			target: { value: 'Full access' },
		});
		fireEvent.click(screen.getByRole('checkbox', { name: 'staff.users.read' }));
		expect(mocks.capturedShouldBlockFn?.()).toBe(true);

		fireEvent.submit(
			screen.getByRole('button', { name: 'Create role' }).closest('form')!,
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
});
