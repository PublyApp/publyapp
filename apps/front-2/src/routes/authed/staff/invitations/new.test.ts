import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
/**
 * @vitest-environment jsdom
 */
import {
	createElement,
	type ChangeEvent,
	type FormEventHandler,
	type ReactNode,
} from 'react';
import { Controller, FormProvider, useFormContext } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	useBulkCreateStaffInvitationsMutation: vi.fn(),
	useStaffProfilesQuery: vi.fn(),
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
		t: (key: string, options?: { count?: number }) => {
			const labels: Record<string, string> = {
				'staff-invitations': 'Staff invitations',
				'invite-users': 'Invite users',
				profiles: 'Profiles',
				search: 'Search',
				'select-at-least-one-profile': 'Select at least one profile.',
				'email-address': 'Email address',
				'select-profiles': 'Select profiles',
				'no-results-found': 'No results found.',
				'send-invitations': 'Send invitations',
				'add-invitation': 'Add invitation',
				invitation: 'Invitation',
				'enter-email-and-select-profiles': 'Enter email and select profiles.',
				'invitations-sent-successfully': `Sent ${options?.count ?? 0}`,
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
		Email: ({
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
					type: 'email',
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

vi.mock('~/lib/query/staff-invitations', () => ({
	useBulkCreateStaffInvitationsMutation:
		mocks.useBulkCreateStaffInvitationsMutation,
}));

vi.mock('~/lib/query/staff-profiles', () => ({
	useStaffProfilesQuery: mocks.useStaffProfilesQuery,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route, buildProfileOptions } from './new';

const ADMIN_PROFILE_ID = '11111111-1111-1111-1111-111111111111';

const buildProfilesQuery = (overrides: Record<string, unknown> = {}) => ({
	data: {
		data: [
			{
				id: ADMIN_PROFILE_ID,
				name: 'Admin',
			},
		],
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

describe('staff invitation create route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();

		mocks.useStaffProfilesQuery.mockReturnValue(buildProfilesQuery());
		mocks.useBulkCreateStaffInvitationsMutation.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({ created: 1 }),
			isPending: false,
		});
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	test('keeps selected profile ids visible when the current search result omits them', () => {
		const options = buildProfileOptions({
			profiles: [{ id: 'profile-admin', name: 'Admin' }],
			selectedProfileIds: ['profile-admin', 'profile-editor'],
			knownProfileNames: new Map([['profile-editor', 'Editor']]),
		});

		expect(options).toEqual([
			{ value: 'profile-admin', label: 'Admin' },
			{ value: 'profile-editor', label: 'Editor' },
		]);
	});

	test('links back to the staff invitations list', () => {
		renderPage();

		expect(
			screen
				.getByRole('link', { name: 'Staff invitations' })
				.getAttribute('href'),
		).toBe('/staff/invitations');
	});

	test('navigates to the staff invitations list after a successful submit', async () => {
		const mutateAsync = vi.fn().mockResolvedValue({ created: 1 });

		mocks.useBulkCreateStaffInvitationsMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});

		renderPage();

		fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), {
			target: { value: 'new-staff@example.com' },
		});
		fireEvent.click(screen.getByRole('checkbox', { name: 'Admin' }));
		fireEvent.submit(
			screen.getByRole('button', { name: 'Send invitations' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mutateAsync).toHaveBeenCalledWith({
				invitations: [
					{
						email: 'new-staff@example.com',
						profileIds: [ADMIN_PROFILE_ID],
					},
				],
			}),
		);

		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/invitations',
			}),
		);
	});
});
