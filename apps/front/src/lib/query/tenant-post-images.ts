import {
	MultipartBody,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import { resolveApiFileUrl } from '~/lib/api-client/resolve-api-file-url';

import type { ApiClient } from '@org/client-ts/apiClient';
import {
	buildTenantMutationOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';

export const TENANT_POST_IMAGE_MUTATION_KEY = [
	'tenant-posts',
	'image',
] as const;

/** Normalized image projection shared by the post detail and list read
 * models. `url` is resolved against the API origin so `<img src>` never falls
 * back to the front origin (see {@link resolveApiFileUrl}). */
export type TenantPostImage = {
	url: string;
	widthPx: number | null;
	heightPx: number | null;
	altText: string | null;
};

type RawPostImage = {
	url?: string | null;
	widthPx?: number | null;
	heightPx?: number | null;
	altText?: string | null;
};

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === 'string' && value.trim().length > 0;

export const toTenantPostImage = (
	raw: (RawPostImage & { contentType?: string | null }) | null | undefined,
): TenantPostImage | null => {
	if (!raw || !isNonEmptyString(raw.url)) {
		return null;
	}

	return {
		url: resolveApiFileUrl(raw.url.trim()),
		widthPx: typeof raw.widthPx === 'number' ? raw.widthPx : null,
		heightPx: typeof raw.heightPx === 'number' ? raw.heightPx : null,
		altText: isNonEmptyString(raw.altText) ? raw.altText : null,
	};
};

// ── Attach (multipart POST) ────────────────────────────────────────

export type AttachPostImageInput = {
	postId: string;
	file: File;
	altText?: string;
};

const buildMultipart = async (
	input: Omit<AttachPostImageInput, 'postId'>,
): Promise<MultipartBody> => {
	const body = new MultipartBody();
	const content = new Uint8Array(await input.file.arrayBuffer());
	body.addOrReplacePart(
		'file',
		input.file.type || 'application/octet-stream',
		content,
		undefined,
		input.file.name,
	);

	const alt = input.altText?.trim();
	if (alt) {
		body.addOrReplacePart('altText', 'text/plain', alt);
	}

	return body;
};

/**
 * Builds the attach multipart body. Exported for tests; production callers go
 * through {@link useAttachPostImageMutation}.
 */
export const buildAttachPostImageBody = async (
	input: AttachPostImageInput,
): Promise<MultipartBody> =>
	buildMultipart({ file: input.file, altText: input.altText });

export const attachPostImageMutationOptions = buildTenantMutationOptions<
	ApiClient,
	unknown,
	{ postId: string; file: File; altText?: string }
>(
	{
		mutationKeyFn: () => [...TENANT_POST_IMAGE_MUTATION_KEY, 'attach'],
		mutationFn: async (client, variables) =>
			client.posts.byPostId(variables.postId).image.post(
				await buildMultipart({
					file: variables.file,
					altText: variables.altText,
				}),
			),
		meta: { silentSuccess: true },
	},
	{ clientAccessor: getClientManager() },
);

type PostImageVariables = {
	postId: string;
	tenantId: string;
};

export const useAttachPostImageMutation = () =>
	useMutation(attachPostImageMutationOptions);

// ── Remove (DELETE) ────────────────────────────────────────────────

export const removePostImageMutationOptions = buildTenantMutationOptions<
	ApiClient,
	unknown,
	{ postId: string }
>(
	{
		mutationKeyFn: () => [...TENANT_POST_IMAGE_MUTATION_KEY, 'remove'],
		mutationFn: async (client, variables) =>
			client.posts.byPostId(variables.postId).image.delete(),
		meta: { silentSuccess: true },
	},
	{ clientAccessor: getClientManager() },
);

export const useRemovePostImageMutation = () =>
	useMutation(removePostImageMutationOptions);

// ── Alt text (PATCH imageAltText on the post) ──────────────────────

export type ImageAltTextPatch = {
	imageAltText?: ReturnType<typeof createUntypedString> | null;
};

/**
 * Builds the `imageAltText` PATCH fragment for the post update endpoint.
 * A string wraps in an untyped string node; `null` clears the alt text.
 */
export const buildImageAltTextPatch = (
	value: string | null,
): ImageAltTextPatch => ({
	imageAltText: value === null ? null : createUntypedString(value),
});

// ── Invalidation helper ────────────────────────────────────────────

/** Invalidates the post details cache after an image attach/remove so the
 * drawer preview and edit-page block refetch the fresh projection. */
export const invalidateTenantPostImages = async (
	qc: QueryClient,
	variables: PostImageVariables,
): Promise<void> => {
	await qc.invalidateQueries({
		queryKey: [
			...scopedKey('tenant', ['tenant-posts', 'detail']),
			variables.tenantId,
		],
	});
};
