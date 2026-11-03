/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

import { CodeSelect } from './code-select';

beforeAll(() => {
	Object.defineProperty(window, 'innerWidth', {
		configurable: true,
		value: 400,
	});
});

afterEach(cleanup);

describe('CodeSelect (below md)', () => {
	test('opens a bottom sheet of options and reports a pick', () => {
		const onChange = vi.fn();
		render(
			<CodeSelect
				value="fr"
				options={['fr', 'en'] as const}
				label={(code) => (code === 'fr' ? 'Français' : 'English')}
				ariaLabel="Langue"
				onChange={onChange}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Langue' }));
		expect(screen.getByRole('dialog', { name: 'Langue' })).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'English' }));
		expect(onChange).toHaveBeenCalledWith('en');
	});

	test('disabled prevents opening', () => {
		render(
			<CodeSelect
				value="fr"
				options={['fr', 'en'] as const}
				label={(code) => code}
				ariaLabel="Langue"
				onChange={vi.fn()}
				disabled
			/>,
		);
		const trigger = screen.getByRole('button', { name: 'Langue' });
		expect((trigger as HTMLButtonElement).disabled).toBe(true);
	});
});
