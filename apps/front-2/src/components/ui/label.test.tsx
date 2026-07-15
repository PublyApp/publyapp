/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Label } from './label';

afterEach(cleanup);

describe('Label', () => {
	test('renders as a label with the expected slot and base classes', () => {
		render(<Label>Field label</Label>);

		const label = screen.getByText('Field label');
		expect(label.tagName).toBe('LABEL');
		expect(label.getAttribute('data-slot')).toBe('label');
		expect(label.className).toContain('gap-2');
		expect(label.className).toContain('text-[13px]');
	});
});
