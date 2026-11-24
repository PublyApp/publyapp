import type { EventMessage, IdentifyMessage, PostHog } from 'posthog-node';

import type {
	AnalyticsEvent,
	AnalyticsProperties,
	IAnalytics,
} from '../analytics.types';

const POSTHOG_HOST = 'https://us.i.posthog.com';

/** Server-side adapter: translates one event to posthog-node calls. */
export class PostHogNodeAnalyticsAdapter implements IAnalytics {
	readonly #apiKey: string;
	#client: Promise<PostHog> | undefined;

	constructor(apiKey: string) {
		this.#apiKey = apiKey;
	}

	async send(event: AnalyticsEvent): Promise<void> {
		const client = await this.#getClient();
		switch (event.type) {
			case 'capture': {
				const message: EventMessage = {
					distinctId: event.distinctId,
					event: event.event,
					properties: event.properties,
				};
				client.capture(message);
				return;
			}
			case 'identify': {
				const properties: AnalyticsProperties = {};
				if (event.properties) {
					properties.$set = event.properties;
				}
				if (event.propertiesSetOnce) {
					properties.$set_once = event.propertiesSetOnce;
				}
				const message: IdentifyMessage = {
					distinctId: event.distinctId,
					properties,
				};
				client.identify(message);
				return;
			}
			case 'exception':
				client.captureException(
					event.error,
					event.distinctId,
					event.additionalProperties,
				);
				return;
		}
	}

	#getClient(): Promise<PostHog> {
		this.#client ??= import('posthog-node').then(
			({ PostHog }) =>
				new PostHog(this.#apiKey, {
					host: POSTHOG_HOST,
					enableExceptionAutocapture: true,
				}),
		);
		return this.#client;
	}
}
