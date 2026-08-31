/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { EntityHeaderSkeleton, FieldRowsSkeleton } from './detail-skeleton';

afterEach(cleanup);

describe('FieldRowsSkeleton', () => {
	test('renders the requested number of input-height rows by default', () => {
		const { container } = render(<FieldRowsSkeleton count={5} />);

		const wrapper = container.firstElementChild as HTMLElement;
		expect(wrapper.getAttribute('data-slot')).toBe('field-rows-skeleton');
		expect(wrapper.className).toContain('space-y-4');
		const rows = wrapper.querySelectorAll('[data-slot="skeleton"]');
		expect(rows).toHaveLength(5);
		for (const row of rows) {
			expect(row.className).toContain('h-9');
			expect(row.className).toContain('w-full');
		}
	});

	test('lets the caller reshape rows and forwards props to the wrapper', () => {
		const { container } = render(
			<FieldRowsSkeleton
				count={2}
				rowClassName="h-20 w-full"
				data-testid="regional-loading"
				className="pt-2"
			/>,
		);

		const wrapper = container.firstElementChild as HTMLElement;
		expect(wrapper.getAttribute('data-testid')).toBe('regional-loading');
		expect(wrapper.className).toContain('pt-2');
		for (const row of wrapper.querySelectorAll('[data-slot="skeleton"]')) {
			expect(row.className).toContain('h-20');
		}
	});
});

describe('EntityHeaderSkeleton', () => {
	test('inline orientation places the tile beside stacked text lines', () => {
		const { container } = render(
			<EntityHeaderSkeleton
				tileClassName="size-14 rounded-[10px]"
				lines={['h-4 w-40', 'h-3 w-56']}
			/>,
		);

		const root = container.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-slot')).toBe('entity-header-skeleton');
		expect(root.className).toContain('flex items-center gap-4');

		const [tile, textBox] = Array.from(root.children) as HTMLElement[];
		expect(tile.className).toContain('size-14');
		expect(tile.className).toContain('rounded-[10px]');
		expect(textBox.className).toContain('space-y-1.5');

		const lines = textBox.querySelectorAll('[data-slot="skeleton"]');
		expect(lines).toHaveLength(2);
		expect(lines[0].className).toContain('w-40');
		expect(lines[1].className).toContain('w-56');
	});

	test('stacked orientation stacks the tile above flat text lines', () => {
		const { container } = render(
			<EntityHeaderSkeleton
				orientation="stacked"
				tileClassName="size-10 rounded-[10px]"
				lines={['h-3 w-2/3', 'h-3 w-full']}
			/>,
		);

		const root = container.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-slot')).toBe('entity-header-skeleton');
		expect(root.className).toContain('flex flex-col gap-3');

		const children = root.querySelectorAll(':scope > [data-slot="skeleton"]');
		expect(children).toHaveLength(3);
		expect(children[0].className).toContain('size-10');
		expect(children[1].className).toContain('w-2/3');
		expect(children[2].className).toContain('w-full');
	});
});
