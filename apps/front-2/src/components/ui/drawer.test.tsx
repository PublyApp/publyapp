/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from './drawer';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const noop = () => undefined;

const renderDrawer = ({
	isOpen = true,
	onOpenChange = noop,
}: {
	isOpen?: boolean;
	onOpenChange?: (isOpen: boolean) => void;
} = {}) =>
	render(
		<Drawer open={isOpen} onOpenChange={onOpenChange}>
			<DrawerContent>
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

const renderControlledWithTrigger = ({
	onOpenChange,
}: {
	onOpenChange?: (isOpen: boolean) => void;
}) => {
	const ControlledDrawer = () => {
		const [isOpen, setIsOpen] = React.useState(false);

		return (
			<Drawer
				open={isOpen}
				onOpenChange={(next) => {
					setIsOpen(next);
					onOpenChange?.(next);
				}}
			>
				<DrawerTrigger render={<button type="button">Open drawer</button>} />
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Invite members</DrawerTitle>
						<DrawerDescription>
							Send invitations to teammates.
						</DrawerDescription>
					</DrawerHeader>
					<DrawerBody>
						<p>Drawer body content</p>
					</DrawerBody>
					<DrawerFooter>
						<button type="button">Send invites</button>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		);
	};

	return render(<ControlledDrawer />);
};

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
		expect(drawer.className).toContain('publy-drawer');

		expect(drawer.querySelector('[data-slot="drawer-header"]')).not.toBeNull();
		expect(drawer.querySelector('[data-slot="drawer-body"]')).not.toBeNull();
		expect(drawer.querySelector('[data-slot="drawer-footer"]')).not.toBeNull();
		expect(screen.getByText('Invite members')).toBeTruthy();
		expect(screen.getByText('Send invitations to teammates.')).toBeTruthy();
	});

	test('the drawer surface and backdrop use the shared z-index tokens, not hardcoded magic numbers', () => {
		renderDrawer();

		const drawer = screen.getByRole('dialog');
		expect(drawer.className).toContain('z-(--publy-z-drawer-surface)');
		expect(drawer.className).not.toMatch(/z-\[\d+\]/);

		const backdrop = document.querySelector('.publy-overlay-backdrop');
		expect(backdrop?.className).toContain('z-(--publy-z-overlay)');
		expect(backdrop?.className).not.toMatch(/z-\[\d+\]/);
	});

	test('header close button requests dismissal through onOpenChange', () => {
		const onOpenChange = vi.fn();
		renderDrawer({ onOpenChange });

		fireEvent.click(screen.getByRole('button', { name: 'close' }));

		expect(onOpenChange).toHaveBeenCalled();
		expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
		expect(onOpenChange.mock.calls[0]?.[1]).toBeDefined();
	});

	test('pressing Escape requests dismissal through onOpenChange', () => {
		const onOpenChange = vi.fn();
		render(
			<Drawer open={true} onOpenChange={onOpenChange}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Invite members</DrawerTitle>
						<DrawerDescription>
							Send invitations to teammates.
						</DrawerDescription>
					</DrawerHeader>
				</DrawerContent>
			</Drawer>,
		);

		fireEvent.keyDown(document, { key: 'Escape' });

		expect(onOpenChange).toHaveBeenCalledWith(false, expect.any(Object));
	});

	test('clicking backdrop requests dismissal through onOpenChange', () => {
		const onOpenChange = vi.fn();
		renderDrawer({ onOpenChange });

		const backdrop = document.querySelector('.publy-overlay-backdrop');
		expect(backdrop).not.toBeNull();
		if (backdrop) {
			fireEvent.pointerDown(backdrop);
			fireEvent.pointerUp(backdrop);
			fireEvent.click(backdrop);
		}

		expect(onOpenChange).toHaveBeenCalledWith(false, expect.any(Object));
	});

	test('focus returns to the opener after dismissal', async () => {
		renderControlledWithTrigger({});

		const openButton = screen.getByRole('button', { name: 'Open drawer' });
		fireEvent.click(openButton);

		const closeButton = await screen.findByRole('button', { name: 'close' });
		fireEvent.click(closeButton);

		expect(screen.getByRole('button', { name: 'Open drawer' })).toBeTruthy();
		expect(document.activeElement?.textContent).toBe(openButton.textContent);
	});
});
