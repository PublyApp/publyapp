/**
 * @vitest-environment jsdom
 */
import { IconCircleDashed } from '@tabler/icons-react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let text = key;
			for (const [name, value] of Object.entries(options ?? {})) {
				text = text.replaceAll(`{{${name}}}`, String(value));
			}
			return text;
		},
	}),
}));

import { FilterChips, FilterMenu } from './filter-menu';
import type { ListFilter } from './list-types';

beforeAll(() => {
	Object.defineProperty(window, 'innerWidth', {
		configurable: true,
		value: 1024,
	});
});

afterEach(cleanup);

type Row = { id: string; status: string };
const filters: ListFilter<Row>[] = [
	{
		key: 'status',
		label: 'Statuts',
		icon: IconCircleDashed,
		panel: true,
		choices: [
			{ value: 'active', label: 'Active' },
			{ value: 'pending', label: 'En attente' },
		],
		valueOf: (row) => row.status,
	},
];

describe('FilterMenu', () => {
	test('opens the categories and reports a toggle', () => {
		const onToggle = vi.fn();
		render(
			<FilterMenu
				filters={filters}
				active={{}}
				counts={{ status: { active: 3, pending: 1 } }}
				onToggle={onToggle}
				onClear={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: /list-filters/ }));
		expect(screen.getByText('Statuts')).toBeTruthy();
		expect(screen.getByText('3')).toBeTruthy();
		fireEvent.click(screen.getByRole('checkbox', { name: 'Active' }));
		expect(onToggle).toHaveBeenCalledWith('status', 'active');
	});
});

describe('FilterChips', () => {
	test('renders one removable chip per active value and clears all from two', () => {
		const onToggle = vi.fn();
		const onClearAll = vi.fn();
		render(
			<FilterChips
				filters={filters}
				active={{ status: ['active', 'pending'] }}
				onToggle={onToggle}
				onClearAll={onClearAll}
			/>,
		);

		expect(screen.getAllByText('list-filter-chip').length).toBe(2);
		fireEvent.click(
			screen.getAllByRole('button', { name: /list-filter-remove/ })[0],
		);
		expect(onToggle).toHaveBeenCalledWith('status', 'active');
		fireEvent.click(screen.getByRole('button', { name: 'list-clear-all' }));
		expect(onClearAll).toHaveBeenCalledTimes(1);
	});

	test('renders nothing without an active value', () => {
		const { container } = render(
			<FilterChips
				filters={filters}
				active={{}}
				onToggle={vi.fn()}
				onClearAll={vi.fn()}
			/>,
		);
		expect(container.firstChild).toBeNull();
	});
});
