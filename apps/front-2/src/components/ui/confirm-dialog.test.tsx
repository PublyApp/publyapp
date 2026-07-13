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

	test('isConfirmDisabled disables only the confirm button', () => {
		render(<ConfirmDialog {...baseProps} isOpen isConfirmDisabled />);

		expect(
			screen.getByRole('button', { name: 'cancel' }).hasAttribute('disabled'),
		).toBe(false);
		expect(
			screen.getByRole('button', { name: 'Delete' }).hasAttribute('disabled'),
		).toBe(true);
	});
});
