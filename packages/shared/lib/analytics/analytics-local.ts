import type {
	CaptureEventParams,
	CaptureExceptionParams,
	IAnalytics,
	IdentifyUserParams,
} from './analytics.types';

/**
 * AnalyticsLocal is a no-op PostHog client that does not send any data.
 * It is used in local development for both client-side and server-side.
 */
export class AnalyticsLocal implements IAnalytics {
	capture(_params: CaptureEventParams): void {
		console.warn('AnalyticsLocal instance used - capture');
	}

	identify(_params: IdentifyUserParams): void {
		console.warn('AnalyticsLocal instance used - identify');
	}

	captureException(_params: CaptureExceptionParams): void {
		console.warn('AnalyticsLocal instance used - captureException');
	}
}
