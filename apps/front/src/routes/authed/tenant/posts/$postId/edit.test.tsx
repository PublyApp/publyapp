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
import { act } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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
	segmentImageCounts?: Record<string, number>;
	disabled?: boolean;
}

type ProjectsQueryStub = { data?: { items: never[] }; isPending: boolean };

const mocks = vi.hoisted(() => ({
	composerProps: { current: undefined as CapturedProps | undefined },
	blockProps: { current: undefined as CapturedProps | undefined },
	shouldBlock: { current: undefined as (() => boolean) | undefined },
	beforeUnload: { current: undefined as (() => boolean) | undefined },
	navigate: vi.fn(),
	canGoBack: true,
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
	useTenantProjectsQuery: vi.fn((): ProjectsQueryStub => ({
		data: undefined,
		isPending: true,
	})),
	useDeleteTenantPostMutation: vi.fn(() => ({
		mutateAsync: vi.fn(),
		isPending: false,
	})),
	savePost: vi.fn().mockResolvedValue({}),
	readCreatedSegments: vi.fn(),
	attachMutateAsync: vi.fn(),
	altMutateAsync: vi.fn(),
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
	PostImagePicker: ({
		segmentId,
		existingImages,
		disabled,
		selections,
		onSelect,
	}: {
		segmentId?: string;
		existingImages?: unknown[];
		disabled?: boolean;
		selections?: unknown[];
		onSelect?: (next: unknown[]) => void;
	}) => (
		<div
			data-testid="tenant-post-edit-image-picker-stub"
			data-disabled={String(Boolean(disabled))}
			data-segment-id={segmentId ?? ''}
			data-image-count={existingImages?.length ?? 0}
		>
			{onSelect ? (
				<button
					type="button"
					data-testid="stub-pick"
					onClick={() =>
						onSelect([
							...(selections ?? []),
							{
								id: `picked-${(selections ?? []).length}`,
								file: new File(['x'], 'x.png', { type: 'image/png' }),
								altText: '',
							},
						])
					}
				/>
			) : null}
		</div>
	),
}));

// The upload hooks need a query client the page tests do not provide.
vi.mock('~/lib/query/tenant-post-images', () => ({
	useAttachPostImageMutation: () => ({
		mutateAsync: mocks.attachMutateAsync,
		isPending: false,
	}),
	useUpdatePostImageAltMutation: () => ({
		mutateAsync: mocks.altMutateAsync,
		isPending: false,
	}),
	useInvalidatePostImageCaches: () => vi.fn(),
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
	useCanGoBack: () => mocks.canGoBack,
	useRouter: () => ({ invalidate: vi.fn() }),
	useBlocker: ({
		shouldBlockFn,
		enableBeforeUnload,
	}: {
		shouldBlockFn: () => boolean;
		enableBeforeUnload: () => boolean;
	}) => {
		mocks.shouldBlock.current = shouldBlockFn;
		mocks.beforeUnload.current = enableBeforeUnload;
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
		Select: ({ isDisabled }: { isDisabled?: boolean }) => (
			<div
				data-testid="field-select-stub"
				data-disabled={String(Boolean(isDisabled))}
			/>
		),
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

vi.mock('~/lib/query/tenant-posts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useTenantPostDetailsQuery: mocks.useTenantPostDetailsQuery,
	useDeleteTenantPostMutation: mocks.useDeleteTenantPostMutation,
	savePost: mocks.savePost,
	readCreatedSegments: mocks.readCreatedSegments,
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

vi.mock('~/lib/query/tenant-projects', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useTenantProjectsQuery: mocks.useTenantProjectsQuery,
	toTenantProjectItems: vi.fn(() => []),
}));

vi.mock('~/lib/query/tenants-for-picker', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useResolvedWorkspaceTenantId: () => '11111111-1111-1111-1111-111111111111',
}));

vi.mock(
	'~/lib/query/tenant-scheduled-publications',
	async (importOriginal) => ({
		...(await importOriginal<object>()),
		invalidateTenantScheduledPublications:
			mocks.invalidateTenantScheduledPublications,
	}),
);

vi.mock('~/lib/query/tenant-publications', async (importOriginal) => ({
	...(await importOriginal<object>()),
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
	shouldLogoutForFailure: (error: unknown) =>
		(error as { responseStatusCode?: number } | null)?.responseStatusCode ===
		401,
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
import { AuthedRouteBoundary } from '../_authed-route-boundary.test-helper';
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

	test('another post remounts the page (no form, queue or request carried over)', () => {
		const options: { remountDeps?: unknown } = Route.options;
		const remountDeps = options.remountDeps;
		if (typeof remountDeps !== 'function') {
			throw new Error('no remountDeps');
		}
		expect(remountDeps({ params: { postId: 'p-1' } })).toBe('p-1');
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

	test('save without an in-app previous page lands on the drafts list instead of leaving the app (#2410)', async () => {
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
		mocks.canGoBack = false;
		mocks.navigate.mockClear();
		const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});

		const { rerender } = render(<TenantPostEditPage />);
		fireEvent.submit(screen.getByTestId('form-stub'));
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(back).not.toHaveBeenCalled();
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: '/tenant/posts/drafts',
			replace: true,
		});

		mocks.canGoBack = true;
		rerender(<TenantPostEditPage />);
		mocks.navigate.mockClear();
		fireEvent.submit(screen.getByTestId('form-stub'));
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(back).toHaveBeenCalledTimes(1);
		expect(mocks.navigate).not.toHaveBeenCalled();
		back.mockRestore();
	});

	test('save names each follow-up by its stored segment id, so images follow their text', async () => {
		mocks.useTenantPostDetailsQuery.mockReturnValue({
			data: {
				id: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
				body: 'Hello world',
				projectId: null,
				segments: [
					{ id: 'seg-b', number: 2, body: 'B', images: [] },
					{ id: 'seg-c', number: 3, body: 'C', images: [] },
				],
				images: [],
			},
			isPending: false,
			isSuccess: true,
			isError: false,
			error: null,
			refetch: vi.fn(),
			isFetching: false,
		});
		mocks.savePost.mockClear();
		mocks.savePost.mockResolvedValue({});

		render(<TenantPostEditPage />);
		fireEvent.submit(screen.getByTestId('form-stub') as HTMLFormElement);
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(mocks.savePost.mock.calls[0]?.[0]?.segments).toEqual(['B', 'C']);
		expect(mocks.savePost.mock.calls[0]?.[0]?.segmentIds).toEqual([
			'seg-b',
			'seg-c',
		]);
	});

	test('a refused blank follow-up shows its message on the page instead of failing silently', async () => {
		mocks.useTenantPostDetailsQuery.mockReturnValue({
			data: {
				id: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
				body: 'Hello world',
				projectId: null,
				segments: [{ id: 'seg-b', number: 2, body: 'B', images: [] }],
				images: [],
			},
			isPending: false,
			isSuccess: true,
			isError: false,
			error: null,
			refetch: vi.fn(),
			isFetching: false,
		});
		mocks.savePost.mockRejectedValue({
			status: 422,
			detail: 'Segment 3 is empty',
			errors: { segments: ['Segment 3 is empty'] },
		});

		render(<TenantPostEditPage />);
		fireEvent.submit(screen.getByTestId('form-stub') as HTMLFormElement);

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Segment 3 is empty');
	});

	test('a refetch keeps the segment ids, so a follow-up customization survives it and is still sent', () => {
		const loadedPost = (images: unknown[]) =>
			mocks.useTenantPostDetailsQuery.mockReturnValue({
				data: {
					id: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
					body: 'Hello world',
					projectId: null,
					segments: [{ number: 2, body: 'Follow-up', images: [] }],
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

	test('a refetch after an image change keeps what the user typed in a follow-up (#2181)', () => {
		const loadedPost = (images: unknown[]) =>
			mocks.useTenantPostDetailsQuery.mockReturnValue({
				data: {
					id: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
					body: 'Hello world',
					projectId: null,
					segments: [{ id: 'seg-b', number: 2, body: 'B', images }],
					images: [],
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
		const idBefore = mocks.blockProps.current?.segments?.[0]?.id;

		fireEvent.change(screen.getByTestId('tenant-posts-segment-body'), {
			target: { value: 'B, edited but not saved' },
		});
		// An image is attached to the segment: the post details refetch.
		loadedPost([{ id: 'img-1', url: 'https://files.example/1.png' }]);
		view.rerender(<TenantPostEditPage />);

		expect(
			(screen.getByTestId('tenant-posts-segment-body') as HTMLTextAreaElement)
				.value,
		).toBe('B, edited but not saved');
		expect(mocks.blockProps.current?.segments?.[0]?.id).toBe(idBefore);
		expect(mocks.blockProps.current?.segmentImageCounts).toEqual({
			[idBefore ?? '']: 1,
		});
		expect(mocks.blockProps.current?.isPostDirty).toBe(true);
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
		// The browser's unload prompt follows the same switch.
		expect(mocks.beforeUnload.current?.()).toBe(true);
	});

	test('every stored follow-up gets its own image picker, and the publish block counts its images (#2181)', () => {
		mocks.useTenantPostDetailsQuery.mockReturnValue({
			data: {
				id: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
				body: 'Hello world',
				projectId: null,
				segments: [
					{
						id: 'seg-b',
						number: 2,
						body: 'B',
						images: [{ id: 'i1' }, { id: 'i2' }],
					},
					{ id: 'seg-c', number: 3, body: 'C', images: [] },
				],
				images: [],
			},
			isPending: false,
			isSuccess: true,
			isError: false,
			error: null,
			refetch: vi.fn(),
			isFetching: false,
		});

		render(<TenantPostEditPage />);

		const pickers = screen
			.getAllByTestId('tenant-post-edit-image-picker-stub')
			.filter((node) => node.getAttribute('data-segment-id') !== '');
		expect(
			pickers.map((node) => [
				node.getAttribute('data-segment-id'),
				node.getAttribute('data-image-count'),
			]),
		).toEqual([
			['seg-b', '2'],
			['seg-c', '0'],
		]);
		const draftIds = mocks.blockProps.current?.segments?.map(
			(segment) => segment.id,
		);
		expect(mocks.blockProps.current?.segmentImageCounts).toEqual({
			[draftIds?.[0] ?? '']: 2,
			[draftIds?.[1] ?? '']: 0,
		});
	});

	test('a published segment keeps its images read-only, an unpublished one stays editable', () => {
		mocks.useTenantPostDetailsQuery.mockReturnValue({
			data: {
				id: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
				body: 'Hello world',
				projectId: null,
				publishedSegmentCount: 2,
				segments: [
					{ id: 'seg-b', number: 2, body: 'B', images: [] },
					{ id: 'seg-c', number: 3, body: 'C', images: [] },
				],
				images: [],
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
			screen
				.getAllByTestId('tenant-post-edit-image-picker-stub')
				.filter((node) => node.getAttribute('data-segment-id') !== '')
				.map((node) => node.getAttribute('data-disabled')),
		).toEqual(['true', 'false']);
	});

	describe('images picked for a follow-up added in the editor', () => {
		beforeEach(() => {
			mocks.useTenantPostDetailsQuery.mockReturnValue({
				data: {
					id: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
					body: 'Hello world',
					projectId: null,
					segments: [],
					images: [],
				},
				isPending: false,
				isSuccess: true,
				isError: false,
				error: null,
				refetch: vi.fn(),
				isFetching: false,
			});
			mocks.savePost.mockClear();
			mocks.savePost.mockResolvedValue({});
			mocks.readCreatedSegments.mockReset();
			mocks.readCreatedSegments.mockResolvedValue([{ id: 'stored-new' }]);
			mocks.attachMutateAsync.mockReset();
			mocks.attachMutateAsync.mockResolvedValue({ id: 'asset-1' });
		});

		const addFollowUpAndPick = () => {
			render(<TenantPostEditPage />);
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.change(screen.getByTestId('tenant-posts-segment-body'), {
				target: { value: 'Typed follow-up' },
			});
			fireEvent.click(screen.getByTestId('stub-pick'));
		};

		test('saves the post once, then attaches the image to that new segment: one action', async () => {
			addFollowUpAndPick();

			await waitFor(() =>
				expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1),
			);
			expect(mocks.savePost).toHaveBeenCalledTimes(1);
			expect(mocks.savePost.mock.calls[0]?.[0]).toMatchObject({
				segments: ['Typed follow-up'],
				segmentIds: [undefined],
			});
			expect(mocks.readCreatedSegments).toHaveBeenCalledTimes(1);
			expect(mocks.attachMutateAsync.mock.calls[0]?.[0]).toMatchObject({
				segmentId: 'stored-new',
			});
			// The segment now has a stored id: its picker is the stored one.
			await waitFor(() =>
				expect(
					screen
						.getAllByTestId('tenant-post-edit-image-picker-stub')
						.some(
							(node) => node.getAttribute('data-segment-id') === 'stored-new',
						),
				).toBe(true),
			);
		});

		test('a failed auto-save names its cause and keeps the file queued: Try again finishes it', async () => {
			mocks.savePost.mockRejectedValueOnce({
				status: 422,
				body: {
					status: 422,
					title: 'Blank follow-up',
					detail: 'The follow-up is blank.',
				},
			});
			addFollowUpAndPick();

			const failure = await screen.findByTestId(
				'tenant-posts-segment-images-failure',
			);
			expect(failure.textContent).toContain('The follow-up is blank.');
			// A refusal that is not a 401 never logs out.
			expect(screen.queryByTestId('logout-redirect')).toBeNull();
			expect(mocks.attachMutateAsync).not.toHaveBeenCalled();

			fireEvent.click(screen.getByTestId('tenant-posts-segment-images-retry'));

			await waitFor(() =>
				expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1),
			);
			expect(mocks.savePost).toHaveBeenCalledTimes(2);
			expect(mocks.attachMutateAsync.mock.calls[0]?.[0]).toMatchObject({
				segmentId: 'stored-new',
			});
		});

		test('files queued for a follow-up the user then removes are dropped: a later pick still attaches (N1)', async () => {
			mocks.savePost.mockRejectedValueOnce(new Error('offline'));
			render(<TenantPostEditPage />);
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.click(screen.getByTestId('stub-pick'));
			await screen.findByTestId('tenant-posts-segment-images-failure');

			// The follow-up (blank, so removed at once) goes away with its file.
			fireEvent.click(screen.getByTestId('tenant-posts-segment-remove'));
			expect(
				screen.queryByTestId('tenant-posts-segment-images-failure'),
			).toBeNull();
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.change(screen.getByTestId('tenant-posts-segment-body'), {
				target: { value: 'Second try' },
			});
			fireEvent.click(screen.getByTestId('stub-pick'));

			await waitFor(() =>
				expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1),
			);
			expect(mocks.attachMutateAsync.mock.calls[0]?.[0]).toMatchObject({
				segmentId: 'stored-new',
			});
		});

		test('publishing and the post own images wait while the save and upload run (N2, N5, N7)', async () => {
			let finish: (value: unknown) => void = () => undefined;
			mocks.savePost.mockImplementation(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					}),
			);
			addFollowUpAndPick();

			await waitFor(() =>
				expect(mocks.blockProps.current?.disabled).toBe(true),
			);
			const postLevelPicker = screen
				.getAllByTestId('tenant-post-edit-image-picker-stub')
				.find(
					(node) =>
						node.getAttribute('data-segment-id') === '' &&
						node.querySelector('[data-testid="stub-pick"]') === null,
				);
			expect(postLevelPicker?.getAttribute('data-disabled')).toBe('true');
			// Read-only is not "published".
			expect(screen.queryByTestId('tenant-posts-segment-published')).toBeNull();
			await act(async () => {
				finish({});
			});
			await waitFor(() =>
				expect(mocks.blockProps.current?.disabled).toBe(false),
			);
		});

		test('leaving asks first while files are still queued, even though the post itself was saved (N3)', async () => {
			mocks.attachMutateAsync.mockRejectedValue(new Error('upload failed'));
			addFollowUpAndPick();
			await screen.findByTestId('tenant-posts-segment-images-failure');

			expect(mocks.shouldBlock.current?.()).toBe(true);
		});

		test('the save refreshes the queue and calendar like the Save button (N4)', async () => {
			addFollowUpAndPick();

			await waitFor(() =>
				expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1),
			);
			expect(mocks.invalidateTenantScheduledPublications).toHaveBeenCalled();
			expect(mocks.invalidateTenantPublications).toHaveBeenCalled();
		});

		test('an invalid form shows its field errors, not a request or a raw message (N6)', async () => {
			render(<TenantPostEditPage />);
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.change(screen.getByTestId('tenant-posts-segment-body'), {
				target: { value: 'x'.repeat(20001) },
			});
			fireEvent.click(screen.getByTestId('stub-pick'));

			const failure = await screen.findByTestId(
				'tenant-posts-segment-images-failure',
			);
			expect(failure.textContent).toContain('posts:segment-images-fix-form');
			expect(mocks.savePost).not.toHaveBeenCalled();
			expect(mocks.attachMutateAsync).not.toHaveBeenCalled();
		});

		test('an ended session during the image attach also goes to the central logout', async () => {
			mocks.attachMutateAsync.mockRejectedValueOnce(
				Object.assign(new Error('Unauthorized'), { responseStatusCode: 401 }),
			);
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined);
			render(
				<AuthedRouteBoundary>
					<TenantPostEditPage />
				</AuthedRouteBoundary>,
			);
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.click(screen.getByTestId('stub-pick'));

			await screen.findByTestId('logout-redirect');
			expect(
				screen.queryByTestId('tenant-posts-segment-images-failure'),
			).toBeNull();
			consoleError.mockRestore();
		});

		test('leaving the page aborts the save and upload in flight: nothing is read, attached or reset afterwards', async () => {
			let finishSave: (value: unknown) => void = () => undefined;
			mocks.savePost.mockImplementation(
				() =>
					new Promise((resolve) => {
						finishSave = resolve;
					}),
			);
			const view = render(<TenantPostEditPage />);
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.click(screen.getByTestId('stub-pick'));
			await waitFor(() => expect(mocks.savePost).toHaveBeenCalledTimes(1));

			// A confirmed leave unmounts the page.
			view.unmount();
			await act(async () => {
				finishSave({});
			});

			expect(mocks.readCreatedSegments).not.toHaveBeenCalled();
			expect(mocks.attachMutateAsync).not.toHaveBeenCalled();
		});

		test('after a failed upload the segment shows ONE picker (the queued one), and Publish waits for the retry (NEW-1, NEW-2)', async () => {
			mocks.attachMutateAsync.mockRejectedValueOnce(new Error('upload failed'));
			addFollowUpAndPick();
			await screen.findByTestId('tenant-posts-segment-images-failure');

			const segmentPickers = () =>
				screen
					.getAllByTestId('tenant-post-edit-image-picker-stub')
					.filter((node) => node.getAttribute('data-segment-id') !== '');
			// The stored twin is hidden while files are queued.
			expect(segmentPickers()).toEqual([]);
			expect(screen.getAllByTestId('stub-pick')).toHaveLength(1);
			// Publishing would drop the queued file: it waits for the retry.
			expect(mocks.blockProps.current?.disabled).toBe(true);

			fireEvent.click(screen.getByTestId('tenant-posts-segment-images-retry'));

			await waitFor(() =>
				expect(mocks.blockProps.current?.disabled).toBe(false),
			);
			expect(
				segmentPickers().map((node) => node.getAttribute('data-segment-id')),
			).toEqual(['stored-new']);
			expect(screen.queryAllByTestId('stub-pick')).toHaveLength(0);
		});

		test('the stored picker of a segment is locked while a save runs (NEW-1)', async () => {
			mocks.useTenantPostDetailsQuery.mockReturnValue({
				data: {
					id: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
					body: 'Hello world',
					projectId: null,
					segments: [{ id: 'seg-b', number: 2, body: 'B', images: [] }],
					images: [],
				},
				isPending: false,
				isSuccess: true,
				isError: false,
				error: null,
				refetch: vi.fn(),
				isFetching: false,
			});
			let finish: (value: unknown) => void = () => undefined;
			mocks.savePost.mockImplementation(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					}),
			);
			render(<TenantPostEditPage />);
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.click(screen.getAllByTestId('stub-pick')[0] as HTMLElement);

			await waitFor(() =>
				expect(
					screen
						.getAllByTestId('tenant-post-edit-image-picker-stub')
						.find((node) => node.getAttribute('data-segment-id') === 'seg-b')
						?.getAttribute('data-disabled'),
				).toBe('true'),
			);
			await act(async () => {
				finish({});
			});
		});

		test('the project select is locked while the auto-save runs (N5)', async () => {
			mocks.useTenantProjectsQuery.mockReturnValue({
				data: { items: [] },
				isPending: false,
			});
			let finish: (value: unknown) => void = () => undefined;
			mocks.savePost.mockImplementation(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					}),
			);
			addFollowUpAndPick();

			await waitFor(() =>
				expect(
					screen.getByTestId('field-select-stub').getAttribute('data-disabled'),
				).toBe('true'),
			);
			await act(async () => {
				finish({});
			});
			await waitFor(() =>
				expect(
					screen.getByTestId('field-select-stub').getAttribute('data-disabled'),
				).toBe('false'),
			);
			mocks.useTenantProjectsQuery.mockReturnValue({
				data: undefined,
				isPending: true,
			});
		});

		test('a too-long follow-up shows its own error on its block (NEW-3)', async () => {
			render(<TenantPostEditPage />);
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.change(screen.getByTestId('tenant-posts-segment-body'), {
				target: { value: 'x'.repeat(20001) },
			});
			fireEvent.click(screen.getByTestId('stub-pick'));

			const error = await screen.findByTestId('tenant-posts-segment-error');
			expect(error.textContent).toBe('posts:segment-too-long');
		});

		test('Save is locked while picked files wait for a retry (round 4)', async () => {
			mocks.savePost.mockRejectedValueOnce(new Error('offline'));
			render(<TenantPostEditPage />);
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.click(screen.getByTestId('stub-pick'));
			await screen.findByTestId('tenant-posts-segment-images-failure');

			expect(
				(screen.getByTestId('tenant-post-edit-save') as HTMLButtonElement)
					.disabled,
			).toBe(true);
		});

		test('a segment error never lands on another block after a reorder, and the field is marked invalid (round 4)', async () => {
			render(<TenantPostEditPage />);
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			const [first] = screen.getAllByTestId('tenant-posts-segment-body');
			fireEvent.change(first as HTMLElement, {
				target: { value: 'x'.repeat(20001) },
			});
			fireEvent.click(screen.getAllByTestId('stub-pick')[0] as HTMLElement);

			const error = await screen.findByTestId('tenant-posts-segment-error');
			const [invalid] = screen.getAllByTestId('tenant-posts-segment-body');
			expect(invalid?.getAttribute('aria-invalid')).toBe('true');
			expect(invalid?.getAttribute('aria-describedby')).toBe(error.id);

			fireEvent.click(
				screen.getAllByTestId(
					'tenant-posts-segment-move-later',
				)[0] as HTMLElement,
			);

			await waitFor(() =>
				expect(screen.queryByTestId('tenant-posts-segment-error')).toBeNull(),
			);
		});

		test('appending a follow-up keeps the other follow-ups errors (round 5)', async () => {
			render(<TenantPostEditPage />);
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.change(screen.getByTestId('tenant-posts-segment-body'), {
				target: { value: 'x'.repeat(20001) },
			});
			fireEvent.click(screen.getByTestId('stub-pick'));
			await screen.findByTestId('tenant-posts-segment-error');

			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));

			expect(screen.getAllByTestId('tenant-posts-segment-error')).toHaveLength(
				1,
			);
		});

		test('the fix-the-fields notice goes away with the highlights on a reorder (round 5)', async () => {
			render(<TenantPostEditPage />);
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.change(screen.getAllByTestId('tenant-posts-segment-body')[0]!, {
				target: { value: 'x'.repeat(20001) },
			});
			fireEvent.click(screen.getAllByTestId('stub-pick')[0]!);
			const notice = await screen.findByTestId(
				'tenant-posts-segment-images-failure',
			);
			expect(notice.textContent).toContain('posts:segment-images-fix-form');

			fireEvent.click(
				screen.getAllByTestId('tenant-posts-segment-move-later')[0]!,
			);

			await waitFor(() =>
				expect(
					screen.getByTestId('tenant-posts-segment-images-failure').textContent,
				).not.toContain('posts:segment-images-fix-form'),
			);
			// The queued file keeps its way out: Retry is still there.
			expect(
				screen.getByTestId('tenant-posts-segment-images-retry'),
			).toBeTruthy();
		});

		test('the explicit Save with an ended session goes to the central logout (residual)', async () => {
			mocks.savePost.mockRejectedValueOnce(
				Object.assign(new Error('Unauthorized'), { responseStatusCode: 401 }),
			);
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined);
			render(
				<AuthedRouteBoundary>
					<TenantPostEditPage />
				</AuthedRouteBoundary>,
			);

			fireEvent.submit(screen.getByTestId('form-stub'));

			await screen.findByTestId('logout-redirect');
			consoleError.mockRestore();
		});

		test('the page showing another post aborts the first one save: nothing of it is read, attached or reset (residual)', async () => {
			let finishSave: (value: unknown) => void = () => undefined;
			mocks.savePost.mockImplementation(
				() =>
					new Promise((resolve) => {
						finishSave = resolve;
					}),
			);
			const view = render(<TenantPostEditPage />);
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.click(screen.getByTestId('stub-pick'));
			await waitFor(() => expect(mocks.savePost).toHaveBeenCalledTimes(1));

			// A param-only navigation: the same component shows the next post.
			mocks.useParams.mockReturnValue({
				postId: 'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb',
			});
			view.rerender(<TenantPostEditPage />);
			await act(async () => {
				finishSave({});
			});

			expect(mocks.readCreatedSegments).not.toHaveBeenCalled();
			expect(mocks.attachMutateAsync).not.toHaveBeenCalled();
		});

		test('an ended session goes to the central logout, not to an inline message (m2)', async () => {
			mocks.savePost.mockRejectedValueOnce(
				Object.assign(new Error('Unauthorized'), { responseStatusCode: 401 }),
			);
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined);
			render(
				<AuthedRouteBoundary>
					<TenantPostEditPage />
				</AuthedRouteBoundary>,
			);
			fireEvent.click(screen.getByTestId('tenant-posts-segment-add'));
			fireEvent.click(screen.getByTestId('stub-pick'));

			await screen.findByTestId('logout-redirect');
			consoleError.mockRestore();
		});
	});
});
