/**
 * Unified analytics interface with consistent API across server and browser environments.
 * Implementations translate these standard parameters to their respective PostHog library requirements.
 */

export interface CaptureEventParams {
	/** Unique identifier for the user/session */
	distinctId: string;
	/** Name of the event being captured */
	event: string;
	/** Optional properties/metadata for the event */
	properties?: Record<string, unknown>;
}

export interface IdentifyUserParams {
	/** Unique identifier for the user */
	distinctId: string;
	/** Properties to set on the user profile */
	properties?: Record<string, unknown>;
	/** Properties to set only once (won't overwrite existing values) */
	propertiesSetOnce?: Record<string, unknown>;
}

export interface CaptureExceptionParams {
	/** The error/exception to capture */
	error: unknown;
	/** Unique identifier for the user/session */
	distinctId?: string;
	/** Additional properties/context for the exception */
	additionalProperties?: Record<string, unknown>;
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
