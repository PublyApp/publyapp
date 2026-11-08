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

	test('a real figure — including a real zero — shows as given when the trend series is unavailable', () => {
		render(
			<StatCard
				testId="stat-zero"
				label="Membres"
				icon={<IconUsers />}
				value="0"
				unavailable
			/>,
		);

		expect(screen.getByText('0')).toBeTruthy();
		expect(screen.queryByText('—')).toBeNull();
	});

	test('without a figure it shows a muted « — »', () => {
		render(
			<StatCard
				testId="stat-empty"
				label="Membres"
				icon={<IconUsers />}
				unavailable
			/>,
		);

		expect(screen.getByText('—').className).toContain('text-muted-foreground');
	});

	test('the unavailable footer keeps the delta’s two-line height for the ghost spark', () => {
		const { container } = render(
			<StatCard
				testId="stat-ghost"
				label="Membres"
				icon={<IconUsers />}
				unavailable
				footer={
					<>
						<span>Pas encore de données</span>
						<svg aria-hidden="true" />
					</>
				}
			/>,
		);

		expect(screen.getByText('—')).toBeTruthy();
		expect(screen.getByText('Pas encore de données')).toBeTruthy();
		// `min-h-10` is the 40 px the coloured delta and its period occupy.
		expect(container.querySelector('.min-h-10')).toBeTruthy();
	});

	test('a real figure keeps that height without the ghost copy', () => {
		const { container } = render(
			<StatCard
				testId="stat-real"
				label="Membres"
				icon={<IconUsers />}
				value="31"
				footer={<span aria-hidden="true" className="block min-h-10" />}
			/>,
		);

		expect(screen.getByText('31')).toBeTruthy();
		expect(screen.queryByText('Pas encore de données')).toBeNull();
		expect(container.querySelector('.min-h-10')).toBeTruthy();
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

		// The footer keeps the prototype's 40 px band in both states; only the
		// ghost copy and the ghost sparkline differ.
		expect(container.querySelector('.min-h-10')).toBeTruthy();
		expect(screen.getByText('vs 30 jours précédents')).toBeTruthy();
	});
});
