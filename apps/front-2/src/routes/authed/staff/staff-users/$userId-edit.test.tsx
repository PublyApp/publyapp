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

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useParams: () => ({
			userId: '11111111-1111-1111-1111-111111111111',
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
	toStaffUserDetails: mocks.toStaffUserDetails,
	toAssignedStaffProfiles: mocks.toAssignedStaffProfiles,
	useStaffUserDetailsQuery: mocks.useStaffUserDetailsQuery,
	useStaffUserProfilesQuery: mocks.useStaffUserProfilesQuery,
	useUpdateStaffUserMutation: mocks.useUpdateStaffUserMutation,
	useUpdateStaffUserProfilesMutation: mocks.useUpdateStaffUserProfilesMutation,
}));

vi.mock('~/lib/query/staff-profiles', () => ({
	toStaffProfileRows: mocks.toStaffProfileRows,
	useStaffProfilesQuery: mocks.useStaffProfilesQuery,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './$userId-edit';

const buildQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const renderPage = () => {
	const Component = (
		Route as unknown as {
			component: () => JSX.Element;
		}
	).component;

	return render(<Component />);
};

describe('staff user edit route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
		mocks.useStaffUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: { id: '11111111-1111-1111-1111-111111111111' },
			}),
		);
		mocks.useStaffUserProfilesQuery.mockReturnValue(
			buildQueryResult({ data: { assignedProfiles: [] } }),
		);
		mocks.useStaffProfilesQuery.mockReturnValue(
			buildQueryResult({ data: { data: [] } }),
		);
		mocks.toStaffUserDetails.mockReturnValue({
			id: '11111111-1111-1111-1111-111111111111',
			email: 'alex@example.com',
			firstName: 'Alex',
			lastName: 'User',
			avatarUrl: 'https://example.com/avatar.png',
			accountLevel: 'Admin',
			status: 'Active',
			displayName: 'Alex User',
			createdAt: null,
			updatedAt: null,
		});
		mocks.toAssignedStaffProfiles.mockReturnValue([
			{ id: 'profile-1', name: 'Publishing', description: null },
		]);
		mocks.toStaffProfileRows.mockReturnValue([
			{ id: 'profile-1', name: 'Publishing', description: null },
			{ id: 'profile-2', name: 'Billing', description: null },
		]);
	});

	afterEach(() => {
		cleanup();
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
			screen.getByDisplayValue('https://example.com/avatar.png'),
		).toBeTruthy();
		expect(screen.getByDisplayValue('Admin')).toBeTruthy();
		expect(screen.getByDisplayValue('Active')).toBeTruthy();
		expect(screen.getByDisplayValue('alex@example.com')).toHaveProperty(
			'disabled',
			true,
		);
		expect(screen.getByText('Publishing')).toBeTruthy();
		expect(screen.getByText('Billing')).toBeTruthy();
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
