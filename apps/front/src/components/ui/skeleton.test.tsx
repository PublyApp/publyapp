/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Skeleton } from './skeleton';

afterEach(cleanup);

describe('Skeleton', () => {
	test('renders an animated pulse placeholder with the base slot class', () => {
		const { container } = render(<Skeleton />);

		const skeleton = container.firstElementChild as HTMLElement;
		expect(skeleton).toBeTruthy();
		expect(skeleton.className).toContain('animate-pulse');
		expect(skeleton.className).toContain(
			'rounded-[var(--publy-radius-control)]',
		);
		expect(skeleton.getAttribute('data-slot')).toBe('skeleton');
	});
});
