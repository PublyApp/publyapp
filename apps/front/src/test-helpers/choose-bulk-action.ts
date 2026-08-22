import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

/**
 * Click the bulk-action "More actions" trigger, wait for the floating menu to
 * open, then select the named action item.
 *
 * The floating trigger renders before Base UI wires its pointer props; a click
 * dispatched into that window is swallowed. Gating on the settled closed state,
 * then on the open state after the click, closes the race.
 */
export const chooseBulkAction = async (actionName: string) => {
	const trigger = await screen.findByRole('button', {
		name: 'More actions',
		expanded: false,
	});

	fireEvent.click(trigger);
	await waitFor(() =>
		expect(
			trigger.getAttribute('aria-expanded'),
			`bulk menu did not open for ${actionName}`,
		).toBe('true'),
	);
	fireEvent.click(screen.getByRole('menuitem', { name: actionName }));
};
