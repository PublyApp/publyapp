/**
 * @vitest-environment jsdom
 */
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from '@testing-library/react';
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

		const { container } = render(<CopyButton value="secret" label="Copy" />);

		fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

		await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('secret'));
		await vi.waitFor(() =>
			expect(container.querySelector('.tabler-icon-check')).not.toBeNull(),
		);
		expect(container.querySelector('.tabler-icon-copy')).toBeNull();

		await vi.advanceTimersByTimeAsync(1500);

		await vi.waitFor(() =>
			expect(container.querySelector('.tabler-icon-check')).toBeNull(),
		);
		expect(container.querySelector('.tabler-icon-copy')).not.toBeNull();
	});

	test('a second click before the feedback window elapses re-arms the timer instead of stacking it', async () => {
		vi.useFakeTimers();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });

		const { container } = render(<CopyButton value="secret" label="Copy" />);
		const button = screen.getByRole('button', { name: 'Copy' });

		// Mixing `vi.waitFor` (which polls on real timers) with fake-timer
		// advances between them is unreliable, so every step below is a
		// direct `act()` around either a promise flush or a clock advance.
		await act(async () => {
			fireEvent.click(button);
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(container.querySelector('.tabler-icon-check')).not.toBeNull();

		// Second click at t=1000ms, 500ms before the first timer (t=1500ms)
		// would have fired. Without the `clearTimeout` re-arm, that stale
		// timer still fires at t=1500ms and flips the icon back early, even
		// though the second copy is still within its own feedback window.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000);
		});
		await act(async () => {
			fireEvent.click(button);
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(writeText).toHaveBeenCalledTimes(2);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(500);
		});
		expect(container.querySelector('.tabler-icon-check')).not.toBeNull();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000);
		});
		expect(container.querySelector('.tabler-icon-check')).toBeNull();
	});

	test('a rejected clipboard write does not throw, logs a warning, and surfaces a failure tooltip', async () => {
		vi.useFakeTimers();
		const writeText = vi.fn().mockRejectedValue(new Error('denied'));
		Object.assign(navigator, { clipboard: { writeText } });
		const { logger } = await import('@org/shared-ts/lib/logger/iso-logger');

		render(<CopyButton value="secret" label="Copy" />);
		const button = screen.getByRole('button', { name: 'Copy' });

		expect(() => {
			fireEvent.click(button);
		}).not.toThrow();

		await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
		await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));
		expect(logger.warn).toHaveBeenCalledWith(
			'Failed to copy value to clipboard',
			{ error: expect.any(Error) },
		);

		fireEvent.mouseEnter(button);
		fireEvent.focus(button);
		await vi.advanceTimersByTimeAsync(1000);

		await vi.waitFor(() =>
			expect(screen.getByText('copy-failed')).toBeTruthy(),
		);
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
