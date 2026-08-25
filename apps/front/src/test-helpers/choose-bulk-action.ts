import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

/**
 * Click a bulk-action trigger, wait for the floating menu to
 * open, then select the named action item.
 *
 * The floating trigger renders before Base UI wires its pointer props; a click
 * dispatched into that window is swallowed. Gating on the settled closed state,
 * then on the open state after the click, closes the race.
 *
 * `triggerName` defaults to the #820 "More actions" label; surfaces that name
 * their trigger after its visible label instead (#1387, per the #1400 a11y
 * rule) pass their own — e.g. "Bulk actions".
 */
export const chooseBulkAction = async (
	actionName: string,
	triggerName = 'More actions',
) => {
	const trigger = await screen.findByRole('button', {
		name: triggerName,
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
