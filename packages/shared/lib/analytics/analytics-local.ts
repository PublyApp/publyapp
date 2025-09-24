import type { IAnalytics } from './analytics.types';

/**
 * SilentPostHog is a PostHog client that does not send any data.
 * It is used when in local and both client-side/server-side
 */
export class AnalyticsLocal implements IAnalytics {
	node = {
		capture() {
			console.warn('AnalyticsLocal instance used');
		},
		identify() {
			console.warn('AnalyticsLocal instance used');
		},
		captureException() {
			console.warn('AnalyticsLocal instance used');
		},
	};

	browser = {
		capture() {
			console.warn('AnalyticsLocal instance used');
		},
		identify() {
			console.warn('AnalyticsLocal instance used');
		},
		captureException() {
			console.warn('AnalyticsLocal instance used');
		},
	};
}
