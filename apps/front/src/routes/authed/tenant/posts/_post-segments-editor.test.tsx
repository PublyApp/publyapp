/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { NO_OVERRIDE, withText } from '~/lib/publishing/destination-overrides';
import type { DestinationOverrides } from '~/lib/publishing/destination-overrides';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) =>
			options ? `${key} ${JSON.stringify(options)}` : key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { PostSegmentsEditor } from './_post-segments-editor';
import type { SegmentDraft } from './_segment-draft';
import { newSegmentDraft } from './_segment-draft';

const DESTINATIONS = [
	{
		id: 'acc-bluesky',
		label: 'Bluesky',
		limits: {
			textLimits: [
				{ unit: 'graphemes', max: 300 },
				{ unit: 'bytes', max: 3000 },
			],
			maxImages: 4,
			maxImageBytes: 1_000_000,
			acceptedImageContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
		},
	},
];

const Harness = ({
	initial = [],
	published = 0,
	overrides,
	onChange,
}: {
	initial?: string[];
	published?: number;
	overrides?: (segments: SegmentDraft[]) => DestinationOverrides;
	onChange?: (next: string[]) => void;
}) => {
	const [segments, setSegments] = useState<SegmentDraft[]>(() =>
		initial.map((text) => newSegmentDraft(text)),
	);
	return (
		<PostSegmentsEditor
			segments={segments}
			publishedSegmentCount={published}
			destinations={DESTINATIONS}
			overrides={overrides?.(segments)}
			onChange={(next) => {
				setSegments(next);
				onChange?.(next.map((segment) => segment.text));
			}}
		/>
	);
};

const bodies = () =>
	screen
		.queryAllByTestId('tenant-posts-segment-body')
		.map((field) => (field as HTMLTextAreaElement).value);

afterEach(() => {
	cleanup();
});

describe('PostSegmentsEditor', () => {
	test('a plain post shows only the add button', () => {
		render(<Harness />);

		expect(screen.queryAllByTestId('tenant-posts-segment')).toHaveLength(0);
		expect(screen.getByTestId('tenant-posts-segment-add')).toBeTruthy();
	});

	test('add appends a blank segment numbered after the first', async () => {
		const user = userEvent.setup();
		render(<Harness />);

		await user.click(screen.getByTestId('tenant-posts-segment-add'));
		await user.click(screen.getByTestId('tenant-posts-segment-add'));

		expect(bodies()).toEqual(['', '']);
		const numbers = screen
			.getAllByTestId('tenant-posts-segment-number')
			.map((label) => label.textContent);
		expect(numbers[0]).toContain('"index":2');
		expect(numbers[0]).toContain('"total":3');
		expect(numbers[1]).toContain('"index":3');
		expect(
			screen.getByTestId('tenant-posts-segment-first-number'),
		).toBeTruthy();
	});

	test('a segment a destination customized is not counted against that destination', () => {
		render(
			<Harness
				initial={['hello', 'a'.repeat(301)]}
				// Bluesky has its own text for the second follow-up.
				overrides={(segments) => ({
					'acc-bluesky': withText(NO_OVERRIDE, segments[1]?.id ?? '', 'short'),
				})}
			/>,
		);

		const counters = screen.getAllByTestId('tenant-posts-limit-counter');
		// Only the first follow-up still has a destination that inherits it.
		expect(counters).toHaveLength(1);
		expect(counters[0]?.textContent).toContain('5 / 300');
	});

	test('each segment has its own live counter', () => {
		render(<Harness initial={['hello', 'a'.repeat(301)]} />);

		const counters = screen.getAllByTestId('tenant-posts-limit-counter');
		expect(
			counters.map((counter) => counter.getAttribute('data-state')),
		).toEqual(['ok', 'error']);
		expect(counters[0]?.textContent).toContain('5 / 300');
		expect(counters[1]?.textContent).toContain('301 / 300');
	});

	test('typing updates only that segment', () => {
		const onChange = vi.fn();
		render(<Harness initial={['one', 'two']} onChange={onChange} />);

		fireEvent.change(screen.getAllByTestId('tenant-posts-segment-body')[1], {
			target: { value: 'two edited' },
		});

		expect(onChange).toHaveBeenLastCalledWith(['one', 'two edited']);
	});

	test('reorders with the arrows and disables them at the ends', async () => {
		const user = userEvent.setup();
		render(<Harness initial={['one', 'two', 'three']} />);

		const earlier = screen.getAllByTestId('tenant-posts-segment-move-earlier');
		const later = screen.getAllByTestId('tenant-posts-segment-move-later');
		expect((earlier[0] as HTMLButtonElement).disabled).toBe(true);
		expect((later[2] as HTMLButtonElement).disabled).toBe(true);

		await user.click(later[0] as HTMLElement);
		expect(bodies()).toEqual(['two', 'one', 'three']);

		await user.click(
			screen.getAllByTestId(
				'tenant-posts-segment-move-earlier',
			)[2] as HTMLElement,
		);
		expect(bodies()).toEqual(['two', 'three', 'one']);
	});

	test('removing a blank segment is immediate', async () => {
		const user = userEvent.setup();
		render(<Harness initial={['one', '   ']} />);

		await user.click(
			screen.getAllByTestId('tenant-posts-segment-remove')[1] as HTMLElement,
		);

		expect(bodies()).toEqual(['one']);
	});

	test('removing a segment with text asks first and keeps it on cancel', async () => {
		const user = userEvent.setup();
		render(<Harness initial={['one', 'two']} />);

		await user.click(
			screen.getAllByTestId('tenant-posts-segment-remove')[0] as HTMLElement,
		);
		expect(screen.getByText('posts:segment-remove-title')).toBeTruthy();
		expect(bodies()).toEqual(['one', 'two']);

		await user.click(screen.getByText('cancel'));
		expect(bodies()).toEqual(['one', 'two']);

		await user.click(
			screen.getAllByTestId('tenant-posts-segment-remove')[0] as HTMLElement,
		);
		await user.click(screen.getByText('posts:segment-remove-confirm'));
		expect(bodies()).toEqual(['two']);
	});

	test('published segments are read-only and cannot be removed or moved', () => {
		// The first body plus the first follow-up (segments 1 and 2) are out.
		render(<Harness initial={['two', 'three']} published={2} />);

		const blocks = screen.getAllByTestId('tenant-posts-segment');
		expect(blocks[0]?.getAttribute('data-locked')).toBe('true');
		expect(blocks[1]?.getAttribute('data-locked')).toBeNull();
		const fields = screen.getAllByTestId(
			'tenant-posts-segment-body',
		) as HTMLTextAreaElement[];
		expect(fields[0]?.readOnly).toBe(true);
		expect(fields[1]?.readOnly).toBe(false);
		expect(
			screen.getAllByTestId('tenant-posts-segment-published'),
		).toHaveLength(1);
		const removes = screen.getAllByTestId(
			'tenant-posts-segment-remove',
		) as HTMLButtonElement[];
		expect(removes.map((button) => button.disabled)).toEqual([true, false]);
		// The unpublished segment cannot move above a published one.
		const earlier = screen.getAllByTestId(
			'tenant-posts-segment-move-earlier',
		) as HTMLButtonElement[];
		expect(earlier[1]?.disabled).toBe(true);
	});

	test('stops adding at 25 segments', () => {
		render(
			<Harness
				initial={Array.from({ length: 24 }, (_, index) => `s${index}`)}
			/>,
		);

		expect(
			(screen.getByTestId('tenant-posts-segment-add') as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});
});
