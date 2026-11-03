/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Collapse } from './collapse';

afterEach(cleanup);

describe('Collapse', () => {
	test('an open collapse exposes its content', () => {
		render(
			<Collapse open>
				<button type="button">Contenu</button>
			</Collapse>,
		);

		const wrapper = screen
			.getByRole('button', { name: 'Contenu' })
			.closest('[data-collapse]');
		expect(wrapper?.getAttribute('data-open')).toBe('true');
		expect(wrapper?.hasAttribute('inert')).toBe(false);
	});

	test('a closed collapse is inert and hidden from assistive tech', () => {
		render(
			<Collapse open={false}>
				<button type="button">Contenu</button>
			</Collapse>,
		);

		const wrapper = screen
			.getByRole('button', { hidden: true })
			.closest('[data-collapse]');
		expect(wrapper?.getAttribute('data-open')).toBeNull();
		expect(wrapper?.getAttribute('aria-hidden')).toBe('true');
		expect(wrapper?.hasAttribute('inert')).toBe(true);
	});
});
