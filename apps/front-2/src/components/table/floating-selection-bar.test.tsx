/**
 * @vitest-environment jsdom
 */
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { FloatingSelectionBar } from './floating-selection-bar';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const count = typeof options?.count === 'number' ? options.count : 0;
			if (key === 'selected-count') {
				return `${count} selected`;
			}
			if (key === 'select-all-visible') {
				return `Select all ${count}`;
			}
			if (key === 'clear-selection') {
				return 'Clear selection';
			}
			return key;
		},
	}),
}));

afterEach(cleanup);

beforeEach(() => {
	vi.useRealTimers();
});

const renderBar = (
	props: Partial<ComponentProps<typeof FloatingSelectionBar>> = {},
) => {
	const onClear = vi.fn();
	const onSelectAllVisible = vi.fn();
	const utils = render(
		<FloatingSelectionBar
			selectedCount={2}
			visibleCount={5}
			allVisibleSelected={false}
			onClear={onClear}
			onSelectAllVisible={onSelectAllVisible}
			{...props}
		>
			<button type="button">Action</button>
		</FloatingSelectionBar>,
	);
	return { ...utils, onClear, onSelectAllVisible };
};

describe('FloatingSelectionBar', () => {
	test('does not render when nothing is selected', () => {
		renderBar({ selectedCount: 0 });
		expect(screen.queryByTestId('floating-selection-bar')).toBeNull();
	});

	test('mounts and shows the selected count when selection starts', async () => {
		renderBar({ selectedCount: 3, visibleCount: 3, allVisibleSelected: true });
		expect(await screen.findByTestId('floating-selection-bar')).toBeTruthy();
		expect(screen.getByText('3 selected')).toBeTruthy();
	});

	test('count text is aria-live=polite', async () => {
		renderBar({ selectedCount: 1 });
		const bar = await screen.findByTestId('floating-selection-bar');
		const liveRegion = bar.querySelector('[aria-live="polite"]');
		expect(liveRegion?.textContent).toBe('1 selected');
	});

	test('hides select-all-visible when nothing selected', () => {
		renderBar({ selectedCount: 0, visibleCount: 5, allVisibleSelected: false });
		expect(screen.queryByText(/Select all/)).toBeNull();
	});

	test('shows select-all-visible on a partial selection', async () => {
		renderBar({ selectedCount: 2, visibleCount: 5, allVisibleSelected: false });
		expect(await screen.findByText('Select all 5')).toBeTruthy();
	});

	test('hides select-all-visible once all visible rows are selected', async () => {
		renderBar({ selectedCount: 5, visibleCount: 5, allVisibleSelected: true });
		await screen.findByTestId('floating-selection-bar');
		expect(screen.queryByText(/Select all/)).toBeNull();
	});

	test('fires onClear when the clear button is clicked', async () => {
		const { onClear } = renderBar({ selectedCount: 2 });
		const bar = await screen.findByTestId('floating-selection-bar');
		fireEvent.click(screen.getByLabelText('Clear selection'));
		expect(onClear).toHaveBeenCalledTimes(1);
		expect(bar).toBeTruthy();
	});

	test('fires onSelectAllVisible when the select-all link is clicked', async () => {
		const { onSelectAllVisible } = renderBar({
			selectedCount: 2,
			visibleCount: 5,
			allVisibleSelected: false,
		});
		fireEvent.click(await screen.findByText('Select all 5'));
		expect(onSelectAllVisible).toHaveBeenCalledTimes(1);
	});

	test('renders action children', async () => {
		renderBar({ selectedCount: 2 });
		expect(await screen.findByText('Action')).toBeTruthy();
	});

	test('stays mounted through the exit animation, then unmounts after clearing', async () => {
		vi.useFakeTimers();
		const { rerender } = render(
			<FloatingSelectionBar
				selectedCount={2}
				visibleCount={5}
				allVisibleSelected={false}
				onClear={vi.fn()}
				onSelectAllVisible={vi.fn()}
			>
				<button type="button">Action</button>
			</FloatingSelectionBar>,
		);

		act(() => {
			vi.advanceTimersByTime(20);
		});
		expect(screen.getByTestId('floating-selection-bar')).toBeTruthy();

		rerender(
			<FloatingSelectionBar
				selectedCount={0}
				visibleCount={5}
				allVisibleSelected={false}
				onClear={vi.fn()}
				onSelectAllVisible={vi.fn()}
			>
				<button type="button">Action</button>
			</FloatingSelectionBar>,
		);

		// Still mounted immediately after clearing — the exit transition plays.
		expect(screen.getByTestId('floating-selection-bar')).toBeTruthy();

		act(() => {
			vi.advanceTimersByTime(500);
		});

		expect(screen.queryByTestId('floating-selection-bar')).toBeNull();
		vi.useRealTimers();
	});
});
