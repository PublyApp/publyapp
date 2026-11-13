/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const state = {
		imagePost: vi.fn(),
		/** Which list each call addressed: the post's own or a segment's. */
		calls: [] as string[],
	};
	const list = (scope: string) => ({
		post: (body: unknown) => {
			state.calls.push(`${scope}:attach`);
			return state.imagePost(body);
		},
		byAssetId: (assetId: string) => ({
			delete: () => {
				state.calls.push(`${scope}:delete:${assetId}`);
				return Promise.resolve(undefined);
			},
			patch: () => {
				state.calls.push(`${scope}:alt:${assetId}`);
				return Promise.resolve(undefined);
			},
		}),
		order: {
			patch: () => {
				state.calls.push(`${scope}:reorder`);
				return Promise.resolve(undefined);
			},
		},
	});
	return {
		state,
		client: {
			posts: {
				byPostId: (postId: string) => ({
					image: {
						post: state.imagePost,
					},
					images: list(`post ${postId}`),
					segments: {
						bySegmentId: (segmentId: string) => ({
							images: list(`segment ${segmentId}`),
						}),
					},
					__postId: postId,
				}),
				patch: vi.fn(),
			},
		},
	};
});

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateClient: () => mocks.client,
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

import {
	useAttachPostImageMutation,
	useRemovePostImageMutation,
	useReorderPostImagesMutation,
	useUpdatePostImageAltMutation,
	buildAttachPostImageBody,
	buildReorderPostImagesBody,
	toTenantPostImage,
	toTenantPostImages,
} from './tenant-post-images';

describe('toTenantPostImage', () => {
	test('normalizes a full image payload with a resolved /files url', () => {
		expect(
			toTenantPostImage({
				id: 'asset-1',
				url: '/files/2026/08/abc.png',
				contentType: 'image/png',
				widthPx: 32,
				heightPx: 32,
				altText: 'logo',
			}),
		).toEqual({
			id: 'asset-1',
			url: 'https://api.example.test/files/2026/08/abc.png',
			widthPx: 32,
			heightPx: 32,
			altText: 'logo',
		});
	});

	test('returns null for a blank or missing url', () => {
		expect(
			toTenantPostImage({ url: '   ', widthPx: 1, heightPx: 1 }),
		).toBeNull();
		expect(toTenantPostImage(null)).toBeNull();
		expect(toTenantPostImage(undefined)).toBeNull();
	});
});

describe('toTenantPostImage (list projection shape)', () => {
	test('maps the list read-model image projection', () => {
		expect(
			toTenantPostImage({
				url: '/files/x.gif',
				widthPx: 10,
				heightPx: 4,
				altText: 'a gif',
			}),
		).toEqual({
			id: null,
			url: 'https://api.example.test/files/x.gif',
			widthPx: 10,
			heightPx: 4,
			altText: 'a gif',
		});
		expect(toTenantPostImage(null)).toBeNull();
		expect(toTenantPostImage(undefined)).toBeNull();
	});
});

describe('buildAttachPostImageBody', () => {
	test('carries the file part with its filename and never an altText part', async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		const body = await buildAttachPostImageBody({
			postId: 'post-1',
			tenantId: 'tenant-1',
			file: new File([bytes], 'logo.png', { type: 'image/png' }),
		});

		const parts = body.listParts();
		expect(parts.file).toBeDefined();
		const fileEntry = parts.file as { fileName?: string } | undefined;
		expect(fileEntry?.fileName).toBe('logo.png');
		// The API reads alt text only from the post PATCH, never from the
		// attach multipart (kiota lowercases part keys internally).
		expect(parts.alttext).toBeUndefined();
	});
});

describe('toTenantPostImages', () => {
	test('keeps the wire order and drops entries without a usable url', () => {
		expect(
			toTenantPostImages([
				{ id: 'a', url: '/files/a.png', altText: 'first' },
				{ id: 'bad', url: '  ' },
				{ id: 'c', url: '/files/c.png' },
			]).map((image) => [image.id, image.altText]),
		).toEqual([
			['a', 'first'],
			['c', null],
		]);
	});

	test('is an empty list for anything that is not an array', () => {
		expect(toTenantPostImages(null)).toEqual([]);
		expect(toTenantPostImages(undefined)).toEqual([]);
		expect(toTenantPostImages({ url: '/files/a.png' })).toEqual([]);
	});
});

describe('buildReorderPostImagesBody', () => {
	test('wraps the ordered ids in an untyped array', () => {
		const body = buildReorderPostImagesBody(['b', 'a']);
		expect(body.assetIds).toBeDefined();
	});
});

describe('segment image routes (#2181)', () => {
	const wrapper = ({ children }: { children: ReactNode }) =>
		createElement(QueryClientProvider, { client: new QueryClient() }, children);
	const file = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });

	test('every action targets the segment when one is named, the post otherwise', async () => {
		mocks.state.calls.length = 0;
		mocks.state.imagePost.mockResolvedValue(undefined);
		const attach = renderHook(() => useAttachPostImageMutation(), { wrapper });
		const remove = renderHook(() => useRemovePostImageMutation(), { wrapper });
		const alt = renderHook(() => useUpdatePostImageAltMutation(), { wrapper });
		const reorder = renderHook(() => useReorderPostImagesMutation(), {
			wrapper,
		});
		const base = { postId: 'p1', tenantId: 't1' };

		await attach.result.current.mutateAsync({ ...base, file, segmentId: 's2' });
		await remove.result.current.mutateAsync({
			...base,
			assetId: 'a1',
			segmentId: 's2',
		});
		await alt.result.current.mutateAsync({
			...base,
			assetId: 'a1',
			altText: 'x',
			segmentId: 's2',
		});
		await reorder.result.current.mutateAsync({
			...base,
			assetIds: ['a2', 'a1'],
			segmentId: 's2',
		});
		await remove.result.current.mutateAsync({ ...base, assetId: 'a9' });

		expect(mocks.state.calls).toEqual([
			'segment s2:attach',
			'segment s2:delete:a1',
			'segment s2:alt:a1',
			'segment s2:reorder',
			'post p1:delete:a9',
		]);
	});
});
