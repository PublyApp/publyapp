/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';

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
});
