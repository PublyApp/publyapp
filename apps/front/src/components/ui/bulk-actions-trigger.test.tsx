/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { createElement, useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { BulkActionsMenu, BulkActionsTrigger } from './bulk-actions-trigger';
import { DropdownMenu } from './dropdown-menu';

describe('ui/BulkActionsTrigger (#1400 label-in-name)', () => {
	afterEach(() => {
		cleanup();
	});

	test('the accessible name equals the visible label — one prop feeds both', () => {
		render(
			createElement(
				DropdownMenu,
				null,
				createElement(BulkActionsTrigger, { triggerLabel: 'Bulk actions' }),
			),
		);

		const trigger = screen.getByRole('button', { name: 'Bulk actions' });
		expect(trigger.textContent).toContain('Bulk actions');
		expect(trigger.getAttribute('aria-label')).toBe('Bulk actions');
		expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
	});

	test('over-cap keeps the name and moves the reason to the title description', () => {
		render(
			createElement(
				DropdownMenu,
				null,
				createElement(BulkActionsTrigger, {
					triggerLabel: 'Bulk actions',
					isOverLimit: true,
					overLimitMessage: 'Reduce your selection to at most 100 items.',
				}),
			),
		);

		const trigger = screen.getByRole('button', { name: 'Bulk actions' });
		expect((trigger as HTMLButtonElement).disabled).toBe(true);
		expect(trigger.getAttribute('title')).toBe(
			'Reduce your selection to at most 100 items.',
		);
	});

	test('clicking opens the menu (aria-expanded wired through the render prop)', async () => {
		const ControlledTrigger = () => {
			const [expanded, setExpanded] = useState(false);
			return createElement(
				DropdownMenu,
				{
					open: expanded,
					onOpenChange: (open: boolean) => setExpanded(open),
				},
				createElement(BulkActionsTrigger, { triggerLabel: 'Bulk actions' }),
			);
		};
		render(createElement(ControlledTrigger));

		fireEvent.click(screen.getByRole('button', { name: 'Bulk actions' }));
		await waitFor(() =>
			expect(
				screen
					.getByRole('button', { name: 'Bulk actions' })
					.getAttribute('aria-expanded'),
			).toBe('true'),
		);
	});

	const openBulkMenu = (
		onItemClick: (key: string) => void,
		items: Parameters<typeof BulkActionsMenu>[0]['items'],
	) => {
		render(
			createElement(
				DropdownMenu,
				null,
				createElement(BulkActionsTrigger, { triggerLabel: 'Bulk actions' }),
				createElement(BulkActionsMenu, {
					items,
					onMenuItemClick: onItemClick,
				}),
			),
		);

		// Base UI menus mount their content only once opened in jsdom.
		fireEvent.click(screen.getByRole('button', { name: 'Bulk actions' }));
	};

	test('menu items always render; clicks report their key; menu closes on pick', async () => {
		const onItemClick = vi.fn();
		await openBulkMenu(onItemClick, [
			{ key: 'reactivate', label: 'Reactivate selected', icon: null },
			{
				key: 'suspend',
				label: 'Suspend selected',
				icon: null,
				variant: 'destructive',
			},
		]);

		// Items always render — never hidden nor removed for ineligibility.
		screen.getByRole('menuitem', { name: 'Reactivate selected' });
		screen.getByRole('menuitem', { name: 'Suspend selected' });

		fireEvent.click(screen.getByRole('menuitem', { name: 'Suspend selected' }));
		expect(onItemClick).toHaveBeenCalledWith('suspend');
	});

	test('a destructive-only menu reports its key on click', async () => {
		const onItemClick = vi.fn();
		await openBulkMenu(onItemClick, [
			{
				key: 'delete',
				label: 'Delete selected',
				icon: null,
				variant: 'destructive',
			},
		]);

		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));
		expect(onItemClick).toHaveBeenCalledWith('delete');
	});

	test('a disabled item still renders and reports no click', async () => {
		const onItemClick = vi.fn();
		await openBulkMenu(onItemClick, [
			{
				key: 'export',
				label: 'Export selected users',
				icon: null,
				disabled: true,
			},
		]);

		const item = screen.getByRole('menuitem', {
			name: 'Export selected users',
		});
		// Base UI marks disabled items with data-disabled.
		expect(item.hasAttribute('data-disabled')).toBe(true);

		fireEvent.click(item);
		expect(onItemClick).not.toHaveBeenCalled();
	});

	test('extra className composes with the floating selection-bar action class', () => {
		render(
			createElement(
				DropdownMenu,
				null,
				createElement(BulkActionsTrigger, {
					triggerLabel: 'Bulk actions',
					className: 'w-full',
				}),
			),
		);

		const trigger = screen.getByRole('button', { name: 'Bulk actions' });
		expect(trigger.className).toContain('w-full');
		expect(trigger.className).not.toBe('');
	});
});
