import type { IAnalytics } from './analytics.types';

/**
 * SilentPostHog is a PostHog client that does not send any data.
 * It is used when in local and both client-side/server-side
 */
export class PostHogAnalyticsLocal implements IAnalytics {
	node = {
		capture() {
			/* do nothing */
		},
		identify() {
			/* do nothing */
		},
		captureException() {
			/* do nothing */
		},
	};

	browser = {
		capture() {
			/* do nothing */
		},
		identify() {
			/* do nothing */
		},
		captureException() {
			/* do nothing */
		},
	};
}
