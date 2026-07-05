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
	type FormEventHandler,
	type ReactNode,
} from 'react';
import { Controller, FormProvider, useFormContext } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	navigate: vi.fn(),
	useCreateStaffProfileMutation: vi.fn(),
	useStaffPermissionCatalogQuery: vi.fn(),
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
	Input: ({
		id,
		value,
		onChange,
		placeholder,
		disabled,
		...props
	}: {
		id?: string;
		value?: string;
		onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
		placeholder?: string;
		disabled?: boolean;
	}) =>
		createElement('input', {
			id,
			value,
			onChange,
			placeholder,
			disabled,
			...props,
		}),
	Spinner: () => createElement('span', undefined, 'Loading'),
	TextField: ({ children, ...props }: { children: ReactNode }) =>
		createElement('div', props, children),
	FieldError: ({ children, ...props }: { children: ReactNode }) =>
		createElement('div', props, children),
	Label: ({ children, ...props }: { children: ReactNode }) =>
		createElement('label', props, children),
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
				'staff-profiles': 'Staff profiles',
				'new-item': 'New profile',
				'profile-name': 'Profile name',
				description: 'Description',
				permissions: 'Permissions',
				'create-profile': 'Create profile',
				'back-to-staff-profiles': 'Back to staff profiles',
				'profile-created-successfully': 'Profile created successfully',
				'unable-to-load-staff-permissions': 'Unable to load staff permissions.',
				'profile-save-failed': 'Unable to save the profile.',
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

vi.mock('~/lib/query/staff-profiles', () => ({
	STAFF_PROFILES_QUERY_KEY: ['staff', 'staff-profiles'],
	useCreateStaffProfileMutation: mocks.useCreateStaffProfileMutation,
	useStaffPermissionCatalogQuery: mocks.useStaffPermissionCatalogQuery,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route, buildStaffPermissionOptions } from './profiles-new';

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
	const Component = (
		Route as unknown as { component: () => ReturnType<typeof createElement> }
	).component;
	return render(createElement(Component));
};

describe('staff profile create route', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mocks.useStaffPermissionCatalogQuery.mockReturnValue(
			buildPermissionCatalogQuery(),
		);
		mocks.useCreateStaffProfileMutation.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({ profileId: 'profile-1' }),
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
			} as never),
		).toEqual([
			{
				value: 'staff.users.read',
				label: 'staff.users.read',
				description: 'Users • Read users • View staff users',
			},
		]);
	});

	test('links back to the staff profiles list', () => {
		renderPage();

		expect(
			screen
				.getByRole('link', { name: 'Back to staff profiles' })
				.getAttribute('href'),
		).toBe('/staff/profiles');
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

	test('submits the profile and returns to the profiles list', async () => {
		const mutateAsync = vi.fn().mockResolvedValue({ profileId: 'profile-1' });

		mocks.useCreateStaffProfileMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Profile name' }), {
			target: { value: 'Platform admin' },
		});
		fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
			target: { value: 'Full access' },
		});
		fireEvent.click(screen.getByRole('checkbox', { name: 'staff.users.read' }));
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create profile' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mutateAsync).toHaveBeenCalledWith({
				name: 'Platform admin',
				description: 'Full access',
				permissions: ['staff.users.read'],
				emails: [],
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-profiles'],
			}),
		);
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/profiles',
			}),
		);
	});

	test('renders logout redirect for submit 401 failures', async () => {
		const mutateAsync = vi
			.fn()
			.mockRejectedValue(new Response(null, { status: 401 }));

		mocks.useCreateStaffProfileMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});
		mocks.shouldLogoutForFailure.mockImplementation(
			(error: unknown) => error instanceof Response && error.status === 401,
		);

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Profile name' }), {
			target: { value: 'Platform admin' },
		});
		fireEvent.click(screen.getByRole('checkbox', { name: 'staff.users.read' }));
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create profile' }).closest('form')!,
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
	});

	test('shows an inline error and stays on the page for submit 403 failures', async () => {
		const mutateAsync = vi
			.fn()
			.mockRejectedValue(new Response(null, { status: 403 }));

		mocks.useCreateStaffProfileMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});
		mocks.shouldLogoutForFailure.mockImplementation(
			(error: unknown) => error instanceof Response && error.status === 401,
		);

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Profile name' }), {
			target: { value: 'Platform admin' },
		});
		fireEvent.click(screen.getByRole('checkbox', { name: 'staff.users.read' }));
		fireEvent.submit(
			screen.getByRole('button', { name: 'Create profile' }).closest('form')!,
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
		await waitFor(() =>
			expect(screen.getByText('Unable to save the profile.')).toBeTruthy(),
		);
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});
});
