/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from './select';

const renderSelect = () =>
	render(
		<Select defaultOpen defaultValue="a">
			<SelectTrigger>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="a">Alpha</SelectItem>
				<SelectItem value="b">Beta</SelectItem>
			</SelectContent>
		</Select>,
	);

afterEach(cleanup);

describe('Select', () => {
	test('defaults to a trigger-anchored popup, not item-aligned', () => {
		renderSelect();

		const popup = screen
			.getByText('Alpha')
			.closest('[data-slot="select-content"]');
		expect(popup?.getAttribute('data-align-trigger')).toBe('false');
	});
});
