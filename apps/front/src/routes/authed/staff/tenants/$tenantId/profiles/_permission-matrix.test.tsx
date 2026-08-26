/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from '@testing-library/react';
import { createElement, type ChangeEvent, useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const labels: TestLabelMap = {
				'filter-permissions': 'Filter permissions…',
				'clear-permissions-filter': 'Clear permission filter',
				'expand-all': 'Expand all',
				'collapse-all': 'Collapse all',
				'clear-all': 'Clear all',
				'permissions-selected-total': '{{selected}} of {{total}} selected',
				'toggle-all-module-permissions': 'Toggle all {{module}} permissions',
				'permission-changed-indicator': 'changed',
				'no-matching-permissions': 'No matching permissions.',
			};
			let text = labels[key.includes(':') ? key.split(':')[1] : key] ?? key;
			for (const [optionKey, value] of Object.entries(options ?? {})) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}
			return text;
		},
	}),
}));

vi.mock('~/components/ui/search-input', () => ({
	SearchInput: ({
		value,
		onValueChange,
		clearLabel: _clearLabel,
		...props
	}: {
		value: string;
		onValueChange: (value: string) => void;
		clearLabel?: string;
	}) =>
		createElement('input', {
			value,
			onChange: (event: ChangeEvent<HTMLInputElement>) =>
				onValueChange(event.target.value),
			...props,
		}),
}));

vi.mock('~/components/ui/checkbox', () => ({
	Checkbox: ({
		checked,
		indeterminate,
		onCheckedChange,
		...props
	}: {
		checked?: boolean;
		indeterminate?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}) =>
		createElement('input', {
			type: 'checkbox',
			checked: Boolean(checked),
			'data-indeterminate': indeterminate ? 'true' : undefined,
			onChange: (event: ChangeEvent<HTMLInputElement>) =>
				onCheckedChange?.(event.target.checked),
			...props,
		}),
}));

import { PermissionMatrix } from './_permission-matrix';

const GROUPS = [
	{
		moduleKey: 'posts',
		moduleLabel: 'Posts',
		options: [
			{ key: 'posts.view', label: 'View posts', description: null },
			{ key: 'posts.create', label: 'Create posts', description: null },
		],
	},
	{
		moduleKey: 'channels',
		moduleLabel: 'Channels',
		options: [
			{ key: 'channels.view', label: 'View channels', description: null },
		],
	},
];

const ControlledMatrix = () => {
	const [value, setValue] = useState(['posts.view']);
	return (
		<PermissionMatrix
			groups={GROUPS}
			value={value}
			baselineValue={['posts.view']}
			onChange={setValue}
		/>
	);
};

describe('PermissionMatrix', () => {
	afterEach(() => {
		cleanup();
	});

	test('derives totals from the catalog and controls module and clear-all selection', () => {
		render(<ControlledMatrix />);

		expect(screen.getByTestId('permissions-selected-total').textContent).toBe(
			'1 of 3 selected',
		);
		const postsModule = screen.getByTestId('permission-module-posts');
		const postsToggle = within(postsModule).getByRole('checkbox', {
			name: 'Toggle all Posts permissions',
		});
		expect(postsToggle.getAttribute('data-indeterminate')).toBe('true');

		fireEvent.click(postsToggle);
		expect(screen.getByTestId('permissions-selected-total').textContent).toBe(
			'2 of 3 selected',
		);
		fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
		expect(screen.getByTestId('permissions-selected-total').textContent).toBe(
			'0 of 3 selected',
		);
	});

	test('shows an explicit empty state when the filter excludes every permission', () => {
		render(<ControlledMatrix />);

		fireEvent.change(screen.getByTestId('permissions-filter'), {
			target: { value: 'does not exist' },
		});

		expect(screen.getByText('No matching permissions.')).toBeTruthy();
		expect(screen.queryByTestId('permission-module-posts')).toBeNull();
		expect(screen.queryByTestId('permission-module-channels')).toBeNull();
	});
});
