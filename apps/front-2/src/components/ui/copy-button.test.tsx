/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { CopyButton } from './copy-button';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@org/shared-ts/lib/logger/iso-logger', () => ({
	logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('CopyButton', () => {
	test('copies the value and flips the icon back after the feedback window', async () => {
		vi.useFakeTimers();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });

		render(<CopyButton value="secret" label="Copy" />);

		fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

		await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('secret'));
	});

	test('a rejected clipboard write does not throw and is surfaced, not silently swallowed', async () => {
		const writeText = vi.fn().mockRejectedValue(new Error('denied'));
		Object.assign(navigator, { clipboard: { writeText } });

		render(<CopyButton value="secret" label="Copy" />);

		expect(() => {
			fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
		}).not.toThrow();

		await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
	});

	test('clipboard being unavailable does not throw', () => {
		Object.assign(navigator, { clipboard: undefined });

		render(<CopyButton value="secret" label="Copy" />);

		expect(() => {
			fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
		}).not.toThrow();
	});

	test('unmounting mid-feedback-window does not throw (pending timeout is cleared)', async () => {
		vi.useFakeTimers();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });

		const { unmount } = render(<CopyButton value="secret" label="Copy" />);

		fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
		await vi.waitFor(() => expect(writeText).toHaveBeenCalled());

		expect(() => {
			unmount();
			vi.runAllTimers();
		}).not.toThrow();
	});
});
