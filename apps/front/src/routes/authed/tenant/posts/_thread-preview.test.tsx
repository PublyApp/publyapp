/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) =>
			options ? `${key} ${JSON.stringify(options)}` : key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { ComposerThreadPreview } from './_composer-thread-preview';
import type { SelectedDestination } from './_use-publish-selection';

afterEach(cleanup);

const limits = (max: number, maxImages: number) => ({
	textLimits: [{ unit: 'graphemes', max }],
	maxImages,
	maxImageBytes: 1_000_000,
	acceptedImageContentTypes: ['image/png'],
});

const BIG: SelectedDestination = {
	id: 'big',
	label: 'Big',
	limits: limits(300, 4),
};
const SMALL: SelectedDestination = {
	id: 'small',
	label: 'Small',
	limits: limits(300, 1),
};

const img = (key: string) => ({
	key,
	url: `https://files.test/${key}.png`,
	file: null,
	altText: `alt ${key}`,
});

const renderPreview = (destinations: SelectedDestination[]) =>
	render(
		<ComposerThreadPreview
			body="the first post"
			segments={[
				{ id: 'seg-a', text: 'the second' },
				{ id: 'seg-b', text: 'the third' },
			]}
			bodyImages={[img('root')]}
			imagesOfSegment={(segment) =>
				segment.id === 'seg-a' ? [img('a1'), img('a2')] : []
			}
			overrides={{}}
			destinations={destinations}
		/>,
	);

describe('ComposerThreadPreview', () => {
	test('a plain post (no follow-up) has nothing to preview', () => {
		render(
			<ComposerThreadPreview
				body="alone"
				segments={[]}
				bodyImages={[]}
				imagesOfSegment={() => []}
				overrides={{}}
				destinations={[BIG]}
			/>,
		);

		expect(screen.queryByTestId('tenant-posts-thread-preview')).toBeNull();
	});

	test('shows every segment in order with its text and its own images', () => {
		renderPreview([BIG]);

		const segments = screen.getAllByTestId(
			'tenant-posts-thread-preview-segment',
		);
		expect(
			segments.map(
				(segment) =>
					within(segment).getByTestId('tenant-posts-thread-preview-text')
						.textContent,
			),
		).toEqual(['the first post', 'the second', 'the third']);
		expect(
			segments.map(
				(segment) =>
					within(segment).queryAllByTestId('tenant-posts-thread-preview-image')
						.length,
			),
		).toEqual([1, 2, 0]);
		expect(
			within(segments[1] as HTMLElement)
				.getAllByTestId('tenant-posts-thread-preview-image')
				.map((node) => node.getAttribute('alt')),
		).toEqual(['alt a1', 'alt a2']);
	});

	test('one block when every destination publishes the same thread', () => {
		renderPreview([BIG, { ...BIG, id: 'other', label: 'Other' }]);

		expect(
			screen.getAllByTestId('tenant-posts-thread-preview-variant'),
		).toHaveLength(1);
		expect(screen.getByText('posts:thread-preview-all')).toBeTruthy();
	});

	test('splits per destination where limits differ and flags the images a smaller cap leaves out', () => {
		renderPreview([BIG, SMALL]);

		const variants = screen.getAllByTestId(
			'tenant-posts-thread-preview-variant',
		);
		expect(variants).toHaveLength(2);
		expect(within(variants[0] as HTMLElement).getByText('Big')).toBeTruthy();
		const small = variants[1] as HTMLElement;
		expect(within(small).getByText('Small')).toBeTruthy();
		expect(
			within(small).getByTestId('tenant-posts-thread-preview-dropped')
				.textContent,
		).toContain('"count":1');
		expect(
			within(variants[0] as HTMLElement).queryByTestId(
				'tenant-posts-thread-preview-dropped',
			),
		).toBeNull();
	});

	test('the shared view names itself when no destination is selected yet', () => {
		renderPreview([]);

		expect(screen.getByText('posts:thread-preview-shared')).toBeTruthy();
	});
});
