import { useMemo } from 'react';

import type { LimitedDestination, TightestLimit } from './text-counter';
import { countText, tightestLimit } from './text-counter';

/** Live counter state for `text` against the selected destinations' limits. */
export const useTextCounter = (
	text: string,
	destinations: readonly LimitedDestination[],
): TightestLimit | null =>
	useMemo(
		() => tightestLimit(countText(text), destinations),
		[text, destinations],
	);
