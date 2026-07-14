/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('Tooltip', () => {
	test('renders the trigger and, once opened, the content', async () => {
		vi.useFakeTimers();
		render(
			<Tooltip>
				<TooltipTrigger render={<Button>Trigger</Button>} />
				<TooltipContent>Hello</TooltipContent>
			</Tooltip>,
		);

		const trigger = screen.getByRole('button', { name: 'Trigger' });
		expect(screen.queryByText('Hello')).toBeNull();

		fireEvent.mouseEnter(trigger);
		fireEvent.focus(trigger);
		await vi.advanceTimersByTimeAsync(1000);

		expect(screen.queryByText('Hello')).toBeTruthy();
	});

	// r3 F1: every tooltip in this app is informational, not a press-to-dismiss
	// popover — regression guard for the CopyButton defect, where the click
	// that failed a copy was also the click that closed the tooltip carrying
	// the only failure feedback. `closeOnClick` must default to `false`.
	test('does not close on click by default (closeOnClick defaults to false)', async () => {
		vi.useFakeTimers();
		render(
			<Tooltip>
				<TooltipTrigger render={<Button>Trigger</Button>} />
				<TooltipContent>Hello</TooltipContent>
			</Tooltip>,
		);

		const trigger = screen.getByRole('button', { name: 'Trigger' });

		fireEvent.mouseEnter(trigger);
		fireEvent.focus(trigger);
		await vi.advanceTimersByTimeAsync(1000);
		expect(screen.queryByText('Hello')).toBeTruthy();

		fireEvent.click(trigger);
		await vi.advanceTimersByTimeAsync(0);

		expect(screen.queryByText('Hello')).toBeTruthy();
	});

	test('an explicit closeOnClick can still opt back into dismiss-on-press', async () => {
		vi.useFakeTimers();
		render(
			<Tooltip>
				<TooltipTrigger closeOnClick render={<Button>Trigger</Button>} />
				<TooltipContent>Hello</TooltipContent>
			</Tooltip>,
		);

		const trigger = screen.getByRole('button', { name: 'Trigger' });

		fireEvent.mouseEnter(trigger);
		fireEvent.focus(trigger);
		await vi.advanceTimersByTimeAsync(1000);
		expect(screen.queryByText('Hello')).toBeTruthy();

		fireEvent.click(trigger);
		await vi.advanceTimersByTimeAsync(0);

		expect(screen.queryByText('Hello')).toBeNull();
	});
});
