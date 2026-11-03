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
});
