/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
	vi,
} from 'vitest';

import { CodeSelect } from './code-select';

const setWidth = (width: number) =>
	Object.defineProperty(window, 'innerWidth', {
		configurable: true,
		value: width,
	});

beforeAll(() => {
	setWidth(400);
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

const PERIOD_LABELS = {
	'7d': '7 derniers jours',
	'30d': '30 derniers jours',
	all: 'Toutes les organisations',
} as const;

describe('CodeSelect (md and up)', () => {
	beforeAll(() => {
		setWidth(1024);
	});

	afterAll(() => {
		setWidth(400);
	});

	test('the trigger shows the translated label, never the raw code', () => {
		render(
			<CodeSelect
				value="30d"
				options={['7d', '30d', 'all'] as const}
				label={(code) => PERIOD_LABELS[code]}
				ariaLabel="Période"
				onChange={vi.fn()}
			/>,
		);

		const trigger = screen.getByRole('combobox', { name: 'Période' });
		expect(trigger.textContent).toContain('30 derniers jours');
		expect(trigger.textContent).not.toContain('30d');
	});
});
