/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { PageHeader } from './product-page';

afterEach(cleanup);

describe('PageHeader', () => {
	test('does not render an empty count wrapper when count is null', () => {
		const { container } = render(<PageHeader title="Tenants" count={null} />);

		expect(container.querySelector('.gap-2\\.5')).toBeNull();
	});

	test('renders the count wrapper when count is provided', () => {
		render(<PageHeader title="Tenants" count={<span>12</span>} />);

		expect(screen.getByText('12')).toBeTruthy();
	});
});
