/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
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

const renderControlledSelect = () => {
	const Controlled = () => {
		const [value, setValue] = React.useState('a');

		return (
			<div>
				<Select value={value} onValueChange={(next) => setValue(next)}>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="a">Alpha</SelectItem>
						<SelectItem value="b">Beta</SelectItem>
					</SelectContent>
				</Select>
				<div data-testid="selected-value">{value}</div>
			</div>
		);
	};

	return render(<Controlled />);
};

afterEach(cleanup);

describe('Select', () => {
	test('defaults to a trigger-anchored popup, not item-aligned', () => {
		renderSelect();

		const popup = screen
			.getByText('Alpha')
			.closest('[data-slot="select-content"]');
		expect(popup?.getAttribute('data-align-trigger')).toBe('false');
	});

	test('updates controlled state through selection interactions', async () => {
		renderControlledSelect();

		const trigger = screen.getByRole('combobox');
		const display = screen.getByTestId('selected-value');
		expect(display.textContent).toBe('a');

		fireEvent.click(trigger);

		const beta = await screen.findByText('Beta');
		expect(beta).not.toBeNull();
		const betaRow = beta.closest('[data-slot="select-item"]');
		expect(betaRow).not.toBeNull();

		fireEvent.mouseMove(betaRow as HTMLElement);
		fireEvent.mouseDown(betaRow as HTMLElement);
		fireEvent.click(betaRow as HTMLElement);

		expect(screen.getByTestId('selected-value').textContent).toBe('b');
	});

	test('closes when Escape is pressed while open', async () => {
		renderControlledSelect();

		const trigger = screen.getByRole('combobox');
		fireEvent.click(trigger);
		fireEvent.keyDown(trigger, { key: 'ArrowDown' });
		fireEvent.keyDown(trigger, { key: 'Escape' });

		expect(screen.queryByText('Beta')).toBeNull();
	});

	// F1: the popup must consume the shared --publy-z-select token (which
	// outranks the drawer surface, see check-design-system.test.mjs) instead
	// of a hardcoded z-[60] that loses to a Drawer opened around it.
	test('the popup uses the shared z-index token, not a hardcoded magic number', () => {
		renderSelect();

		const popup = screen
			.getByText('Alpha')
			.closest('[data-slot="select-content"]');
		expect(popup?.className).toContain('z-(--publy-z-select)');
		expect(popup?.className).not.toMatch(/z-\[\d+\]/);
	});
});
