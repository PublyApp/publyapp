/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

import { TENANT_PROFILE_ICON_NAMES } from '@org/shared-ts/lib/profile-style/tenant-profile-icons';

import { IconColorPicker } from './icon-color-picker';
import { ICON_COLOR_PICKER_OPTIONS } from './icon-color-picker-options';

const translations: TestLabelMap = {
	'choose-icon-and-color': 'Choose icon and color',
	'choose-icon': 'Choose icon',
	'choose-color': 'Choose color',
	'choose-profile-tone': 'Choose {{color}}',
	'profile-tone-2': 'Rose',
	'profile-tone-4': 'Violet',
	'profile-icon-search': 'Search icons',
	'profile-icon-search-placeholder': 'Search icons…',
	'clear-profile-icon-search': 'Clear icon search',
	'profile-icon-shield-check': 'Shield check',
	'profile-icon-briefcase': 'Briefcase',
	'profile-icon-calendar': 'Calendar',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const translation = translations[key] ?? key;
			const color = typeof options?.color === 'string' ? options.color : '';
			return translation.replace('{{color}}', color);
		},
	}),
}));

describe('IconColorPicker', () => {
	afterEach(() => {
		cleanup();
	});

	test('exposes every icon from the shared API catalog exactly once', () => {
		expect(ICON_COLOR_PICKER_OPTIONS.map((option) => option.name)).toEqual(
			TENANT_PROFILE_ICON_NAMES,
		);
	});

	test('opens the popover and emits the selected tone with the current icon', () => {
		const onChange = vi.fn();
		render(
			<IconColorPicker
				value={{ icon: 'shield-check', tone: '2' }}
				onChange={onChange}
			/>,
		);

		fireEvent.click(
			screen.getByRole('button', { name: 'Choose icon and color' }),
		);

		expect(screen.getByText('Choose color')).toBeTruthy();
		expect(screen.getByText('Choose icon')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Choose Violet' }));

		expect(onChange).toHaveBeenLastCalledWith({
			icon: 'shield-check',
			tone: '4',
		});
	});

	test('emits the selected icon with the current tone', () => {
		const onChange = vi.fn();
		render(
			<IconColorPicker
				value={{ icon: 'shield-check', tone: '2' }}
				onChange={onChange}
			/>,
		);

		fireEvent.click(
			screen.getByRole('button', { name: 'Choose icon and color' }),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Briefcase' }));

		expect(onChange).toHaveBeenLastCalledWith({
			icon: 'briefcase',
			tone: '2',
		});
	});

	// #992: the tile gave no sign it opens a picker. This asserts the real
	// rendered pin — decorative only, so it must not add a second interactive
	// element or a second accessible name to the trigger.
	test('renders a decorative pencil pin on the tile, without altering its accessible name or adding a nested interactive element', () => {
		render(
			<IconColorPicker
				value={{ icon: 'shield-check', tone: '2' }}
				onChange={vi.fn()}
			/>,
		);

		const trigger = screen.getByRole('button', {
			name: 'Choose icon and color',
		});
		const pin = trigger.querySelector(
			'[data-testid="profile-icon-picker-pin"]',
		);
		expect(pin).not.toBeNull();
		expect(pin?.getAttribute('aria-hidden')).toBe('true');
		expect(pin?.className).toContain('pointer-events-none');
		// A nested <button> would be invalid HTML and would swallow the click —
		// the pin must be a plain, non-interactive element.
		expect(trigger.querySelectorAll('button').length).toBe(0);
	});

	test('filters the curated icon grid by localized icon name', () => {
		render(
			<IconColorPicker
				value={{ icon: 'shield-check', tone: '2' }}
				onChange={vi.fn()}
			/>,
		);

		fireEvent.click(
			screen.getByRole('button', { name: 'Choose icon and color' }),
		);
		fireEvent.change(screen.getByRole('searchbox', { name: 'Search icons' }), {
			target: { value: 'brief' },
		});

		expect(screen.getByRole('button', { name: 'Briefcase' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Shield check' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Calendar' })).toBeNull();
	});
});
