import {
	createUntypedArray,
	createUntypedNull,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import {
	toTenantPostImage,
	toTenantPostImages,
} from '~/lib/query/tenant-post-images';
import type { TenantPostImage } from '~/lib/query/tenant-post-images';
import { invalidateTenantPublications } from '~/lib/query/tenant-publications';
import { invalidateTenantScheduledPublications } from '~/lib/query/tenant-scheduled-publications';
import {
	resolveWorkspaceTenant,
	tenantsForPickerQueryOptions,
} from '~/lib/query/tenants-for-picker';
import { readSelectedTenantId } from '~/lib/session/selected-tenant-storage';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	CreatePostBody,
	FindPostsForTenantResponse,
	PostDetail,
	UpdatePostBody,
} from '@org/client-ts/models/index';
import {
	buildTenantQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';

export const TENANT_POSTS_QUERY_KEY = ['tenant-posts'] as const;
const TENANT_POST_DETAILS_QUERY_KEY = ['tenant-posts', 'detail'] as const;

/** The posts table's query variables ARE the shared table search contract
 * (`~/lib/url-state/table-search-params`). */
export type TenantPostsQueryVariables = TableSearchParams;

export type TenantPostRow = {
	id: string;
	excerpt: string;
	projectId: string | null;
	status: string | null;
	createdByUserId: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
};

export type TenantPostDetails = {
	id: string;
	body: string;
	projectId: string | null;
	status: string | null;
	createdByUserId: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
	image: TenantPostImage | null;
	/** The post's images in publish order (up to four). */
	images: TenantPostImage[];
	/** Follow-up segments (segments 2..N) of a thread, in order; [] for a plain post. */
	segments: TenantPostSegment[];
	/** Leading segments already published: read-only in the editor. */
	publishedSegmentCount: number;
};

type TenantPostSegment = {
	/** Stable id: image routes and `segmentIds` on save refer to it. */
	id: string;
	/** 1-based place in the thread (2..N). */
	number: number;
	body: string;
	/** The segment's own images in publish order. */
	images: TenantPostImage[];
};

export type SavePostInput = {
	postId?: string;
	body: string;
	projectId: string | null;
	/** Follow-up texts. Undefined leaves the post's segments untouched. */
	segments?: string[];
	/** The stored segment each follow-up text continues (undefined = a new one),
	 * so a reorder or removal keeps every segment's images with its text. */
	segmentIds?: (string | undefined)[];
};

// ── Normalization helpers ──────────────────────────────────────────

const normalizeString = (
	value: string | null | undefined,
): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return undefined;
};

const normalizeNullableString = (
	value: string | null | undefined,
): string | null => normalizeString(value) ?? null;

const normalizeDate = (
	value: Date | string | null | undefined,
): Date | null => {
	let d: Date | null = null;

	if (value instanceof Date) {
		d = value;
	} else if (typeof value === 'string' && value.length > 0) {
		d = new Date(value);
	}

	if (d !== null && !Number.isNaN(d.valueOf())) {
		return d;
	}
	return null;
};

const isPositiveSafeInteger = (value: number | undefined): boolean =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

// ── Query parameter builder ────────────────────────────────────────

export const buildFindTenantPostsQueryParameters = (
	variables: TenantPostsQueryVariables,
) => ({
	q: normalizeString(variables.q),
	sortId: normalizeString(variables.sortId),
	sortOrder: variables.sortOrder,
	cursor: normalizeString(variables.cursor),
	limit: isPositiveSafeInteger(variables.size)
		? String(variables.size)
		: undefined,
});

// ── Row / detail mappers ───────────────────────────────────────────

export const toTenantPostRows = (
	data: FindPostsForTenantResponse | null | undefined,
): TenantPostRow[] => {
	const rows: TenantPostRow[] = [];

	for (const item of data?.data ?? []) {
		const id = normalizeString(item.id?.toString());
		const excerpt = normalizeString(item.bodyPreview) ?? '';

		if (!id || !excerpt) {
			continue;
		}

		rows.push({
			id,
			excerpt,
			projectId: normalizeNullableString(item.projectId?.toString()),
			status: normalizeNullableString(item.status),
			createdByUserId: normalizeNullableString(
				item.createdByUserId?.toString(),
			),
			createdAt: normalizeDate(item.createdAt),
			updatedAt: normalizeDate(item.updatedAt),
		});
	}

	return rows;
};

export const toTenantPostDetails = (
	result: PostDetail | null | undefined,
): TenantPostDetails | null => {
	const id = normalizeString(result?.id?.toString());
	const body = normalizeString(result?.body);

	if (!id || !body) {
		return null;
	}

	return {
		id,
		body,
		projectId: normalizeNullableString(result?.projectId?.toString()),
		status: normalizeNullableString(result?.status),
		createdByUserId: normalizeNullableString(
			result?.createdByUserId?.toString(),
		),
		createdAt: normalizeDate(result?.createdAt),
		updatedAt: normalizeDate(result?.updatedAt),
		image: toTenantPostImage(result?.image),
		images: toTenantPostImages(result?.images),
		segments: (result?.segments ?? []).map((segment) => ({
			id: segment.id?.toString() ?? '',
			number: segment.number ?? 0,
			body: segment.body ?? '',
			images: toTenantPostImages(segment.images),
		})),
		publishedSegmentCount: result?.publishedSegmentCount ?? 0,
	};
};

const toUntypedSegments = (segments: string[]) =>
	createUntypedArray(segments.map((text) => createUntypedString(text)));

// ── Query options ──────────────────────────────────────────────────

export const tenantPostsQueryOptions = buildTenantQueryOptions<
	ApiClient,
	FindPostsForTenantResponse,
	TenantPostsQueryVariables
>(
	{
		queryKeyFn: () => [...TENANT_POSTS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.posts.get({
				queryParameters: buildFindTenantPostsQueryParameters(variables),
			});

			if (!result) {
				throw new Error('tenant posts result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useTenantPostsQuery = (
	variables: TenantPostsQueryVariables & { tenantId: string },
) =>
	useQuery({
		queryKey: tenantPostsQueryOptions.queryKey(variables),
		queryFn: () => tenantPostsQueryOptions.fetcher(variables),
	});

export const tenantPostDetailsQueryOptions = buildTenantQueryOptions<
	ApiClient,
	PostDetail,
	{ postId: string }
>(
	{
		queryKeyFn: () => [...TENANT_POST_DETAILS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.posts.byPostId(variables.postId).get();

			if (!result) {
				throw new Error('tenant post details result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useTenantPostDetailsQuery = (
	variables: { postId: string; tenantId: string },
	opts?: { enabled?: boolean },
) =>
	useQuery({
		queryKey: tenantPostDetailsQueryOptions.queryKey(variables),
		queryFn: () => tenantPostDetailsQueryOptions.fetcher(variables),
		enabled: opts?.enabled ?? true,
		staleTime: 30_000,
	});

// ── Single savePost writer (drawer + edit page) ────────────────────

export const savePost = async (
	input: SavePostInput & { tenantId: string },
): Promise<TenantPostDetails> => {
	const client = getClientManager().getOrCreateClient(input.tenantId);
	const body = input.body.trim();

	if (!body) {
		throw new Error('body is required');
	}

	if (input.postId) {
		const patchBody: UpdatePostBody = {};

		patchBody.body = createUntypedString(body);

		if (input.projectId === null) {
			patchBody.projectId = null;
		} else if (input.projectId) {
			patchBody.projectId = createUntypedString(input.projectId);
		}

		if (input.segments !== undefined) {
			// Blank follow-ups are sent as they are: the server names the empty
			// segment (422) instead of the save silently renumbering the thread.
			patchBody.segments = toUntypedSegments(input.segments);
			if (input.segmentIds !== undefined) {
				patchBody.segmentIds = createUntypedArray(
					input.segmentIds.map((id) =>
						id === undefined ? createUntypedNull() : createUntypedString(id),
					),
				);
			}
		}

		const result = await client.posts.byPostId(input.postId).patch(patchBody);

		if (!result) {
			throw new Error('update post result was empty');
		}

		const details = toTenantPostDetails(result as PostDetail);

		if (!details) {
			throw new Error('malformed post update payload');
		}

		return details;
	}

	// Kiota's UntypedString fields are added conditionally, so the generated
	// optional-field DTO beats a literal frozen by `satisfies`.
	const createBody: CreatePostBody = {};

	createBody.body = createUntypedString(body);

	if (input.projectId) {
		createBody.projectId = createUntypedString(input.projectId);
	}

	const followUps = input.segments ?? [];
	if (followUps.length > 0) {
		createBody.segments = toUntypedSegments(followUps);
	}

	const result = await client.posts.post(createBody);

	if (!result) {
		throw new Error('create post result was empty');
	}

	const created = result as PostDetail;
	const details: TenantPostDetails = {
		id: created.id?.toString() ?? '',
		body,
		projectId: normalizeNullableString(created.projectId?.toString()),
		status: 'draft',
		createdByUserId: null,
		image: null,
		images: [],
		segments: [],
		publishedSegmentCount: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	return details;
};

// ── Invalidation ───────────────────────────────────────────────────

/**
 * Post-mutation cache refresh for BOTH post surfaces (#359 rule: line +
 * list). The flat key families place the details branch (`'detail'`) BEFORE
 * the tenant id, so a tenant-suffixed list prefix covers the filtered/cursored
 * list pages but NOT the saved/deleted post's own detail entry — the exact
 * silent staleness "Mutation Invalidation Coherence" (conventions.md) exists
 * to prevent. Invalidate the list page family and the details family of this
 * tenant explicitly.
 */
export const invalidateTenantPosts = async (
	qc: QueryClient,
	tenantId: string,
): Promise<void> => {
	await qc.invalidateQueries({
		queryKey: [...scopedKey('tenant', TENANT_POSTS_QUERY_KEY), tenantId],
	});
	await qc.invalidateQueries({
		queryKey: [...scopedKey('tenant', TENANT_POST_DETAILS_QUERY_KEY), tenantId],
	});
};

// ── Mutations ──────────────────────────────────────────────────────

export const useSavePostMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [...TENANT_POSTS_QUERY_KEY, 'save'],
		mutationFn: savePost,
		onSuccess: (_data, variables) => {
			void invalidateTenantPosts(queryClient, variables.tenantId);
			// Editing a post mutates its body preview in any scheduled-publication
			// window (queue/calendar). Refresh every window for the tenant
			// so the cached `postBodyPreview` no longer carries the stale text
			// (#2053 coherence). History uses a separate publications cache.
			void invalidateTenantScheduledPublications(
				queryClient,
				variables.tenantId,
			);
			void invalidateTenantPublications(queryClient, variables.tenantId);
		},
		meta: {
			successMessage: 'post-saved-success',
			validationHandledByForm: true,
		},
	});
};

export const useDeleteTenantPostMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [...TENANT_POSTS_QUERY_KEY, 'delete'],
		mutationFn: async ({
			postId,
			tenantId,
		}: {
			postId: string;
			tenantId: string;
		}) => {
			const client = getClientManager().getOrCreateClient(tenantId);
			await client.posts.byPostId(postId).delete();
		},
		onSuccess: (_data, variables) => {
			void invalidateTenantPosts(queryClient, variables.tenantId);
			void invalidateTenantScheduledPublications(
				queryClient,
				variables.tenantId,
			);
			void invalidateTenantPublications(queryClient, variables.tenantId);
		},
		meta: { successMessage: 'post-deleted-success' },
	});
};

// ── Invalidation ───────────────────────────────────────────────────
// (invalidateTenantPosts lives above, before the mutations that call it.)

// ── Breadcrumb helpers ─────────────────────────────────────────────

/** A breadcrumb has only the URL params, never the workspace tenant: it was
 * fetching with an empty tenant id, which always failed and left the crumb on
 * its error dash (#2410). The tenant is the persisted workspace selection (the
 * key then matches the page's own, so a loaded post paints at once); with none
 * stored, the picker resolves it the way the page does. */
export const tenantPostCrumbQuery = (params: Record<string, string>) => {
	const selectedTenantId = readSelectedTenantId();
	const postId = params.postId ?? '';

	return {
		queryKey:
			selectedTenantId === null
				? [...scopedKey('tenant', TENANT_POST_DETAILS_QUERY_KEY), { postId }]
				: tenantPostDetailsQueryOptions.queryKey({
						postId,
						tenantId: selectedTenantId,
					}),
		queryFn: async () => {
			const tenantId =
				selectedTenantId ??
				resolveWorkspaceTenant(
					await tenantsForPickerQueryOptions.fetcher({}),
					null,
				)?.id;
			if (!tenantId) {
				throw new Error('no workspace tenant for the post breadcrumb');
			}

			return tenantPostDetailsQueryOptions.fetcher({ postId, tenantId });
		},
	};
};

const CRUMB_NAME_MAX = 60;

/** The first line of the body, shortened: a body can run to 20 000 characters. */
export const selectTenantPostCrumbName = (data: unknown) => {
	const d = toTenantPostDetails(data as PostDetail | null);
	const firstLine = d?.body.trim().split('\n')[0]?.trim();
	if (!firstLine) {
		return undefined;
	}
	if (firstLine.length <= CRUMB_NAME_MAX) {
		return firstLine;
	}
	return `${firstLine.slice(0, CRUMB_NAME_MAX - 1)}…`;
};
