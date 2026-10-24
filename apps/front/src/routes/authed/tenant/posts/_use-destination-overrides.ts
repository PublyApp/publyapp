import { useState } from 'react';
import {
	BODY_KEY,
	isOverrideEmpty,
	pruneToSegments,
} from '~/lib/publishing/destination-overrides';
import type {
	DestinationOverride,
	DestinationOverrides,
} from '~/lib/publishing/destination-overrides';

/** Nothing customized: the stable initial value. */
const NO_OVERRIDES: DestinationOverrides = {};

export type DestinationOverridesState = {
	/** Destinations with something overridden, by social account id: an account
	 * that is absent inherits the whole shared post. */
	overrides: DestinationOverrides;
	/** The destination whose tab is open, or null for the shared editor. */
	activeId: string | null;
	open: (accountId: string) => void;
	close: () => void;
	/** Stores a destination's overrides; one with nothing left to override
	 * goes back to inheriting. */
	update: (accountId: string, next: DestinationOverride) => void;
	/** "Reset to shared" for one destination. */
	reset: (accountId: string) => void;
	resetAll: () => void;
};

const withoutKey = (
	overrides: DestinationOverrides,
	accountId: string,
): DestinationOverrides =>
	Object.fromEntries(
		Object.entries(overrides).filter(([key]) => key !== accountId),
	);

/** Owns the composer's per-destination overrides and which destination tab is
 * open. State only: nothing is saved until the user publishes or schedules
 * (there is no autosave). */
export const useDestinationOverrides = (
	/** The ids of the shared follow-up segments: text customized for a segment
	 * that no longer exists is left out of `overrides`. */
	segmentIds?: readonly string[],
): DestinationOverridesState => {
	const [stored, setOverrides] = useState(NO_OVERRIDES);
	const overrides =
		segmentIds === undefined
			? stored
			: pruneToSegments(stored, [BODY_KEY, ...segmentIds]);
	const [activeId, setActiveId] = useState<string | null>(null);

	const update = (accountId: string, next: DestinationOverride) => {
		setOverrides((previous) =>
			isOverrideEmpty(next)
				? withoutKey(previous, accountId)
				: { ...previous, [accountId]: next },
		);
	};

	return {
		overrides,
		activeId,
		open: setActiveId,
		close: () => setActiveId(null),
		update,
		reset: (accountId) => {
			setOverrides((previous) => withoutKey(previous, accountId));
		},
		resetAll: () => {
			setOverrides(NO_OVERRIDES);
			setActiveId(null);
		},
	};
};
