import { PostHogBrowserAnalyticsAdapter } from '@org/shared-ts/lib/analytics/adapters/posthog-browser-analytics-adapter';
import { PostHogNodeAnalyticsAdapter } from '@org/shared-ts/lib/analytics/adapters/posthog-node-analytics-adapter';
import { Analytics } from '@org/shared-ts/lib/analytics/analytics';
import { isServer } from '@org/shared-ts/lib/constants';

import { getPublicEnv } from '../env';
import { useCookieConsentStore } from '../store/cookie-consent-store';

let analytics: Analytics | undefined;

/**
 * The front wiring: a server request has no cookie-consent decision to read, so
 * its operational analytics stays enabled; the browser follows the analytics
 * category. The adapter is chosen once, when the service is first needed.
 */
export const getAnalytics = (): Analytics => {
	if (analytics) {
		return analytics;
	}

	const token = getPublicEnv().posthogProjectToken ?? '';
	const adapter = isServer
		? new PostHogNodeAnalyticsAdapter(token)
		: new PostHogBrowserAnalyticsAdapter(token);
	analytics = new Analytics(
		adapter,
		isServer
			? () => true
			: () => useCookieConsentStore.getState().consent.analytics,
	);
	analytics.logOnly = !token;
	return analytics;
};
