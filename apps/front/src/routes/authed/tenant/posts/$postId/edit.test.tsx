/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	useParams: vi.fn(() => ({ postId: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa' })),
	invalidateQueries: vi.fn(),
	useTenantPostDetailsQuery: vi.fn((): Record<string, unknown> => ({
		data: undefined,
		isPending: true,
		isError: false,
		error: null,
		refetch: vi.fn(),
		isFetching: false,
	})),
	useTenantProjectsQuery: vi.fn(() => ({
		data: undefined,
		isPending: true,
	})),
	useDeleteTenantPostMutation: vi.fn(() => ({
		mutateAsync: vi.fn(),
		isPending: false,
	})),
	savePost: vi.fn().mockResolvedValue({}),
	invalidateTenantPosts: vi.fn().mockResolvedValue(undefined),
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
		useParams: mocks.useParams,
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
		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
	useBlocker: () => ({ status: 'idle', proceed: undefined, reset: undefined }),
}));

vi.mock('~/components/error-views/AppErrorView', () => ({
	AppErrorView: ({ title, testId }: { title?: string; testId?: string }) => (
		<div data-testid={testId ?? 'app-error-view'}>{title}</div>
	),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect" />,
}));

vi.mock('~/components/field', () => ({
	Field: {
		Textarea: () => <textarea data-testid="field-textarea-stub" />,
		Select: () => <div data-testid="field-select-stub" />,
	},
	Form: ({
		children,
		onSubmit,
	}: {
		children: ReactNode;
		onSubmit?: React.SubmitEventHandler;
	}) => (
		<form onSubmit={onSubmit} data-testid="form-stub">
			{children}
		</form>
	),
	FormActionBar: ({ children }: { children: ReactNode }) => (
		<div data-testid="form-action-bar">{children}</div>
	),
	FormPageLayout: ({
		children,
		'data-testid': testId,
	}: {
		children: ReactNode;
		'data-testid'?: string;
	}) => <div data-testid={testId}>{children}</div>,
}));

vi.mock('~/lib/query/tenant-posts', () => ({
	useTenantPostDetailsQuery: mocks.useTenantPostDetailsQuery,
	useDeleteTenantPostMutation: mocks.useDeleteTenantPostMutation,
	savePost: mocks.savePost,
	invalidateTenantPosts: mocks.invalidateTenantPosts,
	toTenantPostDetails: vi.fn((data: unknown) => {
		if (!data) return null;
		const d = data as Record<string, unknown>;
		return {
			id: (d.id as string) ?? 'test-id',
			body: (d.body as string) ?? '',
			projectId: d.projectId ?? null,
			status: d.status ?? null,
			createdAt: null,
			updatedAt: null,
		};
	}),
	tenantPostCrumbQuery: vi.fn(),
	selectTenantPostCrumbName: vi.fn(),
}));

vi.mock('~/lib/query/tenant-projects', () => ({
	useTenantProjectsQuery: mocks.useTenantProjectsQuery,
	toTenantProjectItems: vi.fn(() => []),
}));

vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => '11111111-1111-1111-1111-111111111111',
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

const EN_LABELS: Record<string, string> = {
	'posts:edit-post': 'Edit post',
	'posts:back-to-drafts': 'Back to drafts',
	'posts:body-label': 'Body',
	'posts:project-label': 'Project',
	'posts:project-placeholder': 'No project',
	'posts:body-placeholder': 'Write your post...',
	'posts:move-to-bin': 'Move to bin',
	'posts:move-to-bin-confirm': 'Are you sure?',
	'posts:danger-zone-title': 'Danger zone',
	'posts:danger-zone-description': 'Delete this post permanently.',
	'posts:unsaved-changes-title': 'Unsaved changes',
	'posts:unsaved-changes-description':
		'You have unsaved changes. Leave without saving?',
	'posts:saving': 'Saving...',
	'posts:save': 'Save',
	'common:cancel': 'Cancel',
	'common:leave': 'Leave',
	'common:stay': 'Stay',
	'common:save-changes': 'Save changes',
	'common:not-found': 'Not found',
	'common:error-loading-data': 'Error loading data',
	'common:an-error-occurred': 'An error occurred',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first
import { Route } from './edit';

const TenantPostEditPage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantPostEditPage', () => {
	test('shows loading state while details are pending', () => {
		render(<TenantPostEditPage />);

		expect(screen.getByTestId('tenant-post-edit-loading')).toBeTruthy();
	});

	test('shows not-found when details return null', () => {
		mocks.useTenantPostDetailsQuery.mockReturnValue({
			data: null,
			isPending: false,
			isSuccess: true,
			isError: false,
			error: null,
			refetch: vi.fn(),
			isFetching: false,
		});

		render(<TenantPostEditPage />);

		expect(screen.getByTestId('tenant-post-edit-not-found')).toBeTruthy();
		expect(screen.getByText('Not found')).toBeTruthy();
	});

	test('shows error view on fetch failure', () => {
		mocks.useTenantPostDetailsQuery.mockReturnValue({
			data: undefined,
			isPending: false,
			isSuccess: false,
			isError: true,
			error: new Error('network failure'),
			refetch: vi.fn(),
			isFetching: false,
		});

		render(<TenantPostEditPage />);

		expect(screen.getByTestId('tenant-post-edit-error')).toBeTruthy();
	});

	test('renders edit form when details are loaded', () => {
		mocks.useTenantPostDetailsQuery.mockReturnValue({
			data: {
				id: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
				body: 'Hello world',
				projectId: null,
			},
			isPending: false,
			isSuccess: true,
			isError: false,
			error: null,
			refetch: vi.fn(),
			isFetching: false,
		});

		render(<TenantPostEditPage />);

		expect(screen.getByTestId('tenant-post-edit-page')).toBeTruthy();
		expect(screen.getByTestId('form-stub')).toBeTruthy();
		expect(screen.getByTestId('tenant-post-edit-save')).toBeTruthy();
	});

	test('danger zone has move-to-bin button', () => {
		mocks.useTenantPostDetailsQuery.mockReturnValue({
			data: {
				id: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
				body: 'Hello world',
				projectId: null,
			},
			isPending: false,
			isSuccess: true,
			isError: false,
			error: null,
			refetch: vi.fn(),
			isFetching: false,
		});

		render(<TenantPostEditPage />);

		expect(screen.getByTestId('tenant-post-edit-move-to-bin')).toBeTruthy();
	});

	test('reserved side column placeholder exists', () => {
		mocks.useTenantPostDetailsQuery.mockReturnValue({
			data: {
				id: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
				body: 'Hello world',
				projectId: null,
			},
			isPending: false,
			isSuccess: true,
			isError: false,
			error: null,
			refetch: vi.fn(),
			isFetching: false,
		});

		render(<TenantPostEditPage />);

		expect(
			screen.getByTestId('tenant-post-edit-reserved-side-column'),
		).toBeTruthy();
	});
});
