/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from './drawer';

const noop = () => undefined;

const renderDrawer = ({
	isOpen = true,
	size,
	onOpenChange = noop,
}: {
	isOpen?: boolean;
	size?: 'default' | 'filters';
	onOpenChange?: (isOpen: boolean) => void;
} = {}) =>
	render(
		<Drawer open={isOpen} onOpenChange={onOpenChange}>
			<DrawerContent size={size}>
				<DrawerHeader>
					<DrawerTitle>Invite members</DrawerTitle>
					<DrawerDescription>Send invitations to teammates.</DrawerDescription>
				</DrawerHeader>
				<DrawerBody>
					<p>Drawer body content</p>
				</DrawerBody>
				<DrawerFooter>
					<button type="button">Send invites</button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>,
	);

afterEach(cleanup);

describe('Drawer', () => {
	test('can be mounted closed without requiring a trigger', () => {
		expect(() => renderDrawer({ isOpen: false })).not.toThrow();
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	test('renders a right-side drawer dialog with header, body, and footer slots', () => {
		renderDrawer();

		const drawer = screen.getByRole('dialog');
		expect(drawer.getAttribute('data-slot')).toBe('drawer');
		expect(drawer.getAttribute('data-size')).toBe('default');
		expect(drawer.className).toContain('publy-drawer');

		expect(drawer.querySelector('[data-slot="drawer-header"]')).not.toBeNull();
		expect(drawer.querySelector('[data-slot="drawer-body"]')).not.toBeNull();
		expect(drawer.querySelector('[data-slot="drawer-footer"]')).not.toBeNull();
		expect(screen.getByText('Invite members')).toBeTruthy();
		expect(screen.getByText('Send invitations to teammates.')).toBeTruthy();
	});

	test('exposes the filters size on the drawer surface', () => {
		renderDrawer({ size: 'filters' });

		expect(screen.getByRole('dialog').getAttribute('data-size')).toBe(
			'filters',
		);
	});

	test('header close button requests dismissal through onOpenChange', () => {
		const onOpenChange = vi.fn();
		renderDrawer({ onOpenChange });

		fireEvent.click(screen.getByRole('button', { name: 'Close' }));

		expect(onOpenChange).toHaveBeenCalled();
		expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
	});
});
