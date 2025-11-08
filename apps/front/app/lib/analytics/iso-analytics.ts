import { AnalyticsLocal } from '@/shared/lib/analytics/analytics-local';
import { IsoAnalytics } from '@/shared/lib/analytics/iso-analytics';
import type { IAnalytics } from '@/shared/lib/analytics/analytics.types';
import { env } from '../env';

const isDevelopment = import.meta.env.DEV;

/**
 * Unified analytics instance that works on both client and server.
 * Uses IsoAnalytics in production and AnalyticsLocal in development.
 *
 * This is the recommended way to use analytics in the front app.
 * It automatically detects the runtime environment and uses the appropriate PostHog implementation.
 *
 * Usage:
 * ```typescript
 * import { isoAnalytics } from '~/lib/analytics/iso-analytics';
 *
 * // The analytics instance is already initialized and ready to use
 * isoAnalytics.capture({ distinctId: 'user-id', event: 'page_view' });
 * isoAnalytics.identify({ distinctId: 'user-id', properties: { email: 'user@example.com' } });
 * isoAnalytics.captureException({ error: new Error('Something went wrong') });
 * ```
 */
export let isoAnalytics: IAnalytics;

// Initialize analytics based on environment
if (isDevelopment) {
	// In development, use the local no-op implementation
	isoAnalytics = new AnalyticsLocal();
} else {
	// In production, use the unified IsoAnalytics that works on both client and server
	const analytics = new IsoAnalytics(env.VITE_POSTHOG_API_KEY);

	// Initialize the analytics instance
	await analytics.init();

	isoAnalytics = analytics;
}
