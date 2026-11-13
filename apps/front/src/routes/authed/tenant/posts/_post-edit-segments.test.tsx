/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('~/lib/query/tenant-post-images', () => ({
	useAttachPostImageMutation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useRemovePostImageMutation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useReorderPostImagesMutation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useUpdatePostImageAltMutation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useInvalidatePostImageCaches: () => vi.fn(),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) =>
			options ? `${key} ${JSON.stringify(options)}` : key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { PostEditSegments } from './_post-edit-segments';
import type { EditSegmentImagesState } from './_use-edit-segment-images';

afterEach(cleanup);

const image = (id: string) => ({
	id,
	url: `https://api.example.test/files/${id}.png`,
	widthPx: 8,
	heightPx: 8,
	altText: null,
});

const file = (name: string) =>
	new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });

describe('PostEditSegments partial attach', () => {
	test('an image attached whose alt step failed is shown and counted once', () => {
		// img-2 is stored AND still queued (its alt update failed): one image.
		const unsaved: EditSegmentImagesState = {
			queued: [
				{
					id: 'q-2',
					file: file('two.png'),
					altText: 'alt',
					segmentKey: 'draft-a',
					attachedAssetId: 'img-2',
				},
			],
			error: 'boom',
			isWorking: false,
			dismissFormNotice: vi.fn(),
			retry: vi.fn(),
			onPick: vi.fn(),
		};

		render(
			<PostEditSegments
				postId="p-1"
				tenantId="t-1"
				stored={[
					{
						id: 'seg-a',
						number: 2,
						body: 'one',
						images: [image('img-1'), image('img-2')],
					},
				]}
				imageLimits={{
					maxImages: 4,
					maxImageBytes: 1_000_000,
					acceptedImageContentTypes: ['image/png'],
				}}
				unsavedImages={unsaved}
				segments={[{ id: 'draft-a', text: 'one', serverId: 'seg-a' }]}
				publishedSegmentCount={0}
				destinations={[]}
				onChange={vi.fn()}
			/>,
		);

		// img-1 (read-only) + the queued img-2 = 2, not 3.
		// The stored one is a read-only card, the queued one a card: two.
		expect(
			screen.getAllByTestId('tenant-posts-create-image-card'),
		).toHaveLength(2);
		expect(
			screen.getByTestId('tenant-posts-segment-image-count').textContent,
		).toContain('"count":2,"max":4');
	});
});
