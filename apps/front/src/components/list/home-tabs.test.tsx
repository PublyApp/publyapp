/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { HomeTabs } from './home-tabs';

afterEach(cleanup);

const tabs = [
	{ key: 'all', label: 'Toutes', count: 11 },
	{ key: 'active', label: 'Actives', count: 8 },
];

describe('HomeTabs', () => {
	test('renders every tab with its count and marks the active one', () => {
		render(
			<HomeTabs
				tabs={tabs}
				current="all"
				label="Organisations"
				onPick={vi.fn()}
			/>,
		);

		expect(
			screen.getByRole('button', { name: /Toutes/ }).textContent,
		).toContain('11');
		const active = screen.getByRole('button', { name: /Actives/ });
		expect(active.textContent).toContain('8');
		expect(active.getAttribute('aria-current')).toBeNull();
		expect(
			screen
				.getByRole('button', { name: /Toutes/ })
				.getAttribute('aria-current'),
		).toBe('page');
	});

	test('reports a tab pick', () => {
		const onPick = vi.fn();
		render(
			<HomeTabs
				tabs={tabs}
				current="all"
				label="Organisations"
				onPick={onPick}
			/>,
		);
		fireEvent.click(screen.getByRole('button', { name: /Actives/ }));
		expect(onPick).toHaveBeenCalledWith('active');
	});
});
