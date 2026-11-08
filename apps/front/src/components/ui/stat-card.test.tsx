/**
 * @vitest-environment jsdom
 */
import { IconUsers } from '@tabler/icons-react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { StatCard } from './stat-card';

afterEach(cleanup);

describe('StatCard', () => {
	test('renders the label, figure, unit and footer on the shared shell', () => {
		render(
			<StatCard
				testId="stat-members"
				label="Membres"
				icon={<IconUsers />}
				value={109}
				unit="/ 205"
				footer={<span>53 % des places occupées</span>}
			/>,
		);

		const card = screen.getByTestId('stat-members');
		expect(card.textContent).toContain('Membres');
		expect(card.textContent).toContain('109');
		expect(card.textContent).toContain('/ 205');
		expect(card.textContent).toContain('53 % des places occupées');
		expect(card.className).toContain('@container');
	});

	test('keeps the historical children/secondary slots (detail pages)', () => {
		render(
			<StatCard
				testId="stat-legacy"
				label="Membres"
				icon={<IconUsers />}
				secondary={<span>12 restantes</span>}
			>
				12 <span className="publy-stat-card-value-suffix">/ 50</span>
			</StatCard>,
		);

		const card = screen.getByTestId('stat-legacy');
		expect(card.textContent).toContain('/ 50');
		expect(card.textContent).toContain('12 restantes');
	});

	test('the shared footer stays an inline block, so list footers keep their « · » (A-3)', () => {
		render(
			<StatCard
				testId="stat-list"
				label="Membres"
				icon={<IconUsers />}
				value={12}
				footer={
					<>
						<span>12 actifs</span> · 3 suspendus
					</>
				}
			/>,
		);

		const footer = screen.getByText('12 actifs').parentElement;
		expect(footer?.className).not.toContain('flex');
		expect(footer?.textContent).toContain('12 actifs · 3 suspendus');
	});

	test('a card with its trend series keeps the plain footer', () => {
		const { container } = render(
			<StatCard
				testId="stat-plain"
				label="Membres"
				icon={<IconUsers />}
				value="31"
				footer="vs 30 jours précédents"
			/>,
		);

		expect(screen.getByText('vs 30 jours précédents')).toBeTruthy();
		expect(container.querySelector('.min-h-10')).toBeNull();
	});
});
