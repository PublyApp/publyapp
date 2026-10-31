/**
 * @vitest-environment jsdom
 */
import { IconBuilding } from '@tabler/icons-react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { SectionCard, SectionCardLink } from './section-card';

afterEach(cleanup);

describe('SectionCard', () => {
	test('renders the uppercase label row, action and inner block', () => {
		render(
			<SectionCard
				label="Aperçu"
				icon={<IconBuilding />}
				action={<button type="button">Voir tout</button>}
			>
				<p>Contenu</p>
			</SectionCard>,
		);

		expect(screen.getByText('Aperçu')).toBeTruthy();
		expect(screen.getByText('Contenu')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Voir tout' })).toBeTruthy();
	});

	test('SectionCardLink calls its handler', () => {
		const onClick = vi.fn();
		render(<SectionCardLink onClick={onClick}>Voir tout</SectionCardLink>);
		fireEvent.click(screen.getByRole('button', { name: 'Voir tout' }));
		expect(onClick).toHaveBeenCalledTimes(1);
	});
});
