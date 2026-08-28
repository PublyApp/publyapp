/**
 * @vitest-environment jsdom
 */
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	action: {
		status: 'idle' as 'idle' | 'blocked',
		proceed: vi.fn(),
		reset: vi.fn(),
	},
	capturedShouldBlockFn: undefined as (() => boolean) | undefined,
	capturedOnDirtyChange: undefined as ((isDirty: boolean) => void) | undefined,
}));

vi.mock('@tanstack/react-router', () => ({
	useBlocker: (options: { shouldBlockFn: () => boolean }) => {
		mocks.capturedShouldBlockFn = options.shouldBlockFn;
		return mocks.action;
	},
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				'unsaved-changes-dialog-title': 'Leave without saving?',
				'unsaved-changes-dialog-description':
					'You have unsaved changes that will be lost if you leave this page.',
				'leave-page': 'Leave page',
			})[key] ?? key,
	}),
}));

vi.mock('./_invite-user-drawer', () => ({
	InviteTenantUserDrawer: ({
		isOpen,
		onOpenChange,
		onInvited,
		onDirtyChange,
	}: {
		isOpen: boolean;
		onOpenChange: (isOpen: boolean) => void;
		onInvited: () => void;
		onDirtyChange?: (isDirty: boolean) => void;
	}) => {
		mocks.capturedOnDirtyChange = onDirtyChange;

		if (!isOpen) {
			return null;
		}

		return createElement(
			'div',
			{ 'data-testid': 'invite-drawer-open' },
			createElement(
				'button',
				{ type: 'button', onClick: () => onOpenChange(false) },
				'close',
			),
			createElement(
				'button',
				{ type: 'button', onClick: () => onInvited() },
				'invite',
			),
			createElement(
				'button',
				{ type: 'button', onClick: () => onDirtyChange?.(true) },
				'dirty',
			),
			createElement(
				'button',
				{ type: 'button', onClick: () => onDirtyChange?.(false) },
				'clean',
			),
		);
	},
}));

vi.mock('~/components/ui/confirm-dialog', () => ({
	ConfirmDialog: ({
		isOpen,
		onOpenChange,
		onConfirm,
	}: {
		isOpen: boolean;
		onOpenChange: (isOpen: boolean) => void;
		onConfirm: () => void;
	}) => {
		if (isOpen) {
			return createElement(
				'div',
				{ role: 'alertdialog' },
				createElement('button', { onClick: onConfirm }, 'Leave page'),
				createElement(
					'button',
					{ onClick: () => onOpenChange(false) },
					'close',
				),
			);
		}
		return null;
	},
}));

import { InviteTenantUserDrawerHost } from './_invite-user-drawer-host';

describe('InviteTenantUserDrawerHost', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.action = {
			status: 'idle',
			proceed: vi.fn(),
			reset: vi.fn(),
		};
		mocks.capturedShouldBlockFn = undefined;
		mocks.capturedOnDirtyChange = undefined;
	});

	afterEach(() => {
		cleanup();
	});

	test('opens the nested drawer when isOpen is true and keeps close logic unblocked', () => {
		render(
			<InviteTenantUserDrawerHost
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect(screen.getByTestId('invite-drawer-open')).toBeTruthy();
		expect(mocks.capturedShouldBlockFn?.()).toBe(false);
	});

	test('does not block when drawer is closed', () => {
		render(
			<InviteTenantUserDrawerHost
				tenantId="tenant-1"
				isOpen={false}
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect(mocks.capturedShouldBlockFn?.()).toBe(false);
		act(() => mocks.capturedOnDirtyChange?.(true));
		expect(mocks.capturedShouldBlockFn?.()).toBe(false);
	});

	test('blocks and unblocks navigation while open based on dirty state', () => {
		const { rerender } = render(
			<InviteTenantUserDrawerHost
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect(mocks.capturedShouldBlockFn?.()).toBe(false);
		act(() => mocks.capturedOnDirtyChange?.(true));
		expect(mocks.capturedShouldBlockFn?.()).toBe(true);
		act(() => mocks.capturedOnDirtyChange?.(false));
		expect(mocks.capturedShouldBlockFn?.()).toBe(false);

		rerender(
			<InviteTenantUserDrawerHost
				tenantId="tenant-1"
				isOpen={false}
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);
		expect(mocks.capturedShouldBlockFn?.()).toBe(false);
	});

	test('continues navigation after blocked discard confirmation', () => {
		mocks.action.status = 'blocked';
		render(
			<InviteTenantUserDrawerHost
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect(screen.getByRole('alertdialog')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));
		expect(mocks.action.proceed).toHaveBeenCalled();
		expect(mocks.action.reset).not.toHaveBeenCalled();
	});

	test('resets blocker state when discard dialog is dismissed', () => {
		mocks.action.status = 'blocked';
		render(
			<InviteTenantUserDrawerHost
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		const confirmDialog = screen.getByRole('alertdialog');
		fireEvent.click(
			within(confirmDialog).getByRole('button', { name: 'close' }),
		);
		expect(mocks.action.reset).toHaveBeenCalled();
	});

	test('runs invited callback after close-state callback when drawer reports invite success', () => {
		const order: string[] = [];
		const onOpenChange = (isOpen: boolean) => {
			order.push(`open:${isOpen}`);
		};
		const onInvited = () => {
			order.push('invited');
		};

		render(
			<InviteTenantUserDrawerHost
				tenantId="tenant-1"
				isOpen
				onOpenChange={onOpenChange}
				onInvited={onInvited}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'invite' }));
		expect(order).toEqual(['open:false', 'invited']);
	});

	test('re-arms nav bypass for route-controlled reopen after a guarded close', () => {
		const onOpenChange = vi.fn();
		const { rerender } = render(
			<InviteTenantUserDrawerHost
				tenantId="tenant-1"
				isOpen
				onOpenChange={onOpenChange}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect(mocks.capturedShouldBlockFn?.()).toBe(false);

		act(() => mocks.capturedOnDirtyChange?.(true));
		expect(mocks.capturedShouldBlockFn?.()).toBe(true);

		fireEvent.click(screen.getByRole('button', { name: 'close' }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
		// Close transition keeps the bypass active in this render frame.
		expect(mocks.capturedShouldBlockFn?.()).toBe(false);

		rerender(
			<InviteTenantUserDrawerHost
				tenantId="tenant-1"
				isOpen={false}
				onOpenChange={onOpenChange}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);
		expect(mocks.capturedShouldBlockFn?.()).toBe(false);

		rerender(
			<InviteTenantUserDrawerHost
				tenantId="tenant-1"
				isOpen
				onOpenChange={onOpenChange}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);
		expect(mocks.capturedShouldBlockFn?.()).toBe(true);
	});

	test('delegates close to host and does not mutate blocker state for pristine close', () => {
		const onOpenChange = vi.fn();
		render(
			<InviteTenantUserDrawerHost
				tenantId="tenant-1"
				isOpen
				onOpenChange={onOpenChange}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'close' }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(mocks.action.status).toBe('idle');
	});
});
