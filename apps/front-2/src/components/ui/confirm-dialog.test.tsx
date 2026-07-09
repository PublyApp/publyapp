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
});
