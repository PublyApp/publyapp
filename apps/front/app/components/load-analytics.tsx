import {
	AnalyticsBrowser,
	posthogBrowserMock,
} from '@org/shared/lib/analytics/analytics.client';
import { useEffect } from 'react';
import { env } from '../lib/env';

// TODO: fix csp issue
// https://github.com/PostHog/posthog-js/issues/774#issuecomment-2461150623
const LoadAnalytics = () => {
	useEffect(() => {
		if (typeof window !== 'undefined') {
			if (import.meta.env.DEV) {
				AnalyticsBrowser.initialize(
					env.VITE_POSTHOG_API_KEY,
					posthogBrowserMock,
				);
				return;
			}

			import('posthog-js')
				.then(({ default: posthog }) => {
					if (posthog.__loaded) {
						return;
					}
					AnalyticsBrowser.initialize(env.VITE_POSTHOG_API_KEY, posthog);
				})
				.catch(console.error);
		}
	}, []);

	return null;
};

export default LoadAnalytics;
