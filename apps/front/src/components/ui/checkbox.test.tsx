/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Checkbox } from './checkbox';

afterEach(cleanup);

describe('Checkbox', () => {
	test('renders the check icon when checked', () => {
		const { container } = render(<Checkbox checked readOnly />);

		expect(container.querySelector('.tabler-icon-check')).not.toBeNull();
		expect(container.querySelector('.tabler-icon-minus')).toBeNull();
	});

	test('renders the minus icon when indeterminate', () => {
		const { container } = render(<Checkbox indeterminate readOnly />);

		expect(container.querySelector('.tabler-icon-minus')).not.toBeNull();
		expect(container.querySelector('.tabler-icon-check')).toBeNull();
	});
});
