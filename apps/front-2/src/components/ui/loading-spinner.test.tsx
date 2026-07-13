/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { LoadingSpinner } from './loading-spinner';

afterEach(cleanup);

describe('LoadingSpinner', () => {
	test('renders a status role with an accessible label', () => {
		render(<LoadingSpinner />);

		expect(screen.getByRole('status')).toBeTruthy();
	});

	test('merges a caller-provided className with the base spinner classes', () => {
		render(<LoadingSpinner className="size-6" />);

		expect(screen.getByRole('status').className).toContain('size-6');
		expect(screen.getByRole('status').className).toContain('animate-spin');
	});
});
