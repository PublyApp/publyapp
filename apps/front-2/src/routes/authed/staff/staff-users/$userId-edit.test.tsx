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
import * as React from 'react';
import { createElement, type JSX, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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
	updateStaffUser: vi.fn(),
	updateStaffUserProfiles: vi.fn(),
	invalidateQueries: vi.fn(),
	navigate: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
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

const buildQueryResult = (overrides: Partial<QueryState> = {}): QueryState => ({
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
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				'back-to-user': 'Back to staff user',
				'email-address': 'Email address',
				'account-level': 'Role',
				'first-name': 'First name',
				'last-name': 'Last name',
				'avatar-url': 'Avatar URL',
				profiles: 'Profiles',
				role: 'Role',
				status: 'Status',
				admin: 'Admin',
				user: 'User',
				'status-active': 'Active',
				'status-suspended': 'Suspended',
				cancel: 'Cancel',
				'save-changes': 'Save changes',
				'unknown-error': 'Unable to save staff user.',
				'edit-staff-user': 'Edit staff user',
				'invalid-url': 'Invalid URL',
				'security-preferences-not-available':
					'Not available — security preferences are not yet exposed by the API',
				'showing-first-n-profiles': 'Showing the first profiles.',
			};

			return labels[key] ?? key;
		},
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
		invalidateQueries: (options: { queryKey: unknown[] }) => Promise<unknown>;
	}) => queryClient.invalidateQueries({ queryKey: ['staff', 'staff-users'] }),
	toStaffUserDetails: mocks.toStaffUserDetails,
	toAssignedStaffProfiles: mocks.toAssignedStaffProfiles,
	useStaffUserDetailsQuery: ({ userId }: { userId: string }) =>
		getDetailState(userId),
	useStaffUserProfilesQuery: ({ userId }: { userId: string }) =>
		getProfileState(userId),
	useUpdateStaffUserMutation: mocks.useUpdateStaffUserMutation,
	useUpdateStaffUserProfilesMutation: mocks.useUpdateStaffUserProfilesMutation,
}));

vi.mock('~/lib/query/staff-profiles', () => ({
	toStaffProfileRows: mocks.toStaffProfileRows,
	useStaffProfilesQuery: mocks.useStaffProfilesQuery,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './$userId-edit';

const Component = (
	Route as unknown as {
		component: () => JSX.Element;
	}
).component;

const renderPage = () => render(<Component />);

describe('staff user edit route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		queryState.activeUserId = USER_A;
		queryState.details.clear();
		queryState.profiles.clear();
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
			buildQueryResult({ data: { data: [] } }),
		);
	});

	afterEach(() => {
		cleanup();
	});

	test('delays hydration until profile data resolves to avoid overwriting assignments with []', async () => {
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

		await waitFor(() => expect(screen.getByText('Publishing')).toBeTruthy());
		expect(
			(screen.getByRole('checkbox', { name: 'Publishing' }) as HTMLInputElement)
				.checked,
		).toBe(false);
		expect(
			(screen.getByRole('checkbox', { name: 'Billing' }) as HTMLInputElement)
				.checked,
		).toBe(false);

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
		rendered.rerender(<Component />);

		await waitFor(() => {
			const { getByRole } = rendered;
			const publishing = getByRole('checkbox', { name: 'Publishing' });
			expect((publishing as HTMLInputElement).checked).toBe(true);
		});
		await waitFor(() => {
			const { getByRole } = rendered;
			const billing = getByRole('checkbox', { name: 'Billing' });
			expect((billing as HTMLInputElement).checked).toBe(true);
		});
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
		expect(
			screen.getByText(
				'Not available — security preferences are not yet exposed by the API',
			),
		).toBeTruthy();
		expect(screen.queryAllByRole('switch')).toHaveLength(0);
		expect(screen.getByDisplayValue('alex@example.com')).toHaveProperty(
			'disabled',
			true,
		);
		expect(screen.getByText('Publishing')).toBeTruthy();
		expect(screen.getByText('Billing')).toBeTruthy();
	});

	test('does not hint at a truncated profile list when the profiles query has no further cursor', () => {
		renderPage();

		expect(screen.queryByText('Showing the first profiles.')).toBeNull();
	});

	test('hints that the assignable-profile list is truncated when the profiles query reports a further cursor', () => {
		mocks.useStaffProfilesQuery.mockReturnValue(
			buildQueryResult({ data: { data: [], nextCursor: 'cursor-2' } }),
		);

		renderPage();

		expect(screen.getByText('Showing the first profiles.')).toBeTruthy();
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
	});

	test('keeps the ticked profile checkbox and an enabled Save button when the identity update succeeds but the profile update 422s', async () => {
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
		// The identity mutation must not invalidate on its own — an
		// invalidation between the two mutations would refetch and re-run the
		// hydration effect, wiping this still-ticked checkbox (r3-F8).
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
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
	});

	test('surfaces a failed save and stays on the edit route', async () => {
		mocks.updateStaffUser.mockRejectedValue(new Error('save failed'));
		renderPage();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Updated' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toBe('save failed'),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});
});
