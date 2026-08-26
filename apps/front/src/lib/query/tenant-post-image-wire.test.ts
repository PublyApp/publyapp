// Pins REAL Kiota wire deserialization for PostDetail.image (#639).
//
// The generated client once typed `image` as a Kiota union
// (`PostDetail_imageMember1 | PostImageReadModel`) where the marker member is
// an EMPTY interface whose deserializer always wins, silently moving the whole
// payload into `additionalData`. Every jsdom test that mocks the client kept
// passing; only the browser e2e caught it (edit page rendered no preview).
// The OpenAPI document normalizer (apps/api OpenApiDocumentNormalizer) folds
// those `oneOf [{type: "null"}, {$ref}]` unions so Kiota generates a plain
// model again. This test exercises the actual generated deserializer so a
// contract or generator regression turns red here instead of only in e2e.
import { expect, describe, it } from 'vitest';

import { createPostDetailFromDiscriminatorValue } from '@org/client-ts/models/index';
import type { PostDetail } from '@org/client-ts/models/index';

// The JSON serialization library is a dependency of @org/client-ts, not of
// front, so the factory resolves through client-ts's own node_modules.
import { JsonParseNodeFactory } from '../../../../../packages/client-ts/node_modules/@microsoft/kiota-serialization-json/dist/es/src/index.js';

describe('PostDetail wire deserialization', () => {
	it('ItShouldKeepTheAttachedImagePayloadFields', () => {
		const payload = {
			id: '0b8e6e70-0000-0000-0000-000000000001',
			tenantId: '0b8e6e70-0000-0000-0000-000000000002',
			projectId: null,
			status: 'draft',
			body: 'probe',
			createdByUserId: '0b8e6e70-0000-0000-0000-000000000003',
			createdAt: '2026-08-25T23:00:00Z',
			updatedAt: '2026-08-25T23:00:00Z',
			image: {
				url: '/files/uploads/x.png',
				altText: 'A tiny red square',
				widthPx: 1,
				heightPx: 1,
			},
		};

		const bytes = new TextEncoder().encode(JSON.stringify(payload));
		const arrayBuffer = bytes.buffer.slice(
			bytes.byteOffset,
			bytes.byteOffset + bytes.byteLength,
		);
		const node = new JsonParseNodeFactory().getRootParseNode(
			'application/json',
			arrayBuffer,
		);
		const detail = node.getObjectValue<PostDetail>(
			createPostDetailFromDiscriminatorValue,
		);
		const image = detail?.image;

		expect(image?.url).toBe('/files/uploads/x.png');
		expect(image?.altText).toBe('A tiny red square');
		expect(image?.widthPx).toBe(1);
		expect(image?.heightPx).toBe(1);
		expect(Object.keys(image?.additionalData ?? {})).toEqual([]);
	});
});
