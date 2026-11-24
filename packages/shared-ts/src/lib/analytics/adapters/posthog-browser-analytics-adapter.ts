import type { PostHog } from 'posthog-js';

import type { AnalyticsEvent, IAnalytics } from '../analytics.types';

const POSTHOG_HOST = 'https://us.i.posthog.com';

/** Browser adapter: translates one event to posthog-js calls. */
export class PostHogBrowserAnalyticsAdapter implements IAnalytics {
	readonly #apiKey: string;
	#client: Promise<PostHog> | undefined;

	constructor(apiKey: string) {
		this.#apiKey = apiKey;
	}

	async send(event: AnalyticsEvent): Promise<void> {
		const posthog = await this.#getClient();
		switch (event.type) {
			case 'capture':
				// posthog-js attaches its own distinct id (set by identify).
				posthog.capture(event.event, event.properties);
				return;
			case 'identify':
				posthog.identify(
					event.distinctId,
					event.properties,
					event.propertiesSetOnce,
				);
				return;
			case 'exception':
				posthog.captureException(event.error, event.additionalProperties);
				return;
		}
	}

	#getClient(): Promise<PostHog> {
		this.#client ??= import('posthog-js').then(({ default: posthog }) => {
			posthog.init(this.#apiKey, {
				api_host: POSTHOG_HOST,
				capture_exceptions: true,
			});
			return posthog;
		});
		return this.#client;
	}
}
