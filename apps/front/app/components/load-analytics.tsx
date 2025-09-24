import {
	type IPostHogBrowser,
	PostHogAnalyticsBrowser,
} from '@org/shared/lib/analytics/analytics.client';
import { useEffect } from 'react';
import { env } from '../lib/env';

const posthogMock: IPostHogBrowser = {
	init: () => {},
	capture: () => {},
	captureException: () => {},
	identify: () => {},
};

// TODO: fix csp issue
// https://github.com/PostHog/posthog-js/issues/774#issuecomment-2461150623
const LoadAnalytics = () => {
	useEffect(() => {
		if (typeof window !== 'undefined') {
			if (import.meta.env.DEV) {
				PostHogAnalyticsBrowser.initialize(
					env.VITE_POSTHOG_API_KEY,
					posthogMock,
				);
				return;
			}

			import('posthog-js')
				.then(({ default: posthog }) => {
					if (posthog.__loaded) {
						return;
					}
					PostHogAnalyticsBrowser.initialize(env.VITE_POSTHOG_API_KEY, posthog);
				})
				.catch(console.error);
		}
	}, []);

	return null;
};

export default LoadAnalytics;
