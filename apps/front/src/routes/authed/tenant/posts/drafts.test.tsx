/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	search: {},
	navigate: vi.fn(),
	invalidateQueries: vi.fn(),
	useTenantPostsQuery: vi.fn(() => ({
		data: undefined,
		isPending: true,
		isError: false,
		error: null,
		refetch: vi.fn(),
		isFetching: false,
	})),
	useDeleteTenantPostMutation: vi.fn(() => ({
		mutateAsync: vi.fn(),
		isPending: false,
	})),
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
		useSearch: () => mocks.search,
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
}));

vi.mock('~/lib/query/tenant-posts', () => ({
	useTenantPostsQuery: mocks.useTenantPostsQuery,
	useDeleteTenantPostMutation: mocks.useDeleteTenantPostMutation,
	toTenantPostRows: vi.fn(() => []),
	invalidateTenantPosts: vi.fn(),
}));

vi.mock('./_create-post-drawer', () => ({
	CreatePostDrawer: () => null,
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => '11111111-1111-1111-1111-111111111111',
}));

const EN_LABELS: TestLabelMap = {
	'posts:drafts': 'Drafts',
	'posts:drafts-description': 'Your draft posts will appear here.',
	'posts:new-post': 'New post',
	'posts:body-label': 'Body',
	'posts:move-to-bin': 'Move to bin',
	'posts:move-to-bin-confirm': 'Are you sure?',
	'common:actions': 'Actions',
	'common:actions-for': 'Actions for {{name}}',
	'common:updated-at': 'Updated at',
	'common:edit': 'Edit',
	'common:an-error-occurred': 'An error occurred',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './drafts';

const TenantPostsDraftsPage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantPostsDraftsPage', () => {
	test('renders the drafts heading and create button', () => {
		render(<TenantPostsDraftsPage />);

		expect(screen.getByRole('heading', { name: 'Drafts' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'New post' })).toBeTruthy();
	});

	test('shows the drafts table with test id', () => {
		render(<TenantPostsDraftsPage />);

		expect(screen.getByTestId('tenant-posts-drafts-page')).toBeTruthy();
		expect(screen.getByTestId('tenant-posts-drafts-table')).toBeTruthy();
	});

	test('renders new-post button that opens the create drawer', () => {
		render(<TenantPostsDraftsPage />);

		const button = screen.getByTestId('tenant-posts-new-post');
		expect(button).toBeTruthy();
		expect(button.textContent).toContain('New post');
	});

	test('delete mutation is available for bin confirm flow', () => {
		render(<TenantPostsDraftsPage />);

		expect(mocks.useDeleteTenantPostMutation).toHaveBeenCalled();
	});
});
