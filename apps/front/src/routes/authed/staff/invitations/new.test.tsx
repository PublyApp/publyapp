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
	type SubmitEventHandler,
	type ReactNode,
} from 'react';
import { Controller, FormProvider, useFormContext } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	useBulkCreateStaffInvitationsMutation: vi.fn(),
	useStaffProfilesQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	invalidateStaffInvitations: vi.fn().mockResolvedValue(undefined),
	queryClient: { fake: 'query-client' },
	displayMutationFeedback: vi.fn().mockResolvedValue(undefined),
	blockerResolver: {
		status: 'idle' as 'idle' | 'blocked',
		proceed: undefined as (() => void) | undefined,
		reset: undefined as (() => void) | undefined,
	},
	capturedShouldBlockFn: undefined as (() => boolean) | undefined,
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => mocks.queryClient,
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
		t: (key: string, options?: { count?: number }) => {
			const normalize = (value: string): string =>
				value.startsWith('common:') ? value.replace(/^common:/, '') : value;
			const labels: TestLabelMap = {
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
				'unsaved-changes-dialog-title': 'Leave without saving?',
				'unsaved-changes-dialog-description':
					'You have unsaved changes that will be lost if you leave this page.',
				'leave-page': 'Leave page',
				cancel: 'Cancel',
			};

			return labels[normalize(key)] ?? labels[key] ?? key;
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
		onSubmit?: SubmitEventHandler<HTMLFormElement>;
	}) => (
		<FormProvider {...methods}>
			<form onSubmit={onSubmit}>{children}</form>
		</FormProvider>
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
	invalidateStaffInvitations: mocks.invalidateStaffInvitations,
}));

vi.mock('~/lib/query/staff-profiles', () => ({
	useStaffProfilesQuery: mocks.useStaffProfilesQuery,
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayMutationFeedback: mocks.displayMutationFeedback,
}));

import { buildStaffProfileOptions } from '../_staff-profile-options';
import { Route } from './new';

const ADMIN_PROFILE_ID = '11111111-1111-1111-8111-111111111111';

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
	const Component = Route.options.component as () => ReturnType<
		typeof createElement
	>;
	return render(createElement(Component));
};

describe('staff invitation create route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
		mocks.blockerResolver.status = 'idle';
		mocks.blockerResolver.proceed = undefined;
		mocks.blockerResolver.reset = undefined;
		mocks.capturedShouldBlockFn = undefined;

		mocks.useStaffProfilesQuery.mockReturnValue(buildProfilesQuery());
		mocks.useBulkCreateStaffInvitationsMutation.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({ created: 1 }),
			isPending: false,
		});
		mocks.invalidateStaffInvitations.mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	test('keeps selected profile ids visible when the current search result omits them', () => {
		const options = buildStaffProfileOptions({
			profiles: [
				{
					id: 'profile-admin',
					name: 'Admin',
					description: 'Full access',
				},
			],
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
		expect(screen.queryByText('Sent 1')).toBeNull();
	});

	test('keeps server validation inline', async () => {
		const mutateAsync = vi.fn().mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			errors: { email: ['Pending invitation already exists'] },
		});
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
			expect(
				screen.getByText('Pending invitation already exists'),
			).toBeTruthy(),
		);
	});

	test('relies on central feedback for ordinary failures without rendering a general error block', async () => {
		const mutateAsync = vi.fn().mockRejectedValue({
			status: 500,
			responseStatusCode: 500,
			title: 'Server error',
			detail: 'Could not send invitations',
		});
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

		await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
		expect(screen.queryByText('Could not send invitations')).toBeNull();
		expect(screen.queryByText('invitations-could-not-be-sent')).toBeNull();
	});

	test('invalidates the staff invitations list query so the sent invitations are not hidden by a fresh cache entry', async () => {
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
			expect(mocks.invalidateStaffInvitations).toHaveBeenCalledWith(
				mocks.queryClient,
			),
		);
	});

	// users-auth-r1-F4: this multi-invitation create route had no
	// `useBlocker`, so Back/route navigation discarded a dirty draft with no
	// confirmation.
	test('the nav-guard shouldBlockFn blocks while dirty and stops blocking once the submit resets the form', async () => {
		const mutateAsync = vi.fn().mockResolvedValue({ created: 1 });
		mocks.useBulkCreateStaffInvitationsMutation.mockReturnValue({
			mutateAsync,
			isPending: false,
		});
		renderPage();

		expect(mocks.capturedShouldBlockFn?.()).toBe(false);

		fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), {
			target: { value: 'new-staff@example.com' },
		});
		expect(mocks.capturedShouldBlockFn?.()).toBe(true);

		fireEvent.click(screen.getByRole('checkbox', { name: 'Admin' }));
		fireEvent.submit(
			screen.getByRole('button', { name: 'Send invitations' }).closest('form')!,
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
		await waitFor(() => expect(mocks.capturedShouldBlockFn?.()).toBe(false));
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
