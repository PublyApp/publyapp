/**
 * @vitest-environment jsdom
 */
import { IconBuilding, IconHash } from '@tabler/icons-react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

import type { ColumnSpecs } from './list-types';
import { SortMenu } from './sort-menu';

beforeAll(() => {
	Object.defineProperty(window, 'innerWidth', {
		configurable: true,
		value: 1024,
	});
});

afterEach(cleanup);

const columns: ColumnSpecs = new Map([
	['name', { label: 'Organisation', icon: IconBuilding, width: 200 }],
	['code', { label: 'Identifiant', icon: IconHash, width: 120 }],
]);

describe('SortMenu', () => {
	test('offers the default order then each criterion both ways', () => {
		const onSort = vi.fn();
		render(
			<SortMenu
				sort={undefined}
				onSort={onSort}
				columns={columns}
				ids={['name', 'code']}
				defaultLabel="Ordre par défaut"
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'list-sort' }));
		expect(screen.getByText('Ordre par défaut')).toBeTruthy();
		expect(screen.getAllByText('Organisation').length).toBe(2);

		fireEvent.click(
			screen.getByRole('button', { name: 'Organisation · list-sort-asc' }),
		);
		expect(onSort).toHaveBeenCalledWith([{ id: 'name', desc: false }]);
	});

	test('names the current sort on the trigger', () => {
		render(
			<SortMenu
				sort={{ id: 'name', desc: true }}
				onSort={vi.fn()}
				columns={columns}
				ids={['name']}
				defaultLabel="Ordre par défaut"
			/>,
		);
		expect(screen.getByRole('button', { name: 'list-sorted-by' })).toBeTruthy();
	});
});
