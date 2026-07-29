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
import { afterEach, describe, expect, test } from 'vitest';

import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioItem,
	DropdownMenuRadioGroup,
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from './dropdown-menu';

afterEach(cleanup);

describe('DropdownMenuCheckboxItem', () => {
	test('showCheckbox renders a visible, always-present checkbox box at the row end', () => {
		render(
			<DropdownMenu defaultOpen modal={false}>
				<DropdownMenuContent>
					<DropdownMenuCheckboxItem checked showCheckbox closeOnClick={false}>
						Active
					</DropdownMenuCheckboxItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		const item = screen
			.getByText('Active')
			.closest('[role="menuitemcheckbox"]');
		const box = item?.querySelector(
			'[data-slot="dropdown-menu-checkbox-item-box"]',
		);
		expect(box).not.toBeNull();
		expect(box?.getAttribute('aria-hidden')).toBe('true');
		expect(box?.getAttribute('role')).toBe('checkbox');
		expect(box?.getAttribute('tabindex')).toBe('-1');
	});

	test('showCheckbox=false renders only the checked-only indicator, no visible box', () => {
		render(
			<DropdownMenu defaultOpen modal={false}>
				<DropdownMenuContent>
					<DropdownMenuCheckboxItem checked closeOnClick>
						All
					</DropdownMenuCheckboxItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		const item = screen.getByText('All').closest('[role="menuitemcheckbox"]');
		expect(
			item?.querySelector('[data-slot="dropdown-menu-checkbox-item-box"]'),
		).toBeNull();
		expect(
			item?.querySelector(
				'[data-slot="dropdown-menu-checkbox-item-indicator"]',
			),
		).not.toBeNull();
	});
});

describe('DropdownMenuContent', () => {
	// F1: consumes the shared --publy-z-menu token instead of a hardcoded
	// z-50 that loses to a Drawer's z-[71] surface opened around it.
	test('the popup uses the shared z-index token, not a hardcoded magic number', () => {
		render(
			<DropdownMenu defaultOpen modal={false}>
				<DropdownMenuContent>
					<DropdownMenuItem>Edit</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		const popup = screen
			.getByText('Edit')
			.closest('[data-slot="dropdown-menu-content"]');
		expect(popup?.className).toContain('z-(--publy-z-menu)');
		expect(popup?.className).not.toMatch(/\bz-50\b/);
	});
});

describe('DropdownMenuItem', () => {
	// r3 F9: pinned to the shared --publy-radius-menu-item token reference
	// rather than the literal `9px`, so a future rename/retune of the token
	// can't silently drift this assertion out of sync with the real value.
	test('uses the shared menu-item radius token and a muted (not accent) highlighted background', () => {
		render(
			<DropdownMenu defaultOpen modal={false}>
				<DropdownMenuContent>
					<DropdownMenuItem>Edit</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		const item = screen
			.getByText('Edit')
			.closest('[data-slot="dropdown-menu-item"]');
		expect(item?.className).toContain(
			'rounded-[var(--publy-radius-menu-item)]',
		);
		expect(item?.className).not.toMatch(/rounded-\[9px\]/);
		expect(item?.className).toContain('data-highlighted:bg-muted');
		expect(item?.className).not.toContain('data-highlighted:bg-accent');
	});

	test('keeps destructive rows on muted focus/highlight surfaces', () => {
		render(
			<DropdownMenu defaultOpen modal={false}>
				<DropdownMenuContent>
					<DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		const item = screen
			.getByText('Delete')
			.closest('[data-slot="dropdown-menu-item"]');
		expect(item?.className).toContain('focus:bg-muted');
		expect(item?.className).toContain('data-highlighted:bg-muted');
		expect(item?.className).not.toContain('focus:bg-destructive');
		expect(item?.className).not.toContain('data-highlighted:bg-destructive');
		expect(item?.getAttribute('data-variant')).toBe('destructive');
	});

	test('renders submenu triggers and radio items with shared menu-item treatment', async () => {
		render(
			<DropdownMenu modal={false}>
				<DropdownMenuTrigger>Menu</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuSub open>
						<DropdownMenuSubTrigger
							data-testid="menu-sub-trigger"
							openOnHover={false}
						>
							More
						</DropdownMenuSubTrigger>
						<DropdownMenuPortal>
							<DropdownMenuSubContent>
								<DropdownMenuRadioGroup>
									<DropdownMenuRadioItem value="read">
										Read
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="write">
										Write
									</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
							</DropdownMenuSubContent>
						</DropdownMenuPortal>
					</DropdownMenuSub>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
		await waitFor(() =>
			expect(screen.getByTestId('menu-sub-trigger')).toBeTruthy(),
		);

		const trigger = screen.getByTestId('menu-sub-trigger');
		expect(trigger).not.toBeNull();
		fireEvent.click(trigger);

		const read = await screen.findByRole('menuitemradio', { name: 'Read' });
		const write = await screen.findByRole('menuitemradio', { name: 'Write' });

		expect(
			read.closest('[data-slot="dropdown-menu-radio-item"]'),
		).not.toBeNull();
		expect(
			write.closest('[data-slot="dropdown-menu-radio-item"]'),
		).not.toBeNull();
	});
});
