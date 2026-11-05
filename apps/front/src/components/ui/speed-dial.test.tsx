/**
 * @vitest-environment jsdom
 */
import { IconDownload, IconPlus } from '@tabler/icons-react';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import en from '~/i18n/locales/en';
import fr from '~/i18n/locales/fr';

import { SpeedDial, type SpeedDialAction } from './speed-dial';

afterEach(cleanup);

const multiActions = (
	label: string,
	onSelect: () => void,
): SpeedDialAction[] => [
	{ id: 'export', label: 'Export', icon: IconDownload, onSelect: vi.fn() },
	{ id: 'create', label, icon: IconPlus, onSelect },
];

describe('SpeedDial', () => {
	test('runs a single action directly, with no disclosure', () => {
		const onSelect = vi.fn();
		render(
			<SpeedDial
				label="Actions"
				actions={[
					{
						id: 'create',
						label: 'Create profile',
						icon: IconPlus,
						onSelect,
					},
				]}
			/>,
		);

		const fab = screen.getByRole('button', { name: 'Create profile' });
		expect(fab.getAttribute('aria-expanded')).toBeNull();
		fireEvent.click(fab);
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	test('opens the actions, Escape closes and refocuses the button', () => {
		render(
			<SpeedDial label="Actions" actions={multiActions('Create', vi.fn())} />,
		);

		const fab = screen.getByRole('button', { name: 'Actions' });
		fireEvent.click(fab);

		expect(fab.getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();

		fireEvent.keyDown(window, { key: 'Escape' });

		expect(fab.getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(fab);
	});

	test('runs the chosen action exactly once, after the exit', async () => {
		const onSelect = vi.fn();
		render(
			<SpeedDial label="Actions" actions={multiActions('Create', onSelect)} />,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
		fireEvent.click(screen.getByRole('button', { name: 'Create' }));

		await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
		// The action runs from the exit timer, never twice.
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	test('renders no floating button without an action', () => {
		render(<SpeedDial label="Actions" actions={[]} />);

		expect(screen.queryByRole('button')).toBeNull();
	});

	test('the multi-action label is translated in FR and EN', () => {
		expect(en.common.actions).toBe('Actions');
		expect(fr.common.actions).toBe('Actions');
	});
});
