/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const noop = () => undefined;

const baseProps = {
	title: 'Delete user?',
	description: 'This action cannot be undone.',
	confirmLabel: 'Delete',
	onConfirm: noop,
	onOpenChange: noop,
};

afterEach(cleanup);

describe('ConfirmDialog', () => {
	test('can be mounted closed without requiring a route-level trigger', () => {
		expect(() =>
			render(<ConfirmDialog {...baseProps} isOpen={false} />),
		).not.toThrow();
	});

	test('renders destructive confirmations as an alertdialog', () => {
		render(<ConfirmDialog {...baseProps} isOpen />);

		expect(screen.getByRole('alertdialog')).toBeTruthy();
		expect(screen.getByText('Delete user?')).toBeTruthy();
		expect(screen.getByText('This action cannot be undone.')).toBeTruthy();
	});

	test('marks the popup as the confirmation surface with the destructive tone', () => {
		render(<ConfirmDialog {...baseProps} isOpen />);

		const popup = screen.getByRole('alertdialog');
		expect(popup.getAttribute('data-slot')).toBe('confirm-dialog');
		expect(popup.getAttribute('data-tone')).toBe('danger');
		expect(
			popup.querySelector('[data-slot="confirm-dialog-footer"]'),
		).not.toBeNull();
	});

	// F1: consumes the shared z-index tokens instead of hardcoded z-[70]/z-[71].
	test('the popup and backdrop use the shared z-index tokens, not hardcoded magic numbers', () => {
		render(<ConfirmDialog {...baseProps} isOpen />);

		const popup = screen.getByRole('alertdialog');
		expect(popup.className).toContain('z-(--publy-z-drawer-surface)');
		expect(popup.className).not.toMatch(/z-\[\d+\]/);

		const backdrop = document.querySelector('.publy-overlay-backdrop');
		expect(backdrop?.className).toContain('z-(--publy-z-overlay)');
		expect(backdrop?.className).not.toMatch(/z-\[\d+\]/);
	});

	test('renders the primary tone when requested', () => {
		render(<ConfirmDialog {...baseProps} isOpen tone="primary" />);

		expect(screen.getByRole('alertdialog').getAttribute('data-tone')).toBe(
			'primary',
		);
	});

	test('renders extra confirmation content (inset card, type-to-confirm) between body and footer', () => {
		render(
			<ConfirmDialog {...baseProps} isOpen>
				<div data-testid="type-to-confirm">type “delete” to confirm</div>
			</ConfirmDialog>,
		);

		const popup = screen.getByRole('alertdialog');
		const extra = screen.getByTestId('type-to-confirm');
		expect(popup.contains(extra)).toBe(true);
	});

	test('falls back to the translated cancel label when none is passed', () => {
		render(<ConfirmDialog {...baseProps} isOpen />);

		expect(screen.getByRole('button', { name: 'cancel' })).toBeTruthy();
	});

	test('clicking confirm invokes onConfirm', () => {
		const onConfirm = vi.fn();
		render(<ConfirmDialog {...baseProps} isOpen onConfirm={onConfirm} />);

		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	test('clicking cancel requests dismissal through onOpenChange', () => {
		const onOpenChange = vi.fn();
		render(<ConfirmDialog {...baseProps} isOpen onOpenChange={onOpenChange} />);

		fireEvent.click(screen.getByRole('button', { name: 'cancel' }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test('isPending disables both the cancel and confirm buttons', () => {
		render(<ConfirmDialog {...baseProps} isOpen isPending />);

		expect(
			screen.getByRole('button', { name: 'cancel' }).hasAttribute('disabled'),
		).toBe(true);
		expect(
			screen.getByRole('button', { name: 'Delete' }).hasAttribute('disabled'),
		).toBe(true);
	});

	test('isPending disables the header close button', () => {
		render(<ConfirmDialog {...baseProps} isOpen isPending />);

		expect(
			screen.getByRole('button', { name: 'close' }).hasAttribute('disabled'),
		).toBe(true);
	});

	// F2: Escape must not dismiss a pending confirm dialog — a mutation is in flight.
	test('pressing Escape while isPending does not call onOpenChange', () => {
		const onOpenChange = vi.fn();
		render(
			<ConfirmDialog
				{...baseProps}
				isOpen
				isPending
				onOpenChange={onOpenChange}
			/>,
		);

		fireEvent.keyDown(document, { key: 'Escape' });

		expect(onOpenChange).not.toHaveBeenCalled();
	});

	// F2: clicking the backdrop while isPending does not call onOpenChange.
	test('clicking the backdrop while isPending does not call onOpenChange', () => {
		const onOpenChange = vi.fn();
		render(
			<ConfirmDialog
				{...baseProps}
				isOpen
				isPending
				onOpenChange={onOpenChange}
			/>,
		);

		const backdrop = document.querySelector('.publy-overlay-backdrop');
		expect(backdrop).not.toBeNull();
		if (backdrop) {
			fireEvent.pointerDown(backdrop);
			fireEvent.pointerUp(backdrop);
			fireEvent.click(backdrop);
		}

		expect(onOpenChange).not.toHaveBeenCalled();
	});

	// F2: clicking the header ✕ while isPending does not call onOpenChange
	// (belt-and-suspenders on top of the `disabled` attribute).
	test('clicking the header close button while isPending does not call onOpenChange', () => {
		const onOpenChange = vi.fn();
		render(
			<ConfirmDialog
				{...baseProps}
				isOpen
				isPending
				onOpenChange={onOpenChange}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'close' }));

		expect(onOpenChange).not.toHaveBeenCalled();
	});

	test('isConfirmDisabled disables only the confirm button', () => {
		render(<ConfirmDialog {...baseProps} isOpen isConfirmDisabled />);

		expect(
			screen.getByRole('button', { name: 'cancel' }).hasAttribute('disabled'),
		).toBe(false);
		expect(
			screen.getByRole('button', { name: 'Delete' }).hasAttribute('disabled'),
		).toBe(true);
	});

	// W5-UI F1 integration case: the destructive confirm button is where the
	// finding's failure scenario actually happens (a keyboard user tabbing to
	// the "Delete" button in a real danger-zone flow). The Button `destructive`
	// variant must not reintroduce a low-opacity `ring-destructive` override
	// that clobbers the compliant base `ring-ring` through the real `cn()`
	// merge this component renders through.
	test('the destructive confirm button does not carry a low-opacity focus-visible ring override', () => {
		render(<ConfirmDialog {...baseProps} isOpen tone="danger" />);

		const confirmButton = screen.getByRole('button', { name: 'Delete' });
		expect(confirmButton.className).toContain('focus-visible:ring-ring');
		expect(confirmButton.className).not.toMatch(
			/focus-visible:ring-destructive/,
		);
	});
});
