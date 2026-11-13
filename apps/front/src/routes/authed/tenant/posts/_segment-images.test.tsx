/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	attachMutateAsync: vi.fn(),
	removeMutateAsync: vi.fn(),
	reorderMutateAsync: vi.fn(),
	altMutateAsync: vi.fn(),
	invalidateFn: vi.fn(),
}));

vi.mock('~/lib/query/tenant-post-images', () => ({
	useAttachPostImageMutation: () => ({
		mutateAsync: mocks.attachMutateAsync,
		isPending: false,
	}),
	useRemovePostImageMutation: () => ({
		mutateAsync: mocks.removeMutateAsync,
		isPending: false,
	}),
	useReorderPostImagesMutation: () => ({
		mutateAsync: mocks.reorderMutateAsync,
		isPending: false,
	}),
	useUpdatePostImageAltMutation: () => ({
		mutateAsync: mocks.altMutateAsync,
		isPending: false,
	}),
	useInvalidatePostImageCaches: () => mocks.invalidateFn,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) =>
			options ? `${key} ${JSON.stringify(options)}` : key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

import type { TenantPostImage } from '~/lib/query/tenant-post-images';

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { imagesOfSegment } from './_deferred-images';
import type { DeferredImageSelection } from './_post-image-picker';
import {
	DeferredSegmentImages,
	StoredSegmentImages,
	UnsavedSegmentImagesFailure,
} from './_segment-images';

const LIMITS = {
	maxImages: 10,
	maxImageBytes: 1_000_000,
	acceptedImageContentTypes: ['image/png'],
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const png = (name: string) =>
	new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });

const stored = (
	id: string,
	altText: string | null = null,
): TenantPostImage => ({
	id,
	url: `https://api.example.test/files/${id}.png`,
	widthPx: 8,
	heightPx: 8,
	altText,
});

/** The drawer's one list of picked images, owned by the parent. */
const DeferredHarness = ({
	initial = [],
	onList,
	storedImages,
}: {
	initial?: DeferredImageSelection[];
	onList?: (list: DeferredImageSelection[]) => void;
	storedImages?: TenantPostImage[];
}) => {
	const [all, setAll] = useState<DeferredImageSelection[]>(initial);
	return (
		<DeferredSegmentImages
			segmentKey="seg-a"
			number={2}
			all={all}
			onChange={(next) => {
				setAll(next);
				onList?.(next);
			}}
			limits={LIMITS}
			storedImages={storedImages}
		/>
	);
};

const fileNames = () =>
	screen
		.queryAllByTestId('tenant-posts-create-image-card')
		.map((card) => within(card).getByRole('img').getAttribute('alt'));

describe('DeferredSegmentImages (create drawer)', () => {
	test('the label comes first, then the count, then the images (stored ones first, as cards)', async () => {
		render(
			<DeferredHarness
				storedImages={[stored('a')]}
				initial={[
					{ id: 'q1', file: png('q.png'), altText: '', segmentKey: 'seg-a' },
				]}
			/>,
		);

		const label = screen.getByText('posts:segment-images-label {"index":2}');
		const count = screen.getByTestId('tenant-posts-segment-image-count');
		const cards = screen.getAllByTestId('tenant-posts-create-image-card');
		const before = (a: Node, b: Node) =>
			Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
		expect(before(label, count)).toBe(true);
		expect(before(count, cards[0] as Node)).toBe(true);
		// The stored image is the first card, read-only (its remove is off).
		expect(cards).toHaveLength(2);
		expect(
			(
				within(cards[0] as HTMLElement).getByTestId(
					'tenant-posts-create-image-remove',
				) as HTMLButtonElement
			).disabled,
		).toBe(true);
		expect(
			within(cards[0] as HTMLElement)
				.getByTestId('tenant-posts-create-image-preview')
				.getAttribute('src'),
		).toContain('/files/a.png');
		// No alt nudge on the read-only card; the queued one keeps it.
		expect(
			within(cards[0] as HTMLElement).queryByTestId(
				'tenant-posts-create-image-alt-nudge',
			),
		).toBeNull();
		expect(
			within(cards[1] as HTMLElement).getByTestId(
				'tenant-posts-create-image-alt-nudge',
			),
		).toBeTruthy();
		// The first queued card cannot move before the read-only one.
		expect(
			(
				within(cards[1] as HTMLElement).getByTestId(
					'tenant-posts-create-image-move-earlier',
				) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	test('no limit notice on an empty picker once its files are gone (nothing dropped)', async () => {
		const user = userEvent.setup();
		const Harness = ({ initial }: { initial: DeferredImageSelection[] }) => {
			const [all, setAll] = useState<DeferredImageSelection[]>(initial);
			return (
				<>
					<DeferredSegmentImages
						segmentKey="seg-a"
						number={2}
						all={all}
						onChange={setAll}
						limits={{ ...LIMITS, maxImages: 2 }}
					/>
					<button
						type="button"
						data-testid="drain"
						onClick={() => setAll([])}
					/>
				</>
			);
		};
		render(<Harness initial={[]} />);
		await user.upload(screen.getByTestId('tenant-posts-create-image-input'), [
			png('1.png'),
			png('2.png'),
			png('3.png'),
		]);
		await screen.findByTestId('tenant-posts-create-image-limit');

		// The queue drains (attached): the picker is empty, nothing was dropped now.
		await user.click(screen.getByTestId('drain'));

		expect(screen.queryByTestId('tenant-posts-create-image-limit')).toBeNull();
	});

	test('after a partial attach the stored images stay visible and count against the cap', async () => {
		const user = userEvent.setup();
		let latest: DeferredImageSelection[] = [];
		render(
			<DeferredHarness
				storedImages={[stored('a'), stored('b'), stored('c')]}
				onList={(list) => (latest = list)}
			/>,
		);

		// Stored images are cards in the picker itself, before the queued ones.
		expect(
			screen.getAllByTestId('tenant-posts-create-image-card'),
		).toHaveLength(3);
		expect(
			screen.getByTestId('tenant-posts-segment-image-count').textContent,
		).toContain('"count":3,"max":4');

		await user.upload(screen.getByTestId('tenant-posts-create-image-input'), [
			png('one.png'),
			png('two.png'),
		]);

		// Only the one slot left (4 - 3) is taken.
		await waitFor(() => expect(latest).toHaveLength(1));
		expect(
			screen.getByTestId('tenant-posts-segment-image-count').textContent,
		).toContain('"count":4,"max":4');
	});

	test('picks images for the segment and stamps them with it', async () => {
		const user = userEvent.setup();
		let latest: DeferredImageSelection[] = [];
		render(<DeferredHarness onList={(list) => (latest = list)} />);

		await user.upload(screen.getByTestId('tenant-posts-create-image-input'), [
			png('one.png'),
			png('two.png'),
		]);

		await waitFor(() => expect(latest).toHaveLength(2));
		expect(latest.map((image) => image.segmentKey)).toEqual(['seg-a', 'seg-a']);
		expect(
			screen.getAllByTestId('tenant-posts-create-image-card'),
		).toHaveLength(2);
		// Nothing is uploaded now: the post does not exist yet.
		expect(mocks.attachMutateAsync).not.toHaveBeenCalled();
	});

	test('stops at 4 images per follow-up, whatever the destinations advertise (10 here)', async () => {
		const user = userEvent.setup();
		render(<DeferredHarness />);

		await user.upload(
			screen.getByTestId('tenant-posts-create-image-input'),
			['1', '2', '3', '4', '5'].map((name) => png(`${name}.png`)),
		);

		await waitFor(() =>
			expect(
				screen.getAllByTestId('tenant-posts-create-image-card'),
			).toHaveLength(4),
		);
		expect(
			screen.getByTestId('tenant-posts-segment-image-count').textContent,
		).toContain('"count":4,"max":4');
		expect(screen.getByTestId('tenant-posts-create-image-limit')).toBeTruthy();
		expect(
			(
				screen.getByTestId(
					'tenant-posts-create-image-input',
				) as HTMLInputElement
			).disabled,
		).toBe(true);
	});

	test('the 4-image cap holds even while the destination limits are unknown (M4)', async () => {
		const user = userEvent.setup();
		const Harness = () => {
			const [all, setAll] = useState<DeferredImageSelection[]>([]);
			return (
				<DeferredSegmentImages
					segmentKey="seg-z"
					number={3}
					all={all}
					onChange={setAll}
					limits={null}
				/>
			);
		};
		render(<Harness />);

		await user.upload(
			screen.getByTestId('tenant-posts-create-image-input'),
			['1', '2', '3', '4', '5'].map((name) => png(`${name}.png`)),
		);

		await waitFor(() =>
			expect(
				screen.getAllByTestId('tenant-posts-create-image-card'),
			).toHaveLength(4),
		);
		expect(screen.getByTestId('tenant-posts-create-image-limit')).toBeTruthy();
	});

	test("another segment's images and the post's own are never shown nor touched", async () => {
		const other = {
			id: 'other',
			file: png('other.png'),
			altText: '',
			segmentKey: 'seg-b',
		};
		const own = { id: 'root', file: png('root.png'), altText: '' };
		let latest: DeferredImageSelection[] = [];
		render(
			<DeferredHarness
				initial={[own, other]}
				onList={(list) => (latest = list)}
			/>,
		);
		expect(screen.queryAllByTestId('tenant-posts-create-image-card')).toEqual(
			[],
		);

		await userEvent
			.setup()
			.upload(screen.getByTestId('tenant-posts-create-image-input'), [
				png('mine.png'),
			]);

		await waitFor(() => expect(latest).toHaveLength(3));
		expect(latest.map((image) => image.id)).toContain('root');
		expect(latest.map((image) => image.id)).toContain('other');
		expect(imagesOfSegment(latest, 'seg-a')).toHaveLength(1);
	});

	test('removes one image and reorders the rest, all inside the segment', async () => {
		const user = userEvent.setup();
		let latest: DeferredImageSelection[] = [];
		const mine = ['a', 'b', 'c'].map((id) => ({
			id,
			file: png(`${id}.png`),
			altText: id,
			segmentKey: 'seg-a',
		}));
		render(
			<DeferredHarness initial={mine} onList={(list) => (latest = list)} />,
		);

		await user.click(
			screen.getAllByTestId('tenant-posts-create-image-move-later')[0]!,
		);
		expect(latest.map((image) => image.id)).toEqual(['b', 'a', 'c']);
		expect(fileNames()).toEqual(['b', 'a', 'c']);

		await user.click(
			screen.getAllByTestId('tenant-posts-create-image-remove')[1]!,
		);
		expect(latest.map((image) => image.id)).toEqual(['b', 'c']);
		expect(
			screen.getByTestId('tenant-posts-segment-image-count').textContent,
		).toContain('"count":2');
	});

	test('the count turns red above a stricter destination cap', () => {
		const three = ['a', 'b', 'c'].map((id) => ({
			id,
			file: png(`${id}.png`),
			altText: '',
			segmentKey: 'seg-a',
		}));
		render(
			<DeferredSegmentImages
				segmentKey="seg-a"
				number={2}
				all={three}
				onChange={() => undefined}
				limits={{ ...LIMITS, maxImages: 2 }}
			/>,
		);

		expect(
			screen
				.getByTestId('tenant-posts-segment-image-count')
				.className.includes('danger'),
		).toBe(true);
	});

	test('two segments on one page keep distinct field ids', () => {
		const withImage = (segmentKey: string) => [
			{ id: segmentKey, file: png('x.png'), altText: '', segmentKey },
		];
		render(
			<>
				<DeferredSegmentImages
					segmentKey="seg-a"
					number={2}
					all={withImage('seg-a')}
					onChange={() => undefined}
					limits={LIMITS}
				/>
				<DeferredSegmentImages
					segmentKey="seg-b"
					number={3}
					all={withImage('seg-b')}
					onChange={() => undefined}
					limits={LIMITS}
				/>
			</>,
		);

		const ids = screen
			.getAllByTestId('tenant-posts-create-image-alt')
			.map((input) => input.id);
		expect(new Set(ids).size).toBe(2);
		const inputIds = screen
			.getAllByTestId('tenant-posts-create-image-input')
			.map((input) => input.id);
		expect(new Set(inputIds).size).toBe(2);
	});
});

describe('StoredSegmentImages (edit page)', () => {
	const renderStored = (images: TenantPostImage[], maxImages = 10) =>
		render(
			<StoredSegmentImages
				postId="post-1"
				tenantId="tenant-1"
				segmentId="seg-2"
				number={2}
				images={images}
				limits={{ ...LIMITS, maxImages }}
			/>,
		);

	test('attaches to the segment, never to the post', async () => {
		const user = userEvent.setup();
		renderStored([]);

		await user.upload(screen.getByTestId('tenant-posts-create-image-input'), [
			png('one.png'),
		]);

		await waitFor(() =>
			expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1),
		);
		expect(mocks.attachMutateAsync.mock.calls[0]?.[0]).toMatchObject({
			postId: 'post-1',
			tenantId: 'tenant-1',
			segmentId: 'seg-2',
		});
	});

	test('refuses a fifth image before any request (limit 4)', async () => {
		const user = userEvent.setup();
		renderStored([stored('a'), stored('b'), stored('c')]);

		await user.upload(screen.getByTestId('tenant-posts-create-image-input'), [
			png('four.png'),
			png('five.png'),
		]);

		await waitFor(() =>
			expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1),
		);
		expect(screen.getByTestId('tenant-posts-create-image-limit')).toBeTruthy();
	});

	test('remove, reorder and alt text all address the segment', async () => {
		const user = userEvent.setup();
		renderStored([stored('a'), stored('b')]);

		await user.click(
			screen.getAllByTestId('tenant-posts-create-image-remove')[0]!,
		);
		await waitFor(() =>
			expect(mocks.removeMutateAsync).toHaveBeenCalledWith({
				postId: 'post-1',
				tenantId: 'tenant-1',
				assetId: 'a',
				segmentId: 'seg-2',
			}),
		);

		await user.click(
			screen.getAllByTestId('tenant-posts-create-image-move-later')[0]!,
		);
		await waitFor(() =>
			expect(mocks.reorderMutateAsync).toHaveBeenCalledWith({
				postId: 'post-1',
				tenantId: 'tenant-1',
				assetIds: ['b', 'a'],
				segmentId: 'seg-2',
			}),
		);

		const alt = screen.getAllByTestId('tenant-posts-create-image-alt')[1]!;
		await user.click(alt);
		fireEvent.change(alt, { target: { value: 'second image' } });
		await user.tab();
		await waitFor(() =>
			expect(mocks.altMutateAsync).toHaveBeenCalledWith({
				postId: 'post-1',
				tenantId: 'tenant-1',
				assetId: 'b',
				altText: 'second image',
				segmentId: 'seg-2',
			}),
		);
	});

	test('Enter in an alt field commits it and never submits the surrounding form', async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
			event.preventDefault(),
		);
		render(
			<form onSubmit={onSubmit}>
				<StoredSegmentImages
					postId="post-1"
					tenantId="tenant-1"
					segmentId="seg-2"
					number={2}
					images={[stored('a')]}
					limits={LIMITS}
				/>
			</form>,
		);

		const alt = screen.getByTestId('tenant-posts-create-image-alt');
		await user.click(alt);
		fireEvent.change(alt, { target: { value: 'typed' } });
		await user.keyboard('{Enter}');

		expect(onSubmit).not.toHaveBeenCalled();
		await waitFor(() => expect(mocks.altMutateAsync).toHaveBeenCalledTimes(1));
	});
});

describe('UnsavedSegmentImagesFailure', () => {
	test('names the cause and offers the retry that finishes the job', async () => {
		const onRetry = vi.fn();
		render(
			<UnsavedSegmentImagesFailure cause="The save failed" onRetry={onRetry} />,
		);

		expect(
			screen.getByTestId('tenant-posts-segment-images-failure').textContent,
		).toContain('The save failed');
		await userEvent.click(
			screen.getByTestId('tenant-posts-segment-images-retry'),
		);
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
