/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ListCard, ListCards } from './list-card';

afterEach(cleanup);

describe('ListCard', () => {
	test('renders the header, title and foot and opens the row', () => {
		const onOpen = vi.fn();
		render(
			<ListCard
				onOpen={onOpen}
				openLabel="Ouvrir Acme"
				code="42"
				end="24/10"
				title="Acme"
				sub="12 membres"
			>
				<span>4 projets</span>
			</ListCard>,
		);

		expect(screen.getByText('42')).toBeTruthy();
		expect(screen.getByText('Acme')).toBeTruthy();
		expect(screen.getByText('12 membres')).toBeTruthy();
		fireEvent.click(screen.getByRole('link', { name: 'Ouvrir Acme' }));
		expect(onOpen).toHaveBeenCalledTimes(1);
	});

	test('shows the e-mail once when the code repeats the sub line', () => {
		render(
			<ListCard
				onOpen={vi.fn()}
				openLabel="Ouvrir Demo Staff 6"
				code="demo.staff6@example.com"
				title="Demo Staff 6"
				sub="demo.staff6@example.com"
			/>,
		);

		expect(screen.getAllByText('demo.staff6@example.com')).toHaveLength(1);
	});

	test('renders a card with no code', () => {
		render(
			<ListCard
				onOpen={vi.fn()}
				openLabel="Ouvrir Demo Staff 6"
				title="Demo Staff 6"
				sub="demo.staff6@example.com"
			/>,
		);

		expect(screen.getByText('Demo Staff 6')).toBeTruthy();
		expect(screen.getByText('demo.staff6@example.com')).toBeTruthy();
	});

	test('ListCards shows the empty content without rows', () => {
		render(
			<ListCards count={0} empty={<p>Aucune organisation</p>}>
				{null}
			</ListCards>,
		);
		expect(screen.getByText('Aucune organisation')).toBeTruthy();
	});
});
