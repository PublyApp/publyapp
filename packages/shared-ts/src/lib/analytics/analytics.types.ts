import type { JsonObject } from '../../types/json.types';

/**
 * An analytics call's properties/metadata. PostHog serialises these to JSON and
 * sends them as the event payload, so the boundary type is the JSON object —
 * not an open dictionary of `unknown` that would accept a `Date` or a class
 * instance PostHog cannot represent.
 */
export type AnalyticsProperties = JsonObject;

type CaptureEvent = {
	/** The user/session the event belongs to. */
	distinctId: string;
	/** Name of the event being captured. */
	event: string;
	/** Optional properties/metadata for the event. */
	properties?: AnalyticsProperties;
};

type IdentifyEvent = {
	/** The user being identified. */
	distinctId: string;
	/** Properties to set on the user. */
	properties?: AnalyticsProperties;
	/** Properties to set only once (won't overwrite existing values). */
	propertiesSetOnce?: AnalyticsProperties;
};

type ExceptionEvent = {
	/** The error/exception to capture. */
	error: unknown;
	/** The user/session the exception belongs to. */
	distinctId?: string;
	/** Additional properties/context for the exception. */
	additionalProperties?: AnalyticsProperties;
};

/** One event shape for every analytics call; the adapter translates it. */
export type AnalyticsEvent =
	| ({ type: 'capture' } & CaptureEvent)
	| ({ type: 'identify' } & IdentifyEvent)
	| ({ type: 'exception' } & ExceptionEvent);

/** The adapter port: one method, no consent check and no masking. */
export interface IAnalytics {
	send(event: AnalyticsEvent): Promise<void> | void;
}

/** The service consults this before doing any work; adapters never do. */
export type AnalyticsConsent = () => boolean;
