import type { IAnalytics } from '@/shared/lib/analytics/analytics.types';
import { IsoAnalytics } from '@/shared/lib/analytics/iso-analytics';

import { env } from '../env';

const _analytics = new IsoAnalytics(env.VITE_POSTHOG_API_KEY);
await _analytics.init();

const isDevelopment = import.meta.env.DEV;

if (isDevelopment) {
	_analytics.logOnly = true;
}

/**
 * Unified analytics instance that works on both client and server.
 * Uses IsoAnalytics in production and AnalyticsLocal in development.
 *
 * This is the recommended way to use analytics in the front app.
 * It automatically detects the runtime environment and uses the appropriate PostHog implementation.
 *
 * Usage:
 * ```typescript
 * import { analytics } from '~/lib/analytics/analytics';
 *
 * // The analytics instance is already initialized and ready to use
 * analytics.capture({ distinctId: 'user-id', event: 'page_view' });
 * analytics.identify({ distinctId: 'user-id', properties: { email: 'user@example.com' } });
 * analytics.captureException({ error: new Error('Something went wrong') });
 * ```
 */
export const analytics: IAnalytics = _analytics;
