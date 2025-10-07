import type { CaptureOptions, EventName, Properties } from 'posthog-js';
import type { EventMessage, IdentifyMessage } from 'posthog-node';

/**
 * Unified analytics interface that works across both server (Node) and client (Browser) environments.
 * Uses method overloads to provide type-safe APIs for each environment.
 */
export interface IAnalytics {
	/**
	 * Capture an event (Server-side with EventMessage)
	 */
	capture(event: EventMessage): void;
	/**
	 * Capture an event (Client-side with event name and properties)
	 */
	capture(
		event: EventName,
		properties?: Properties | null,
		options?: CaptureOptions,
	): void;

	/**
	 * Identify a user (Server-side with IdentifyMessage)
	 */
	identify(props: IdentifyMessage): void;
	/**
	 * Identify a user (Client-side with distinct ID and properties)
	 */
	identify(
		distinctId: string,
		userPropertiesToSet?: Properties,
		userPropertiesToSetOnce?: Properties,
	): void;

	/**
	 * Capture an exception (Server-side with distinctId)
	 */
	captureException(
		error: unknown,
		distinctId?: string,
		additionalProperties?: Properties,
	): void;
	/**
	 * Capture an exception (Client-side with properties only)
	 */
	captureException(error: unknown, additionalProperties?: Properties): void;
}
