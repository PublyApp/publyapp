import { PostHog } from 'posthog-node';
import type {
	CaptureEventParams,
	CaptureExceptionParams,
	IAnalytics,
	IdentifyUserParams,
} from './analytics.types';

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

	capture(params: CaptureEventParams): void {
		// Translate to posthog-node EventMessage format
		this.posthog.capture({
			distinctId: params.distinctId,
			event: params.event,
			properties: params.properties,
		});
	}

	identify(params: IdentifyUserParams): void {
		// Translate to posthog-node IdentifyMessage format
		const properties = {
			...params.properties,
			...(params.propertiesSetOnce
				? { $set_once: params.propertiesSetOnce }
				: {}),
		};

		this.posthog.identify({
			distinctId: params.distinctId,
			properties,
		});
	}

	captureException(params: CaptureExceptionParams): void {
		this.posthog.captureException(
			params.error,
			params.distinctId,
			params.additionalProperties,
		);
	}
}
