import type { CaptureOptions, EventName, Properties } from 'posthog-js';
import { type EventMessage, type IdentifyMessage, PostHog } from 'posthog-node';
import type { IAnalytics } from './analytics.types';

/**
 * AnalyticsNode is a PostHog client that sends data to PostHog from the server.
 * It is used in production for server-side analytics.
 */
export class AnalyticsNode implements IAnalytics {
	private readonly posthog: PostHog;

	constructor(apiKey: string) {
		this.posthog = new PostHog(apiKey, {
			host: 'https://us.i.posthog.com',
			enableExceptionAutocapture: true,
		});
	}

	// Server-side capture with EventMessage
	capture(event: EventMessage): void;
	// Client-side capture signature (not used on server, but required by interface)
	capture(
		event: EventName,
		properties?: Properties | null,
		options?: CaptureOptions,
	): void;
	capture(event: EventMessage | EventName): void {
		// Server implementation only handles EventMessage
		this.posthog.capture(event as EventMessage);
	}

	// Server-side identify with IdentifyMessage
	identify(props: IdentifyMessage): void;
	// Client-side identify signature (not used on server, but required by interface)
	identify(
		distinctId: string,
		userPropertiesToSet?: Properties,
		userPropertiesToSetOnce?: Properties,
	): void;
	identify(
		propsOrDistinctId: IdentifyMessage | string,
		userPropertiesToSet?: Properties,
		_userPropertiesToSetOnce?: Properties,
	): void {
		// Server implementation only handles IdentifyMessage
		if (typeof propsOrDistinctId === 'string') {
			// Client-side call on server (shouldn't happen, but handle gracefully)
			this.posthog.identify({
				distinctId: propsOrDistinctId,
				properties: userPropertiesToSet,
			});
		} else {
			this.posthog.identify(propsOrDistinctId);
		}
	}

	// Server-side captureException with distinctId
	captureException(
		error: unknown,
		distinctId?: string,
		additionalProperties?: Properties,
	): void;
	// Client-side captureException signature (not used on server, but required by interface)
	captureException(error: unknown, additionalProperties?: Properties): void;
	captureException(
		error: unknown,
		distinctIdOrProperties?: string | Properties,
		additionalProperties?: Properties,
	): void {
		// Handle both signatures
		if (typeof distinctIdOrProperties === 'string') {
			// Server-side call with distinctId
			this.posthog.captureException(
				error,
				distinctIdOrProperties,
				additionalProperties,
			);
		} else {
			// Client-side call or no distinctId
			this.posthog.captureException(error, undefined, distinctIdOrProperties);
		}
	}
}
