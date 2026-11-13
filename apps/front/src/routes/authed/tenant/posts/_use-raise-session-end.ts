import { useState } from 'react';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

/**
 * Lets a hand-driven request (a save, a read-back) honour the central 401
 * rule: an ended session is not a message to show inline. `raise(cause)`
 * answers true after handing a 401 to the route's error boundary (the
 * logout redirect) by throwing it from the next render; anything else is the
 * caller's to report.
 */
export const useRaiseSessionEnd = () => {
	const [ended, setEnded] = useState<unknown>(null);
	if (ended !== null) {
		throw ended;
	}

	return (cause: unknown): boolean => {
		if (!shouldLogoutForFailure(cause)) {
			return false;
		}
		setEnded(cause);
		return true;
	};
};
