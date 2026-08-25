/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const state = {
		imagePost: vi.fn(),
		imageDelete: vi.fn(),
	};
	return {
		state,
		client: {
			posts: {
				byPostId: (postId: string) => ({
					image: {
						post: state.imagePost,
						delete: state.imageDelete,
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
	buildAttachPostImageBody,
	buildImageAltTextPatch,
	toTenantPostImage,
	toTenantPostRowImage,
} from './tenant-post-images';

describe('toTenantPostImage', () => {
	test('normalizes a full image payload with a resolved /files url', () => {
		expect(
			toTenantPostImage({
				url: '/files/2026/08/abc.png',
				contentType: 'image/png',
				widthPx: 32,
				heightPx: 32,
				altText: 'logo',
			}),
		).toEqual({
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

describe('toTenantPostRowImage', () => {
	test('maps the list read-model image projection', () => {
		expect(
			toTenantPostRowImage({
				url: '/files/x.gif',
				widthPx: 10,
				heightPx: 4,
				altText: 'a gif',
			}),
		).toEqual({
			url: 'https://api.example.test/files/x.gif',
			widthPx: 10,
			heightPx: 4,
			altText: 'a gif',
		});
		expect(toTenantPostRowImage(null)).toBeNull();
		expect(toTenantPostRowImage(undefined)).toBeNull();
	});
});

describe('buildAttachPostImageBody', () => {
	test('carries the file bytes and the trimmed alt text when provided', async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		const body = await buildAttachPostImageBody({
			postId: 'post-1',
			file: new File([bytes], 'logo.png', { type: 'image/png' }),
			altText: '  company logo  ',
		});

		const parts = body.listParts();
		expect(parts.file).toBeDefined();
		const fileEntry = parts.file as { fileName?: string } | undefined;
		expect(fileEntry?.fileName).toBe('logo.png');
		// kiota lowercases part keys internally (normalizePartName) but writes
		// the original name on the wire via `originalName`.
		const alt = parts.alttext as { content?: unknown } | undefined;
		expect(alt).toBeDefined();
		expect(String(alt?.content)).toBe('company logo');
	});

	test('omits altText entirely when absent', async () => {
		const body = await buildAttachPostImageBody({
			postId: 'post-1',
			file: new File([new Uint8Array([9])], 'x.png', { type: 'image/png' }),
		});

		const parts = body.listParts();
		expect(parts.file).toBeDefined();
		expect(parts.altText).toBeUndefined();
	});
});

describe('buildImageAltTextPatch', () => {
	test('wraps a string value in an untyped string node', () => {
		const patch = buildImageAltTextPatch('a logo');
		expect(patch.imageAltText).toBeDefined();
	});

	test('passes null through to clear the alt text', () => {
		const patch = buildImageAltTextPatch(null);
		expect(patch.imageAltText).toBeNull();
	});
});
