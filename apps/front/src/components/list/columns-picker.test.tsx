/**
 * @vitest-environment jsdom
 */
import { IconBuilding, IconHash, IconMail } from '@tabler/icons-react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let text = key;
			for (const [name, value] of Object.entries(options ?? {})) {
				text = text.replaceAll(`{{${name}}}`, String(value));
			}
			return text;
		},
	}),
}));

import { ColumnsPicker } from './columns-picker';
import type { ColumnSpecs } from './list-types';

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
	['email', { label: 'E-mail', icon: IconMail, width: 160 }],
]);

describe('ColumnsPicker', () => {
	test('lists shown and hidden columns, with the pinned one disabled', () => {
		render(
			<ColumnsPicker
				shown={['name', 'code']}
				onChange={vi.fn()}
				onReset={vi.fn()}
				columns={columns}
				locked="name"
				isDefault
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: /list-columns/ }));
		expect(screen.getByText('list-columns-hidden')).toBeTruthy();
		const pinned = screen.getByRole('checkbox', { name: 'Organisation' });
		expect(
			(pinned as HTMLButtonElement).disabled ||
				pinned.getAttribute('aria-disabled') === 'true' ||
				pinned.hasAttribute('data-disabled'),
		).toBe(true);
		expect(
			screen.getByRole('button', { name: /list-columns-reset/ }),
		).toHaveProperty('disabled', true);
	});

	test('hides a shown column and shows a hidden one', () => {
		const onChange = vi.fn();
		render(
			<ColumnsPicker
				shown={['name', 'code']}
				onChange={onChange}
				onReset={vi.fn()}
				columns={columns}
				locked="name"
				isDefault={false}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: /list-columns/ }));
		fireEvent.click(screen.getByRole('checkbox', { name: 'Identifiant' }));
		expect(onChange).toHaveBeenCalledWith(['name']);

		fireEvent.click(screen.getByRole('button', { name: /E-mail/ }));
		expect(onChange).toHaveBeenCalledWith(['name', 'code', 'email']);
	});
});
