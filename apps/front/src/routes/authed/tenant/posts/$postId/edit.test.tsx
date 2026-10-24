/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	BODY_KEY,
	NO_OVERRIDE,
	toWireDestinations,
	withText,
} from '~/lib/publishing/destination-overrides';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

import type { DestinationOverridesState } from '../_use-destination-overrides';

/** Named owner contract: each mock feeds a different slice of the hook
 * result across tests, so the shape stays an open dictionary instead of
 * relying on inference from whichever mock runs first. */
interface TenantPostDetailsQueryResultMock {
	data?: unknown;
	isPending?: boolean;
	isSuccess?: boolean;
	isError?: boolean;
	error?: unknown;
	refetch?: unknown;
	isFetching?: boolean;
}

/** The props the page last handed a stubbed child. */
interface CapturedProps {
	segments?: { id: string; text: string }[];
	destinationOverrides?: DestinationOverridesState;
	isPostDirty?: boolean;
}

const mocks = vi.hoisted(() => ({
	composerProps: { current: undefined as CapturedProps | undefined },
	blockProps: { current: undefined as CapturedProps | undefined },
	shouldBlock: { current: undefined as (() => boolean) | undefined },
	navigate: vi.fn(),
	useParams: vi.fn(() => ({ postId: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa' })),
	invalidateQueries: vi.fn(),
	useTenantPostDetailsQuery: vi.fn((): TenantPostDetailsQueryResultMock => ({
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
	invalidateTenantScheduledPublications: vi.fn().mockResolvedValue(undefined),
	invalidateTenantPublications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

// The picker pulls its own mutation hooks; the page tests only assert that
// its mount point exists, so a static stub keeps this suite focused.
vi.mock('../_post-image-picker', () => ({
	PostImagePicker: () => (
		<div data-testid="tenant-post-edit-image-picker-stub" />
	),
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
	useBlocker: ({ shouldBlockFn }: { shouldBlockFn: () => boolean }) => {
		mocks.shouldBlock.current = shouldBlockFn;
		return { status: 'idle', proceed: undefined, reset: undefined };
	},
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
		if (!data) {
			return null;
		}
		const d = data as Record<string, unknown>;
		return {
			id: (d.id as string) ?? 'test-id',
			body: (d.body as string) ?? '',
			projectId: d.projectId ?? null,
			status: d.status ?? null,
			createdAt: null,
			updatedAt: null,
			images: (d.images as unknown[]) ?? [],
			segments: (d.segments as unknown[]) ?? [],
			publishedSegmentCount: (d.publishedSegmentCount as number) ?? 0,
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

vi.mock('~/lib/query/tenant-scheduled-publications', () => ({
	invalidateTenantScheduledPublications:
		mocks.invalidateTenantScheduledPublications,
}));

vi.mock('~/lib/query/tenant-publications', () => ({
	invalidateTenantPublications: mocks.invalidateTenantPublications,
}));

vi.mock('../_use-publish-selection', () => ({
	usePublishSelection: () => ({
		targets: [],
		selectedIds: [],
		toggle: () => undefined,
		destinations: [],
		imageLimits: null,
	}),
}));

vi.mock('../_publish-on-block', () => ({
	PublishOnBlock: (props: CapturedProps) => {
		mocks.blockProps.current = props;
		return <div data-testid="publish-on-block-stub" />;
	},
}));

// The destination chips and the scheduled-destination editor pull their own
// queries; this suite only asserts what the page hands them.
vi.mock('../_composer-destinations', () => ({
	ComposerDestinations: (
		props: CapturedProps & { body: string; images: { key: string }[] },
	) => {
		mocks.composerProps.current = props;
		return (
			<div
				data-testid="composer-destinations-stub"
				data-body={props.body}
				data-image-keys={props.images.map((image) => image.key).join(',')}
			/>
		);
	},
}));

vi.mock('../_scheduled-renditions-block', () => ({
	ScheduledRenditionsBlock: ({
		postId,
		isPostDirty,
	}: {
		postId: string;
		isPostDirty: boolean;
	}) => (
		<div
			data-testid="scheduled-renditions-stub"
			data-post-id={postId}
			data-dirty={String(isPostDirty)}
		/>
	),
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

const EN_LABELS: TestLabelMap = {
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

	test('publish-on block occupies the reserved side column', () => {
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

		expect(screen.getByTestId('publish-on-block-stub')).toBeTruthy();
	});

	test('hands the destinations the post images (keyed by asset id) and the scheduled destinations its id', () => {
		mocks.useTenantPostDetailsQuery.mockReturnValue({
			data: {
				id: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
				body: 'Hello world',
				projectId: null,
				images: [
					{ id: 'asset-1', url: 'https://files.example/1.png', altText: 'One' },
					{ id: null, url: 'https://files.example/2.png', altText: null },
					{ id: 'asset-3', url: 'https://files.example/3.png', altText: null },
				],
			},
			isPending: false,
			isSuccess: true,
			isError: false,
			error: null,
			refetch: vi.fn(),
			isFetching: false,
		});

		render(<TenantPostEditPage />);

		const destinations = screen.getByTestId('composer-destinations-stub');
		// An image with no asset id cannot be named by an override: it is left out.
		expect(destinations.getAttribute('data-image-keys')).toBe(
			'asset-1,asset-3',
		);
		const scheduled = screen.getByTestId('scheduled-renditions-stub');
		expect(scheduled.getAttribute('data-post-id')).toBe(
			'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
		);
		expect(scheduled.getAttribute('data-dirty')).toBe('false');
	});

	test('save submission refreshes the post list and scheduled-publication surfaces for the tenant', async () => {
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
		mocks.savePost.mockResolvedValue({
			id: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
			body: 'Hello world updated',
			projectId: null,
		});
		mocks.invalidateTenantPosts.mockClear();

		render(<TenantPostEditPage />);

		const form = screen.getByTestId('form-stub') as HTMLFormElement;
		fireEvent.submit(form);

		// Wait for the async savePost + invalidate chain to complete.
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(mocks.savePost).toHaveBeenCalledWith(
			expect.objectContaining({
				postId: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
				tenantId: '11111111-1111-1111-1111-111111111111',
			}),
		);
		// A plain post sends exactly what it always did: no segments field.
		expect(mocks.savePost.mock.calls[0]?.[0]?.segments).toBeUndefined();
		expect(mocks.invalidateTenantPosts).toHaveBeenCalledWith(
			expect.anything(),
			'11111111-1111-1111-1111-111111111111',
		);
		// Scheduled-publication windows MUST also be invalidated so calendar
		// and queue surfaces reflect the edited post body (#2053 coherence).
		expect(mocks.invalidateTenantScheduledPublications).toHaveBeenCalledWith(
			expect.anything(),
			'11111111-1111-1111-1111-111111111111',
		);
		expect(mocks.invalidateTenantPublications).toHaveBeenCalledWith(
			expect.anything(),
			'11111111-1111-1111-1111-111111111111',
		);
	});

	test('a refetch keeps the segment ids, so a follow-up customization survives it and is still sent', () => {
		const loadedPost = (images: unknown[]) =>
			mocks.useTenantPostDetailsQuery.mockReturnValue({
				data: {
					id: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
					body: 'Hello world',
					projectId: null,
					segments: [{ number: 2, body: 'Follow-up' }],
					images,
				},
				isPending: false,
				isSuccess: true,
				isError: false,
				error: null,
				refetch: vi.fn(),
				isFetching: false,
			});
		loadedPost([]);
		const view = render(<TenantPostEditPage />);
		const idsBefore = mocks.composerProps.current?.segments?.map(
			(segment) => segment.id,
		);

		// Customize the follow-up (segment 2) for one destination.
		act(() => {
			mocks.composerProps.current?.destinationOverrides?.update(
				'acc-1',
				withText(NO_OVERRIDE, idsBefore?.[0] ?? '', 'Follow-up for acc-1'),
			);
		});
		// An image is added: the post details refetch with new data.
		loadedPost([{ id: 'asset-9', url: 'https://files.example/9.png' }]);
		view.rerender(<TenantPostEditPage />);

		const idsAfter = mocks.blockProps.current?.segments?.map(
			(segment) => segment.id,
		);
		expect(idsAfter).toEqual(idsBefore);
		expect(
			toWireDestinations({
				accountIds: ['acc-1'],
				overrides:
					mocks.blockProps.current?.destinationOverrides?.overrides ?? {},
				segmentKeys: [BODY_KEY, ...(idsAfter ?? [])],
				imageKeys: ['asset-9'],
			}),
		).toEqual([
			{
				socialAccountId: 'acc-1',
				overrides: { segments: [{ position: 1, text: 'Follow-up for acc-1' }] },
			},
		]);
	});

	test("hands the publish block the post's unsaved state, and leaving with customizations asks first", () => {
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
		expect(mocks.blockProps.current?.isPostDirty).toBe(false);
		expect(mocks.shouldBlock.current?.()).toBe(false);

		// Adding a thread segment makes the post dirty.
		fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
		expect(mocks.blockProps.current?.isPostDirty).toBe(true);
		expect(mocks.shouldBlock.current?.()).toBe(true);
	});

	test('unsaved destination customizations alone also guard leaving the page', () => {
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
		expect(mocks.shouldBlock.current?.()).toBe(false);

		act(() => {
			mocks.composerProps.current?.destinationOverrides?.update(
				'acc-1',
				withText(NO_OVERRIDE, BODY_KEY, 'Customized'),
			);
		});

		expect(mocks.shouldBlock.current?.()).toBe(true);
	});
});
