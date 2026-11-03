/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { vi } from 'vitest';
import { afterEach, describe, expect, test } from 'vitest';

import { ListToolbar } from './list-toolbar';

afterEach(cleanup);

describe('ListToolbar', () => {
	test('pins against the real page padding and publishes its height', () => {
		const top = createRef<HTMLElement>();
		const onHeightChange = vi.fn();
		const { container } = render(
			<div>
				<ListToolbar
					top={top}
					onHeightChange={onHeightChange}
					search={<span>Recherche</span>}
				>
					<span>Actions</span>
				</ListToolbar>
			</div>,
		);

		const toolbar = container.querySelector('[data-list-toolbar]');
		expect(toolbar?.className).toContain('top-[calc(var(--page-pad-top)*-1)]');
		// #2280: the pinned toolbar outranks the table's sticky first column
		// (`--publy-z-sticky-cell`), which must never paint over it.
		expect(toolbar?.className).toContain('md:z-(--publy-z-raised)');
		expect(toolbar?.className).toContain('max-md:z-(--publy-z-raised)');
		expect(onHeightChange).toHaveBeenCalledWith(0);
	});
});
