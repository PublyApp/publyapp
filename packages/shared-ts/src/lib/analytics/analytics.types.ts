import type { JsonObject } from '../../types/json.types';

/**
 * Unified analytics interface with consistent API across server and browser environments.
 * Implementations translate these standard parameters to their respective PostHog library requirements.
 */

/**
 * An analytics call's properties/metadata. PostHog serialises these to JSON and
 * sends them as the event payload, so the boundary type is the JSON object —
 * not an open dictionary of `unknown` that would accept a `Date` or a class
 * instance PostHog cannot represent.
 */
export type AnalyticsProperties = JsonObject;

export interface CaptureEventParams {
	/** Unique identifier for the user/session */
	distinctId: string;
	/** Name of the event being captured */
	event: string;
	/** Optional properties/metadata for the event */
	properties?: AnalyticsProperties;
}

export interface IdentifyUserParams {
	/** Unique identifier for the user */
	distinctId: string;
	/** Properties to set on the user profile */
	properties?: AnalyticsProperties;
	/** Properties to set only once (won't overwrite existing values) */
	propertiesSetOnce?: AnalyticsProperties;
}

export interface CaptureExceptionParams {
	/** The error/exception to capture */
	error: unknown;
	/** Unique identifier for the user/session */
	distinctId?: string;
	/** Additional properties/context for the exception */
	additionalProperties?: AnalyticsProperties;
}

export interface IAnalytics {
	/**
	 * Capture an analytics event
	 */
	capture(params: CaptureEventParams): void;

	/**
	 * Identify a user with their properties
	 */
	identify(params: IdentifyUserParams): void;

	/**
	 * Capture an exception/error
	 */
	captureException(params: CaptureExceptionParams): void;
}
