import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

/**
 * Click a bulk-action trigger, wait for the floating menu to
 * open, then select the named action item.
 *
 * #1400: a trigger's accessible name IS its visible label (WCAG 2.5.3
 * label-in-name) — the single `bulk-actions` i18n key feeds both through
 * `ui/bulk-actions-trigger`, so callers pass the surface's own visible
 * label as `triggerName`.
 *
 * The floating trigger renders before Base UI wires its pointer props; a click
 * dispatched into that window is swallowed. Gating on the settled closed state,
 * then on the open state after the click, closes the race.
 *
 * `triggerName` is the trigger's accessible name and must be passed by every
 * caller: surfaces name their trigger after their own visible label (#820
 * "More actions", #1387 "Bulk actions" per the #1400 name-equals-label rule).
 */
export const chooseBulkAction = async (
	actionName: string,
	triggerName: string,
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
