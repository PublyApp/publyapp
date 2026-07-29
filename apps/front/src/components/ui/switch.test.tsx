/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Switch } from './switch';

afterEach(cleanup);

describe('Switch', () => {
	test('defaults to the "default" size track/thumb pair', () => {
		render(<Switch aria-label="Enabled" readOnly checked />);

		const root = screen.getByRole('switch');
		expect(root.getAttribute('data-size')).toBe('default');
		expect(root.className).toContain('data-[size=default]:h-5');
		expect(root.className).toContain('data-[size=default]:w-11');
	});

	// r3 F11: the thumb travel is a `calc(100%-8px)` translate against two
	// different track/thumb pairs (default 44x20 track with a 24px thumb, sm
	// 28x16 track with a 16px thumb) — both happen to land flush today, but
	// nothing pinned either pairing, so a future edit to one track width or
	// thumb size without the other would silently misalign the thumb.
	test('the "sm" size renders its own, narrower track/thumb pair', () => {
		render(<Switch aria-label="Enabled" readOnly checked size="sm" />);

		const root = screen.getByRole('switch');
		expect(root.getAttribute('data-size')).toBe('sm');
		expect(root.className).toContain('data-[size=sm]:h-4');
		expect(root.className).toContain('data-[size=sm]:w-7');

		const thumb = root.querySelector('[data-slot="switch-thumb"]');
		expect(thumb?.className).toContain('group-data-[size=sm]/switch:h-3');
		expect(thumb?.className).toContain('group-data-[size=sm]/switch:w-4');
	});

	test('checked state drives the thumb translate and unchecked drives the reset', () => {
		const { rerender } = render(
			<Switch aria-label="Enabled" readOnly checked={false} />,
		);

		const thumb = () =>
			screen.getByRole('switch').querySelector('[data-slot="switch-thumb"]');

		expect(thumb()?.className).toContain('data-unchecked:translate-x-0');

		rerender(<Switch aria-label="Enabled" readOnly checked />);

		expect(thumb()?.className).toContain(
			'data-checked:translate-x-[calc(100%-8px)]',
		);
	});
});
