/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, test, vitest } from 'vitest';

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from './select';

vitest.mock('react-i18next', () => ({
	useTranslation: () => ({
		// #840: the shared ScrollArea label comes from `common`; resolve it
		// so assertions can pin the rendered string.
		t: (key: string) =>
			key === 'scroll-area-label' ? 'Scrollable content' : key,
	}),
}));

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
				<Select value={value} onValueChange={(next) => setValue(next ?? '')}>
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
	test('preserves trigger semantics and uses the shared form-control state matrix', () => {
		renderSelect();

		const trigger = screen.getByRole('combobox');
		const classes = new Set(trigger.className.split(/\s+/));

		expect(trigger.getAttribute('data-slot')).toBe('select-trigger');
		expect(trigger.getAttribute('data-size')).toBe('default');
		for (const token of [
			'border',
			'border-border',
			'bg-input/50',
			'shadow-[var(--publy-shadow-input)]',
			'focus-visible:border-ring',
			'focus-visible:ring-3',
			'focus-visible:ring-ring/30',
			'aria-invalid:border-destructive',
			'aria-invalid:ring-3',
			'aria-invalid:ring-destructive/20',
			'dark:aria-invalid:border-destructive/50',
			'dark:aria-invalid:ring-destructive/40',
			'aria-invalid:focus-visible:border-destructive',
			'aria-invalid:focus-visible:ring-destructive/20',
			'dark:aria-invalid:focus-visible:border-destructive',
			'dark:aria-invalid:focus-visible:ring-destructive/40',
			'disabled:cursor-not-allowed',
			'disabled:opacity-50',
		]) {
			expect(classes).toContain(token);
		}
		for (const token of [
			'bg-input/35',
			'focus-visible:ring-ring',
			'aria-invalid:ring-destructive/12',
			'rounded-3xl',
		]) {
			expect(classes).not.toContain(token);
		}
		for (const token of [
			'rounded-[var(--publy-radius-input)]',
			'px-3',
			'py-2',
			'text-[13px]',
			'data-[size=default]:h-9',
			'data-[size=sm]:h-8',
		]) {
			expect(classes).toContain(token);
		}
	});

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
	// of a hardcoded numeric stacking value that loses to a Drawer opened
	// around it.
	test('the popup uses the shared z-index token, not a hardcoded magic number', () => {
		renderSelect();

		const popup = screen
			.getByText('Alpha')
			.closest('[data-slot="select-content"]');
		expect(popup?.className).toContain('z-(--publy-z-select)');
		expect(popup?.className).not.toMatch(/z-\[\d+\]/);
	});
});

describe('Select content scrolling (#840)', () => {
	test('the active option scrolls inside the SimpleBar wrapper, not the popup', () => {
		renderSelect();

		const wrapper = document.querySelector(
			'.simplebar-content-wrapper',
		) as HTMLElement | null;
		expect(wrapper).not.toBeNull();
		expect(wrapper?.getAttribute('aria-label')).toBe('Scrollable content');

		const active = screen.getByRole('option', { name: 'Beta' });
		let ancestor: HTMLElement | null = active.parentElement;
		while (ancestor && ancestor !== wrapper) {
			ancestor = ancestor.parentElement;
		}
		// Base UI drives keyboard auto-scroll with scrollIntoView, which walks
		// up to the nearest scrollable ancestor; that ancestor must be the
		// SimpleBar wrapper so scrollTop writes land where SimpleBar tracks.
		expect(ancestor).toBe(wrapper);

		// The popup itself no longer scrolls: SimpleBar owns it.
		const popup = document.querySelector('[data-slot="select-content"]');
		const scroller = [...(popup?.children ?? [])].find((child) =>
			(child as HTMLElement).className.includes('relative'),
		);
		expect(window.getComputedStyle(scroller as Element).overflowY).not.toBe(
			'auto',
		);
	});
});
