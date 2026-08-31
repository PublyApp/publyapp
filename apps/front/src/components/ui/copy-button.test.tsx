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

type ClipboardExecutor = {
	resolve: (value?: unknown) => void;
	reject: (error: Error) => void;
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@org/shared-ts/lib/logger/iso-logger', () => ({
	logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const getStatusText = () => screen.getByRole('status').textContent?.trim();

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('CopyButton', () => {
	// W5-UI F3: the live region must stay silent on mount (the accessible name
	// already comes from `aria-label`), announce only the copy result, and go
	// silent again after the feedback window instead of re-announcing "copy".
	test('the live region is silent on mount, announces only the copy result, and goes silent again after reset', async () => {
		vi.useFakeTimers();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });

		render(<CopyButton value="secret" label="Copy" />);

		expect(getStatusText()).toBe('');

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(getStatusText()).toBe('copied');

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1500);
		});
		expect(getStatusText()).toBe('');
	});

	test('copies the value, updates the announceable status text, and flips the icon back after the feedback window', async () => {
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
		expect(getStatusText()).toBe('copied');

		await vi.advanceTimersByTimeAsync(1500);

		await vi.waitFor(() =>
			expect(container.querySelector('.tabler-icon-check')).toBeNull(),
		);
		expect(container.querySelector('.tabler-icon-copy')).not.toBeNull();
		// The idle label is already exposed via `aria-label`; the live region
		// goes silent after the feedback window instead of re-announcing it.
		expect(getStatusText()).toBe('');
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
		expect(getStatusText()).toBe('copied');

		await act(async () => {
			await vi.advanceTimersByTimeAsync(500);
		});
		expect(container.querySelector('.tabler-icon-check')).not.toBeNull();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000);
		});
		expect(container.querySelector('.tabler-icon-check')).toBeNull();
	});

	test('a rejected clipboard write does not throw, logs a warning, and flips the status text to failed', async () => {
		vi.useFakeTimers();
		const writeText = vi.fn().mockRejectedValue(new Error('denied'));
		Object.assign(navigator, { clipboard: { writeText } });
		const { logger } = await import('@org/shared-ts/lib/logger/iso-logger');
		const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

		const { container } = render(<CopyButton value="secret" label="Copy" />);
		const button = screen.getByRole('button', { name: 'Copy' });

		expect(() => {
			fireEvent.click(button);
		}).not.toThrow();

		await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
		await vi.waitFor(() => expect(warnSpy).toHaveBeenCalledTimes(1));
		await vi.waitFor(() =>
			expect(
				screen.getByRole('button', { name: 'Copy' }).getAttribute('data-state'),
			).toBe('failed'),
		);
		expect(warnSpy).toHaveBeenCalledWith('Failed to copy value to clipboard', {
			error: expect.any(Error),
		});
		expect(getStatusText()).toBe('copy-failed');

		// No re-hover: the icon flip is the only feedback surface once the
		// click that failed the copy is also the click that closes the
		// tooltip (Base UI's `closeOnClick`, disabled on this trigger).
		await vi.waitFor(() =>
			expect(
				container.querySelector('.tabler-icon-alert-triangle'),
			).not.toBeNull(),
		);
		expect(container.querySelector('.tabler-icon-copy')).toBeNull();
		expect(button.getAttribute('data-state')).toBe('failed');
	});

	test('the tooltip trigger never closes on click, so failure feedback stays visible', async () => {
		vi.useFakeTimers();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });

		render(<CopyButton value="secret" label="Copy" />);
		const button = screen.getByRole('button', { name: 'Copy' });

		await act(async () => {
			fireEvent.mouseEnter(button);
			fireEvent.focus(button);
			await vi.advanceTimersByTimeAsync(1000);
		});
		// Idle: the live region stays silent (the tooltip still visually shows
		// "copy" via TooltipContent, but that is not what is under test here).
		expect(screen.getByRole('status').textContent?.trim()).toBe('');

		await act(async () => {
			fireEvent.click(button);
			await Promise.resolve();
			await Promise.resolve();
		});

		await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
		expect(getStatusText()).toBe('copied');
	});

	test('clipboard being unavailable marks copy as failed', () => {
		Object.assign(navigator, { clipboard: undefined });

		render(<CopyButton value="secret" label="Copy" />);

		expect(() => {
			fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
		}).not.toThrow();

		expect(getStatusText()).toBe('copy-failed');
	});

	test('the latest copy request is always the one reflected in feedback state', async () => {
		vi.useFakeTimers();

		const first: ClipboardExecutor = {
			resolve: () => {},
			reject: (_error: Error) => {},
		};
		const second: ClipboardExecutor = {
			resolve: () => {},
			reject: (_error: Error) => {},
		};

		const createWriteText = () => {
			const writes = [first, second];
			return vi.fn().mockImplementation(
				() =>
					new Promise((resolve, reject) => {
						const write = writes.shift();
						if (write) {
							write.resolve = resolve;
							write.reject = reject;
						}
					}),
			);
		};

		const writeText = createWriteText();
		Object.assign(navigator, { clipboard: { writeText } });

		render(<CopyButton value="secret" label="Copy" />);
		const button = screen.getByRole('button', { name: 'Copy' });

		fireEvent.click(button);
		await act(async () => {
			await Promise.resolve();
		});

		fireEvent.click(button);
		await act(async () => {
			await Promise.resolve();
		});

		expect(writeText).toHaveBeenCalledTimes(2);

		await act(async () => {
			second.resolve();
			await Promise.resolve();
		});
		expect(getStatusText()).toBe('copied');

		await act(async () => {
			first.reject(new Error('stale'));
			await Promise.resolve();
		});
		expect(getStatusText()).toBe('copied');
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
