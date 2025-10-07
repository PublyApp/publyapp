import type { CaptureOptions, EventName, Properties } from 'posthog-js';
import type { EventMessage, IdentifyMessage } from 'posthog-node';
import type { IAnalytics } from './analytics.types';

/**
 * AnalyticsLocal is a no-op PostHog client that does not send any data.
 * It is used in local development for both client-side and server-side.
 */
export class AnalyticsLocal implements IAnalytics {
	// Server-side capture
	capture(event: EventMessage): void;
	// Client-side capture
	capture(
		event: EventName,
		properties?: Properties | null,
		options?: CaptureOptions,
	): void;
	capture(): void {
		console.warn('AnalyticsLocal instance used - capture');
	}

	// Server-side identify
	identify(props: IdentifyMessage): void;
	// Client-side identify
	identify(
		distinctId: string,
		userPropertiesToSet?: Properties,
		userPropertiesToSetOnce?: Properties,
	): void;
	identify(): void {
		console.warn('AnalyticsLocal instance used - identify');
	}

	// Server-side captureException
	captureException(
		error: unknown,
		distinctId?: string,
		additionalProperties?: Properties,
	): void;
	// Client-side captureException
	captureException(error: unknown, additionalProperties?: Properties): void;
	captureException(): void {
		console.warn('AnalyticsLocal instance used - captureException');
	}
}
