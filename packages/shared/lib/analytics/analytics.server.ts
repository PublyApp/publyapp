import { type EventMessage, type IdentifyMessage, PostHog } from 'posthog-node';
import { logger } from '../winston.server';
import type { IAnalytics } from './analytics.types';

/**
 * PostHogAnalyticsServer is a PostHog client that sends data to PostHog.
 * It is used when in production and server-side only
 */
export class AnalyticsNode implements IAnalytics {
	private readonly posthog: PostHog;

	constructor(apiKey: string) {
		this.posthog = new PostHog(apiKey, {
			host: 'https://us.i.posthog.com',
			enableExceptionAutocapture: true,
		});
	}

	node = {
		capture: (props: EventMessage) => {
			this.posthog.capture(props);
		},
		identify: (props: IdentifyMessage) => {
			this.posthog.identify(props);
		},
		captureException: (
			error: unknown,
			distinctId?: string,
			// biome-ignore lint/suspicious/noExplicitAny: inherit from PostHog
			additionalProperties?: Record<string | number, any>,
		) => {
			this.posthog.captureException(error, distinctId, additionalProperties);
		},
	};

	browser = {
		capture() {
			logger.error('AnalyticsNode.browser.capture is not supported on server');
		},
		identify() {
			logger.error('AnalyticsNode.browser.capture is not supported on server');
		},
		captureException() {
			logger.error('AnalyticsNode.browser.capture is not supported on server');
		},
	};
}
