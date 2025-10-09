import {
	AnalyticsBrowser,
	posthogBrowserMock,
} from '@/shared/lib/analytics/analytics.client';
import type { IAnalytics } from '@/shared/lib/analytics/analytics.types';
import { env } from '../env';

const isDevelopment = import.meta.env.DEV;

export let analyticsClient: IAnalytics;

if (isDevelopment) {
	analyticsClient = new AnalyticsBrowser(
		env.VITE_POSTHOG_API_KEY,
		posthogBrowserMock,
	);
} else {
	await import('posthog-js').then(({ default: posthog }) => {
		analyticsClient = new AnalyticsBrowser(env.VITE_POSTHOG_API_KEY, posthog);
	});
}
