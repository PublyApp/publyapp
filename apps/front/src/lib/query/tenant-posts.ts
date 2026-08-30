import { createUntypedString } from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import { toTenantPostImage } from '~/lib/query/tenant-post-images';
import type { TenantPostImage } from '~/lib/query/tenant-post-images';
import type { SortOrder } from '~/lib/url-state/table-search-params';

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

export type TenantPostsQueryVariables = {
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

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
};

export type SavePostInput = {
	postId?: string;
	body: string;
	projectId: string | null;
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
	};
};

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
		},
		meta: { successMessage: 'post-deleted-success' },
	});
};

// ── Invalidation ───────────────────────────────────────────────────
// (invalidateTenantPosts lives above, before the mutations that call it.)

// ── Breadcrumb helpers ─────────────────────────────────────────────

export const tenantPostCrumbQuery = (params: Record<string, string>) => ({
	queryKey: [
		...scopedKey('tenant', TENANT_POST_DETAILS_QUERY_KEY),
		{ postId: params.postId },
	],
	queryFn: () =>
		tenantPostDetailsQueryOptions.fetcher({
			postId: params.postId,
			tenantId: params.tenantId ?? '',
		}),
});

export const selectTenantPostCrumbName = (data: unknown) => {
	const d = toTenantPostDetails(data as PostDetail | null);
	if (d) {
		return d.body;
	}
	return undefined;
};
