/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react';
import * as React from 'react';
import { createElement, type JSX, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';

const mocks = vi.hoisted(() => ({
	toStaffUserDetails: vi.fn(),
	toAssignedStaffProfiles: vi.fn(),
	toStaffProfileRows: vi.fn(),
	useStaffUserDetailsQuery: vi.fn(),
	useStaffUserProfilesQuery: vi.fn(),
	useStaffProfilesQuery: vi.fn(),
	useUpdateStaffUserMutation: vi.fn(),
	useUpdateStaffUserProfilesMutation: vi.fn(),
	useUpdateStaffUserEmailMutation: vi.fn(),
	updateStaffUser: vi.fn(),
	updateStaffUserProfiles: vi.fn(),
	updateStaffUserEmail: vi.fn(),
	invalidateQueries: vi.fn(),
	navigate: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	deferredProfileSearch: undefined as string | undefined,
	blockerResolver: {
		status: 'idle' as 'idle' | 'blocked',
		proceed: undefined as (() => void) | undefined,
		reset: undefined as (() => void) | undefined,
	},
	capturedShouldBlockFn: undefined as (() => boolean) | undefined,
}));

vi.mock('react', async (importOriginal) => {
	const actual = await importOriginal<typeof import('react')>();

	return {
		...actual,
		useDeferredValue: (value: string) => mocks.deferredProfileSearch ?? value,
	};
});

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		error: mocks.toastError,
	},
}));

const getUserDetails = (userId: string) => ({
	id: userId,
	email: userId === USER_A ? 'alex@example.com' : 'bea@example.com',
	firstName: userId === USER_A ? 'Alex' : 'Bea',
	lastName: 'User',
	avatarUrl:
		userId === USER_A
			? 'https://example.com/avatar-a.png'
			: 'https://example.com/avatar-b.png',
	accountLevel: userId === USER_A ? 'Admin' : 'User',
	status: 'Active',
	displayName: userId === USER_A ? 'Alex User' : 'Bea User',
	createdAt: null,
	updatedAt: null,
});

type QueryState = {
	data?: unknown;
	error?: unknown;
	isPending: boolean;
	isSuccess: boolean;
	isError: boolean;
	isFetching: boolean;
	refetch: ReturnType<typeof vi.fn>;
};

const buildQueryResult = (overrides: Partial<QueryState> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isSuccess: true,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const queryState = {
	activeUserId: USER_A,
	details: new Map<string, QueryState>(),
	profiles: new Map<string, QueryState>(),
};

const setActiveUser = (userId: string) => {
	queryState.activeUserId = userId;
};

const setDetailState = (userId: string, overrides: Partial<QueryState>) => {
	queryState.details.set(userId, { ...buildQueryResult(), ...overrides });
};

const setProfileState = (userId: string, overrides: Partial<QueryState>) => {
	queryState.profiles.set(userId, { ...buildQueryResult(), ...overrides });
};

const getDetailState = (userId: string): QueryState =>
	queryState.details.get(userId) ??
	buildQueryResult({ isSuccess: false, isPending: true });

const getProfileState = (userId: string): QueryState =>
	queryState.profiles.get(userId) ??
	buildQueryResult({ isSuccess: false, isPending: true });

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useParams: () => ({
			userId: queryState.activeUserId,
		}),
		useNavigate: () => mocks.navigate,
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

		return createElement('a', { href, ...props }, children);
	},
	useBlocker: (opts: { shouldBlockFn: () => boolean }) => {
		mocks.capturedShouldBlockFn = opts.shouldBlockFn;
		return mocks.blockerResolver;
	},
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const resolvedKey = key.replace(/^(common|staff-users):/, '');
			const labels: TestLabelMap = {
				'back-to-user': 'Back to staff user',
				'email-address': 'Email address',
				'email-managed-separately': 'Email changes are managed separately.',
				'account-level': 'Role',
				'first-name': 'First name',
				'last-name': 'Last name',
				'avatar-url': 'Avatar URL',
				profiles: 'Profiles',
				search: 'Search',
				'search-profiles': 'Search profiles…',
				'list-no-match-default-description': 'No results match your search.',
				'no-profiles-available': 'No profiles are available.',
				role: 'Role',
				status: 'Status',
				admin: 'Admin',
				user: 'User',
				'status-active': 'Active',
				'status-suspended': 'Suspended',
				cancel: 'Cancel',
				'save-changes': 'Save changes',
				'unknown-error': 'Unable to save staff user.',
				'staff-user-updated-success': 'Staff user updated successfully.',
				'edit-staff-user': 'Edit staff user',
				'invalid-url': 'Invalid URL',
				'previous-page': 'Previous page',
				'next-page': 'Next page',
				'page-n': 'Page',
				'change-email': 'Change email',
				'change-staff-user-email-description':
					'Send this user a new sign-in email address.',
				email: 'Email',
				'email-required': 'Email is required.',
				'invalid-email-address': 'Invalid email address',
				'update-staff-user-email-failed': "Unable to update this user's email.",
				'unsaved-changes-dialog-title': 'Leave without saving?',
				'unsaved-changes-dialog-description':
					'You have unsaved changes that will be lost if you leave this page.',
				'leave-page': 'Leave page',
				close: 'Close',
				'staff-user-identity-saved-profiles-failed':
					'Identity saved, but profile assignments failed to save.',
			};

			return labels[resolvedKey] ?? resolvedKey;
		},
		i18n: { language: 'en' },
	}),
}));

vi.mock('~/components/ui/input', () => ({
	Input: (props: React.ComponentProps<'input'>) =>
		createElement('input', props),
}));

vi.mock('~/components/ui/label', () => ({
	Label: ({ children, ...props }: React.ComponentProps<'label'>) =>
		createElement('label', props, children),
}));

vi.mock('~/components/ui/button', () => ({
	Button: ({ children, ...props }: React.ComponentProps<'button'>) =>
		createElement('button', props, children),
}));

vi.mock('~/components/ui/checkbox', () => ({
	Checkbox: ({
		checked,
		onCheckedChange,
		...props
	}: {
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	} & React.ComponentProps<'input'>) =>
		createElement('input', {
			...props,
			type: 'checkbox',
			checked,
			onChange: () => onCheckedChange?.(!checked),
		}),
}));

vi.mock('~/components/ui/switch', () => ({
	Switch: ({
		checked,
		onCheckedChange,
		...props
	}: {
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	} & React.ComponentProps<'button'>) =>
		createElement('button', {
			...props,
			type: 'button',
			role: 'switch',
			'aria-checked': checked,
			onClick: () => onCheckedChange?.(!checked),
		}),
}));

vi.mock('~/components/ui/select', () => {
	const SelectContent = ({ children }: { children?: ReactNode }) =>
		createElement('div', null, children);
	const SelectItem = ({
		children,
		value,
	}: {
		children: ReactNode;
		value?: string;
	}) => createElement('option', { value }, children);
	const SelectTrigger = ({ children, ...props }: React.ComponentProps<'div'>) =>
		createElement('div', props, children);

	return {
		Select: ({
			children,
			value,
			onValueChange,
			disabled,
			...props
		}: {
			children: ReactNode;
			value?: string | null;
			onValueChange?: (value: string) => void;
			disabled?: boolean;
		}) => {
			const options: ReactNode[] = [];
			let triggerProps: React.ComponentProps<'div'> = {};
			const visit = (nodes: ReactNode) => {
				if (!nodes) {
					return;
				}
				for (const child of React.Children.toArray(nodes)) {
					if (!React.isValidElement(child)) {
						continue;
					}

					if (child.type === SelectItem) {
						options.push(child);
						continue;
					}

					if (child.type === SelectTrigger) {
						triggerProps = child.props as React.ComponentProps<'div'>;
					}

					visit((child.props as { children?: ReactNode }).children);
				}
			};
			visit(children);

			return createElement(
				'select',
				{
					...triggerProps,
					...props,
					value: value ?? '',
					disabled,
					onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
						onValueChange?.(event.target.value),
				},
				options,
			);
		},
		SelectContent,
		SelectItem,
		SelectTrigger,
		SelectValue: () => null,
	};
});

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
			description ? `${title} ${description}` : title,
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

vi.mock('~/lib/query/staff-users', () => ({
	STAFF_USERS_QUERY_KEY: ['staff-users'],
	STAFF_USER_DETAILS_QUERY_KEY: ['staff-users', 'detail'],
	STAFF_USER_PROFILES_QUERY_KEY: ['staff-users', 'detail', 'profiles'],
	invalidateStaffUsers: (queryClient: {
		invalidateQueries: (options: { queryKey: unknown[] }) => Promise<void>;
	}) => queryClient.invalidateQueries({ queryKey: ['staff', 'staff-users'] }),
	toStaffUserDetails: mocks.toStaffUserDetails,
	toAssignedStaffProfiles: mocks.toAssignedStaffProfiles,
	useStaffUserDetailsQuery: ({ userId }: { userId: string }) =>
		getDetailState(userId),
	useStaffUserProfilesQuery: ({ userId }: { userId: string }) =>
		getProfileState(userId),
	useUpdateStaffUserMutation: mocks.useUpdateStaffUserMutation,
	useUpdateStaffUserProfilesMutation: mocks.useUpdateStaffUserProfilesMutation,
	useUpdateStaffUserEmailMutation: mocks.useUpdateStaffUserEmailMutation,
}));

vi.mock('~/lib/query/staff-profiles', () => ({
	toStaffProfileRows: mocks.toStaffProfileRows,
	useStaffProfilesQuery: mocks.useStaffProfilesQuery,
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './$userId-edit';

const Component = Route.options.component as () => JSX.Element;

const renderPage = () => render(<Component />);

describe('staff user edit route', () => {
	test('declares the staff-users i18n namespace', () => {
		expect(Route.options.staticData?.i18nNamespaces).toEqual(['staff-users']);
	});

	beforeEach(() => {
		vi.clearAllMocks();
		queryState.activeUserId = USER_A;
		queryState.details.clear();
		queryState.profiles.clear();
		mocks.blockerResolver.status = 'idle';
		mocks.blockerResolver.proceed = undefined;
		mocks.blockerResolver.reset = undefined;
		mocks.capturedShouldBlockFn = undefined;
		mocks.deferredProfileSearch = undefined;
		mocks.navigate.mockResolvedValue(undefined);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useUpdateStaffUserMutation.mockReturnValue({
			mutateAsync: mocks.updateStaffUser,
			isPending: false,
		});
		mocks.useUpdateStaffUserProfilesMutation.mockReturnValue({
			mutateAsync: mocks.updateStaffUserProfiles,
			isPending: false,
		});
		mocks.useUpdateStaffUserEmailMutation.mockReturnValue({
			mutateAsync: mocks.updateStaffUserEmail,
			isPending: false,
		});

		mocks.toStaffUserDetails.mockImplementation(({ id }: { id: string }) =>
			getUserDetails(id),
		);
		mocks.toAssignedStaffProfiles.mockImplementation(
			(
				payload:
					| { assignedProfiles?: Array<{ id: string }> }
					| undefined
					| null,
			) => {
				const profiles = payload?.assignedProfiles;
				if (!profiles) {
					return [];
				}
				return profiles.map((profile) => ({
					id: profile.id,
					name: profile.id === 'profile-1' ? 'Publishing' : 'Billing',
					description: null,
				}));
			},
		);
		mocks.toStaffProfileRows.mockReturnValue([
			{ id: 'profile-1', name: 'Publishing', description: null },
			{ id: 'profile-2', name: 'Billing', description: null },
		]);

		setDetailState(USER_A, {
			data: {
				id: USER_A,
				email: 'alex@example.com',
			},
			isPending: false,
			isSuccess: true,
		});
		setProfileState(USER_A, {
			data: {
				assignedProfiles: [
					{ id: 'profile-1', name: 'Publishing', description: null },
				],
			},
			isPending: false,
			isSuccess: true,
		});
		mocks.useStaffProfilesQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [
						{ id: 'profile-1', name: 'Publishing', description: null },
						{ id: 'profile-2', name: 'Billing', description: null },
					],
					nextCursor: null,
				},
			}),
		);
	});

	afterEach(() => {
		cleanup();
	});

	test('delays hydration until profile data resolves, then fully hydrates identity and access fields even with zero assigned profiles', async () => {
		setDetailState(USER_A, {
			data: { id: USER_A },
			isPending: true,
			isSuccess: false,
		});
		setProfileState(USER_A, {
			data: { assignedProfiles: [] },
			isPending: false,
			isSuccess: true,
		});

		const rendered = renderPage();
		expect(screen.getByTestId('staff-user-edit-loading')).toBeTruthy();

		setDetailState(USER_A, {
			data: { id: USER_A },
			isPending: false,
			isSuccess: true,
		});
		rendered.rerender(<Component />);

		// The zero-profile case must still hydrate identity/access fields — it
		// must never fall back to the form's blank defaults (r5-F1).
		await waitFor(() => expect(screen.getByDisplayValue('Alex')).toBeTruthy());
		expect(screen.getByDisplayValue('User')).toBeTruthy();
		expect(
			screen.getByDisplayValue('https://example.com/avatar-a.png'),
		).toBeTruthy();
		expect(screen.getByDisplayValue('alex@example.com')).toBeTruthy();
		expect(screen.getByDisplayValue('Admin')).toBeTruthy();
		expect(screen.getByDisplayValue('Active')).toBeTruthy();
		expect(
			(screen.getByRole('checkbox', { name: 'Publishing' }) as HTMLInputElement)
				.checked,
		).toBe(false);
		expect(
			(screen.getByRole('checkbox', { name: 'Billing' }) as HTMLInputElement)
				.checked,
		).toBe(false);

		// Assignments stay empty through this final assertion — the r4 test's
		// mistake was swapping in non-empty data before asserting hydration.
		expect(
			(screen.getByRole('checkbox', { name: 'Publishing' }) as HTMLInputElement)
				.checked,
		).toBe(false);
		expect(
			(screen.getByRole('checkbox', { name: 'Billing' }) as HTMLInputElement)
				.checked,
		).toBe(false);
	});

	test('hydrates non-empty assignments once profile data resolves', async () => {
		setProfileState(USER_A, {
			data: {
				assignedProfiles: [
					{ id: 'profile-1', name: 'Publishing', description: null },
					{ id: 'profile-2', name: 'Billing', description: null },
				],
			},
			isPending: false,
			isSuccess: true,
		});

		renderPage();

		await waitFor(() => {
			expect(
				(
					screen.getByRole('checkbox', {
						name: 'Publishing',
					}) as HTMLInputElement
				).checked,
			).toBe(true);
		});
		expect(
			(screen.getByRole('checkbox', { name: 'Billing' }) as HTMLInputElement)
				.checked,
		).toBe(true);
	});

	test('re-hydrates when the route param changes to a new user', async () => {
		const rendered = renderPage();
		const findCheckbox = (name: string): HTMLInputElement =>
			rendered.getByRole('checkbox', { name }) as HTMLInputElement;

		setActiveUser(USER_B);
		setDetailState(USER_B, {
			data: {
				id: USER_B,
			},
			isPending: false,
			isSuccess: true,
		});
		setProfileState(USER_B, {
			data: {
				assignedProfiles: [
					{ id: 'profile-2', name: 'Billing', description: null },
				],
			},
			isPending: false,
			isSuccess: true,
		});
		rendered.rerender(<Component />);

		await waitFor(() => {
			expect(screen.getByDisplayValue('Bea')).toBeTruthy();
		});
		expect(findCheckbox('Publishing').checked).toBe(false);
		expect(findCheckbox('Billing').checked).toBe(true);
	});

	test('discards user A dirty edits when the route param transitions to user B', async () => {
		const rendered = renderPage();
		const findCheckbox = (name: string): HTMLInputElement =>
			rendered.getByRole('checkbox', { name }) as HTMLInputElement;

		await waitFor(() => expect(screen.getByDisplayValue('Alex')).toBeTruthy());

		fireEvent.change(screen.getByDisplayValue('Alex'), {
			target: { value: 'Dirty Name' },
		});
		expect(screen.getByDisplayValue('Dirty Name')).toBeTruthy();

		setActiveUser(USER_B);
		setDetailState(USER_B, {
			data: { id: USER_B },
			isPending: false,
			isSuccess: true,
		});
		setProfileState(USER_B, {
			data: {
				assignedProfiles: [
					{ id: 'profile-2', name: 'Billing', description: null },
				],
			},
			isPending: false,
			isSuccess: true,
		});
		rendered.rerender(<Component />);

		await waitFor(() => expect(screen.getByDisplayValue('Bea')).toBeTruthy());
		expect(screen.queryByDisplayValue('Dirty Name')).toBeNull();
		expect(findCheckbox('Publishing').checked).toBe(false);
		expect(findCheckbox('Billing').checked).toBe(true);
	});

	test('renders loaded identity, access, and disabled contract fields', () => {
		renderPage();

		expect(screen.getByTestId('staff-user-edit-page')).toBeTruthy();
		expect(
			screen.getByRole('heading', { name: 'Edit staff user' }),
		).toBeTruthy();
		expect(screen.getByDisplayValue('Alex')).toBeTruthy();
		expect(screen.getByDisplayValue('User')).toBeTruthy();
		expect(
			screen.getByDisplayValue('https://example.com/avatar-a.png'),
		).toBeTruthy();
		expect(screen.getByDisplayValue('Admin')).toBeTruthy();
		expect(screen.getByDisplayValue('Active')).toBeTruthy();
		expect(screen.getByLabelText('Status')).toHaveProperty('disabled', true);
		// r5-F5: no Security card — it only ever rendered an internal
		// contract-absence message as if it were product content. Matches on
		// the untranslated `security` key stem so this stays red even if a
		// future i18n label wording changes.
		expect(screen.queryByText(/security/i)).toBeNull();
		expect(screen.queryAllByRole('switch')).toHaveLength(0);
		expect(screen.getByDisplayValue('alex@example.com')).toHaveProperty(
			'disabled',
			true,
		);
		expect(screen.getByText('Publishing')).toBeTruthy();
		expect(screen.getByText('Billing')).toBeTruthy();
	});

	test('names the profile search control with its visible label', () => {
		renderPage();

		const search = screen.getByRole('textbox', { name: 'Search profiles…' });
		const label = document.querySelector(
			'label[for="staff-user-profile-search"]',
		);

		expect(label?.textContent).toBe('Search profiles…');
		expect(label?.textContent).toBe(search.getAttribute('aria-label'));
	});

	test('shows the no-match message instead of the empty-catalogue message for an empty search result', async () => {
		setProfileState(USER_A, {
			data: { assignedProfiles: [] },
			isPending: false,
			isSuccess: true,
		});
		mocks.toAssignedStaffProfiles.mockReturnValue([]);
		mocks.toStaffProfileRows.mockReturnValue([]);
		mocks.useStaffProfilesQuery.mockImplementation(() =>
			buildQueryResult({
				data: {
					data: [],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		fireEvent.change(screen.getByTestId('staff-user-profile-search'), {
			target: { value: 'Missing' },
		});

		await waitFor(() =>
			expect(mocks.useStaffProfilesQuery).toHaveBeenCalledWith(
				expect.objectContaining({ q: 'Missing' }),
			),
		);
		expect(screen.getByText('No results match your search.')).toBeTruthy();
		expect(screen.queryByText('No profiles are available.')).toBeNull();
	});

	test('shows the no-match message alongside a preserved selected profile when the server search returns no rows', async () => {
		mocks.useStaffProfilesQuery.mockImplementation(({ q }: { q?: string }) =>
			buildQueryResult({
				data: {
					data:
						q === 'Missing'
							? []
							: [
									{
										id: 'profile-1',
										name: 'Publishing',
										description: null,
									},
								],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		fireEvent.change(screen.getByTestId('staff-user-profile-search'), {
			target: { value: 'Missing' },
		});

		await waitFor(() =>
			expect(mocks.useStaffProfilesQuery).toHaveBeenCalledWith(
				expect.objectContaining({ q: 'Missing' }),
			),
		);
		expect(screen.getByText('No results match your search.')).toBeTruthy();
		expect(screen.getByRole('checkbox', { name: 'Publishing' })).toHaveProperty(
			'checked',
			true,
		);
		expect(screen.queryByText('No profiles are available.')).toBeNull();
	});

	test('treats a whitespace-only profile search as an empty query', () => {
		setProfileState(USER_A, {
			data: { assignedProfiles: [] },
			isPending: false,
			isSuccess: true,
		});
		mocks.toAssignedStaffProfiles.mockReturnValue([]);
		mocks.useStaffProfilesQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		fireEvent.change(screen.getByTestId('staff-user-profile-search'), {
			target: { value: '   ' },
		});

		expect(mocks.useStaffProfilesQuery).toHaveBeenLastCalledWith(
			expect.objectContaining({ q: undefined }),
		);
		expect(screen.getByText('No profiles are available.')).toBeTruthy();
		expect(screen.queryByText('No results match your search.')).toBeNull();
	});

	test('hides empty-state copy while a newer profile search keystroke is still deferred', () => {
		setProfileState(USER_A, {
			data: { assignedProfiles: [] },
			isPending: false,
			isSuccess: true,
		});
		mocks.toAssignedStaffProfiles.mockReturnValue([]);
		mocks.deferredProfileSearch = '';
		mocks.useStaffProfilesQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [],
					nextCursor: null,
				},
			}),
		);

		renderPage();
		expect(screen.getByText('No profiles are available.')).toBeTruthy();

		fireEvent.change(screen.getByTestId('staff-user-profile-search'), {
			target: { value: 'Missing' },
		});

		expect(mocks.useStaffProfilesQuery).toHaveBeenLastCalledWith(
			expect.objectContaining({ q: undefined }),
		);
		expect(screen.queryByText('No profiles are available.')).toBeNull();
		expect(screen.queryByText('No results match your search.')).toBeNull();
	});

	test('shows the empty-catalogue message when no profiles exist and the search is empty', () => {
		setProfileState(USER_A, {
			data: { assignedProfiles: [] },
			isPending: false,
			isSuccess: true,
		});
		mocks.toAssignedStaffProfiles.mockReturnValue([]);
		mocks.toStaffProfileRows.mockReturnValue([]);
		mocks.useStaffProfilesQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		expect(screen.getByText('No profiles are available.')).toBeTruthy();
		expect(screen.queryByText('No results match your search.')).toBeNull();
	});

	// users-auth-r6-F4: the disabled email field must have a real route to
	// the update-email endpoint, not just a "managed separately" dead end.
	test('the Change email button opens a dialog that updates the email via the dedicated mutation', async () => {
		mocks.updateStaffUserEmail.mockResolvedValue({ id: USER_A });

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Change email' }));

		const dialog = within(screen.getByTestId('change-staff-user-email-dialog'));
		expect((dialog.getByLabelText('Email') as HTMLInputElement).value).toBe(
			'alex@example.com',
		);

		fireEvent.change(dialog.getByLabelText('Email'), {
			target: { value: 'alex-new@example.com' },
		});
		fireEvent.click(dialog.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateStaffUserEmail).toHaveBeenCalledWith({
				userId: USER_A,
				email: 'alex-new@example.com',
			}),
		);
		expect(mocks.invalidateQueries).toHaveBeenCalled();
	});

	test('reaches and assigns a profile beyond the first page', async () => {
		mocks.updateStaffUserProfiles.mockResolvedValue({
			assignedProfiles: [],
		});
		mocks.useStaffProfilesQuery.mockImplementation(
			({ cursor }: { cursor?: string }) =>
				cursor === 'cursor-2'
					? buildQueryResult({
							data: {
								data: [
									{
										id: 'profile-101',
										name: 'Archive',
										description: null,
									},
								],
								nextCursor: null,
							},
						})
					: buildQueryResult({
							data: {
								data: [
									{
										id: 'profile-1',
										name: 'Publishing',
										description: null,
									},
								],
								nextCursor: 'cursor-2',
							},
						}),
		);

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
		await waitFor(() =>
			expect(screen.getByRole('checkbox', { name: 'Archive' })).toBeTruthy(),
		);
		fireEvent.click(screen.getByRole('checkbox', { name: 'Archive' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateStaffUserProfiles).toHaveBeenCalledWith({
				userId: USER_A,
				profileIds: ['profile-1', 'profile-101'],
			}),
		);
		expect(mocks.useStaffProfilesQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				cursor: 'cursor-2',
			}),
		);
	});

	test('searches the server-side profile catalogue beyond the current page', async () => {
		mocks.useStaffProfilesQuery.mockImplementation(({ q }: { q?: string }) =>
			q === 'Archive'
				? buildQueryResult({
						data: {
							data: [
								{
									id: 'profile-101',
									name: 'Archive',
									description: null,
								},
							],
							nextCursor: null,
						},
					})
				: buildQueryResult({
						data: {
							data: [
								{
									id: 'profile-1',
									name: 'Publishing',
									description: null,
								},
							],
							nextCursor: 'cursor-2',
						},
					}),
		);

		renderPage();

		fireEvent.change(
			screen.getByRole('textbox', { name: 'Search profiles…' }),
			{
				target: { value: 'Archive' },
			},
		);

		await waitFor(() =>
			expect(mocks.useStaffProfilesQuery).toHaveBeenCalledWith(
				expect.objectContaining({
					q: 'Archive',
				}),
			),
		);
		expect(screen.getByRole('checkbox', { name: 'Archive' })).toBeTruthy();
	});

	test('remembers the label of a deselected off-page profile after it leaves the fetched page', async () => {
		setProfileState(USER_A, {
			data: {
				assignedProfiles: [
					{ id: 'profile-101', name: 'Archive', description: null },
				],
			},
			isPending: false,
			isSuccess: true,
		});
		mocks.toAssignedStaffProfiles.mockReturnValue([
			{ id: 'profile-101', name: 'Archive', description: null },
		]);

		renderPage();

		const archive = await screen.findByRole('checkbox', { name: 'Archive' });
		fireEvent.click(archive);

		// Once deselected, the off-page profile leaves the rendered option list
		// (it is no longer selected and the fetched page never contained it).
		// Its remembered label must not resurface it as a ghost option.
		await waitFor(() =>
			expect(screen.queryByRole('checkbox', { name: 'Archive' })).toBeNull(),
		);
		expect(screen.getByRole('checkbox', { name: 'Publishing' })).toBeTruthy();
		expect(screen.getByRole('checkbox', { name: 'Billing' })).toBeTruthy();
	});

	test('does not return to the loading view once profiles have loaded, even if the query goes transient', async () => {
		const rendered = renderPage();
		await screen.findByDisplayValue('Alex');

		let catalogueCallCount = 0;
		const loadedCatalogue = {
			data: [
				{ id: 'profile-1', name: 'Publishing', description: null },
				{ id: 'profile-2', name: 'Billing', description: null },
			],
			nextCursor: null,
		};
		mocks.useStaffProfilesQuery.mockImplementation(() => {
			catalogueCallCount += 1;
			if (catalogueCallCount === 1) {
				return buildQueryResult({
					data: loadedCatalogue,
					isFetching: true,
				});
			}

			return buildQueryResult({
				isPending: true,
				isSuccess: false,
				isFetching: true,
			});
		});

		rendered.rerender(<Component />);

		// A successful load happened earlier in this mount, so a later
		// transient pending/fetching state must keep the edit page visible
		// instead of flashing the loading view over the user's context.
		expect(screen.getByTestId('staff-user-edit-page')).toBeTruthy();
		expect(screen.queryByTestId('staff-user-edit-loading')).toBeNull();
	});

	test('preserves an assigned off-page profile when another profile is assigned', async () => {
		setProfileState(USER_A, {
			data: {
				assignedProfiles: [
					{ id: 'profile-101', name: 'Archive', description: null },
				],
			},
			isPending: false,
			isSuccess: true,
		});
		mocks.toAssignedStaffProfiles.mockReturnValue([
			{ id: 'profile-101', name: 'Archive', description: null },
		]);
		mocks.updateStaffUserProfiles.mockResolvedValue({
			assignedProfiles: [],
		});

		renderPage();

		await waitFor(() =>
			expect(
				(
					screen.getByRole('checkbox', {
						name: 'Archive',
					}) as HTMLInputElement
				).checked,
			).toBe(true),
		);
		fireEvent.click(screen.getByRole('checkbox', { name: 'Billing' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateStaffUserProfiles).toHaveBeenCalledWith({
				userId: USER_A,
				profileIds: ['profile-101', 'profile-2'],
			}),
		);
	});

	test('explicitly unassigns an off-page profile', async () => {
		setProfileState(USER_A, {
			data: {
				assignedProfiles: [
					{ id: 'profile-101', name: 'Archive', description: null },
				],
			},
			isPending: false,
			isSuccess: true,
		});
		mocks.toAssignedStaffProfiles.mockReturnValue([
			{ id: 'profile-101', name: 'Archive', description: null },
		]);
		mocks.updateStaffUserProfiles.mockResolvedValue({
			assignedProfiles: [],
		});

		renderPage();

		const archive = await screen.findByRole('checkbox', { name: 'Archive' });
		fireEvent.click(archive);
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateStaffUserProfiles).toHaveBeenCalledWith({
				userId: USER_A,
				profileIds: [],
			}),
		);
	});

	test('saves an intentional removal of all assigned profiles', async () => {
		setProfileState(USER_A, {
			data: {
				assignedProfiles: [
					{ id: 'profile-1', name: 'Publishing', description: null },
					{ id: 'profile-2', name: 'Billing', description: null },
				],
			},
			isPending: false,
			isSuccess: true,
		});
		mocks.toAssignedStaffProfiles.mockReturnValue([
			{ id: 'profile-1', name: 'Publishing', description: null },
			{ id: 'profile-2', name: 'Billing', description: null },
		]);
		mocks.updateStaffUserProfiles.mockResolvedValue({
			assignedProfiles: [],
		});

		renderPage();

		await waitFor(() =>
			expect(
				(
					screen.getByRole('checkbox', {
						name: 'Publishing',
					}) as HTMLInputElement
				).checked,
			).toBe(true),
		);
		fireEvent.click(screen.getByRole('checkbox', { name: 'Publishing' }));
		fireEvent.click(screen.getByRole('checkbox', { name: 'Billing' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateStaffUserProfiles).toHaveBeenCalledWith({
				userId: USER_A,
				profileIds: [],
			}),
		);
	});

	test('blocks submit when a field fails validation', async () => {
		renderPage();

		fireEvent.change(screen.getByLabelText('Avatar URL'), {
			target: { value: 'not-a-url' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => expect(screen.getByText('Invalid URL')).toBeTruthy());
		expect(mocks.updateStaffUser).not.toHaveBeenCalled();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('submits the main and profile mutations with their separate bodies', async () => {
		mocks.updateStaffUser.mockResolvedValue({
			id: '11111111-1111-1111-1111-111111111111',
		});
		mocks.updateStaffUserProfiles.mockResolvedValue({
			assignedProfiles: [],
		});
		renderPage();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: '  Alex Updated  ' },
		});
		fireEvent.click(screen.getByRole('checkbox', { name: 'Billing' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateStaffUser).toHaveBeenCalledWith({
				userId: '11111111-1111-1111-1111-111111111111',
				firstName: 'Alex Updated',
			}),
		);
		await waitFor(() =>
			expect(mocks.updateStaffUserProfiles).toHaveBeenCalledWith({
				userId: '11111111-1111-1111-1111-111111111111',
				profileIds: ['profile-1', 'profile-2'],
			}),
		);
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/staff-users/$userId',
				params: { userId: '11111111-1111-1111-1111-111111111111' },
			}),
		);
		expect(mocks.toastSuccess).toHaveBeenCalledOnce();
		expect(mocks.toastSuccess).toHaveBeenCalledWith(
			'Staff user updated successfully.',
		);
		expect(mocks.toastSuccess.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.navigate.mock.invocationCallOrder[0],
		);
	});

	// users-auth-r1-F3: the OLD version of this test asserted
	// `expect(mocks.invalidateQueries).not.toHaveBeenCalled()` here — it
	// certified the exact data-integrity bug it should have caught (the
	// identity write commits durably while the UI reports total failure and
	// keeps showing stale cache). This version asserts the opposite: the
	// committed identity IS reflected, the failure is attributed to the
	// profile step specifically, and a retry never resends the already-saved
	// identity write.
	test('reflects a committed identity write and preserves the pending profile selection when the profile update 422s after the identity PATCH succeeds', async () => {
		mocks.updateStaffUser.mockResolvedValue({
			id: '11111111-1111-1111-1111-111111111111',
		});
		mocks.updateStaffUserProfiles.mockRejectedValue({
			status: 422,
			errors: { ProfileIds: ['maxProfilesPerUser exceeded'] },
		});
		renderPage();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Alex Updated' },
		});
		fireEvent.click(screen.getByRole('checkbox', { name: 'Billing' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateStaffUserProfiles).toHaveBeenCalled(),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalledOnce();

		// The identity write already committed in the database — the UI must
		// invalidate/refetch it rather than silently show stale cache while
		// claiming nothing saved.
		await waitFor(() => expect(mocks.invalidateQueries).toHaveBeenCalled());

		// The failure message must say part of the save succeeded, not just
		// a generic failure that implies nothing happened.
		expect(
			screen.getByText(
				'Identity saved, but profile assignments failed to save.',
			),
		).toBeTruthy();

		// The unsaved profile selection must survive the partial failure.
		expect(
			(screen.getByRole('checkbox', { name: 'Billing' }) as HTMLInputElement)
				.checked,
		).toBe(true);
		expect(
			(
				screen.getByRole('button', {
					name: 'Save changes',
				}) as HTMLButtonElement
			).disabled,
		).toBe(false);

		// A retry must not resend the already-committed identity write.
		mocks.updateStaffUser.mockClear();
		mocks.updateStaffUserProfiles.mockResolvedValue({ assignedProfiles: [] });
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateStaffUserProfiles).toHaveBeenCalledTimes(2),
		);
		expect(mocks.updateStaffUser).not.toHaveBeenCalled();
	});

	test('toasts a failed save once and stays on the edit route', async () => {
		mocks.updateStaffUser.mockRejectedValue(new Error('save failed'));
		renderPage();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Updated' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledOnce(),
		);
		expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
			expect.any(Error),
			'Unable to save staff user.',
		);
		expect(screen.queryByRole('alert')).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	// users-auth-r1-F4: this route computed and displayed `isDirty` but had
	// no `useBlocker`, so Back/Cancel/route navigation discarded dirty edits
	// with no confirmation.
	test('the nav-guard shouldBlockFn blocks while dirty and stops blocking once the save completes', async () => {
		mocks.updateStaffUser.mockResolvedValue({ id: USER_A });
		renderPage();

		expect(mocks.capturedShouldBlockFn?.()).toBe(false);

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Dirty Name' },
		});
		expect(mocks.capturedShouldBlockFn?.()).toBe(true);

		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

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

	test('a dirty change-email dialog blocks Escape/backdrop/Cancel close and discards only after confirming', () => {
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Change email' }));
		const dialog = within(screen.getByTestId('change-staff-user-email-dialog'));
		fireEvent.change(dialog.getByLabelText('Email'), {
			target: { value: 'alex-new@example.com' },
		});

		fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));

		// The drawer must still be open — Cancel on a dirty email edit must
		// not discard it silently.
		expect(screen.getByTestId('change-staff-user-email-dialog')).toBeTruthy();
		expect(screen.getByText('Leave without saving?')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));
		expect(screen.queryByTestId('change-staff-user-email-dialog')).toBeNull();
	});

	test('a pristine change-email dialog closes immediately on Cancel with no confirmation', () => {
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Change email' }));
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(screen.queryByTestId('change-staff-user-email-dialog')).toBeNull();
		expect(screen.queryByText('Leave without saving?')).toBeNull();
	});
});
