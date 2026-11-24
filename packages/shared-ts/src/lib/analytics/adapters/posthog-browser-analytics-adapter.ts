import type {
	AnalyticsEvent,
	AnalyticsProperties,
	IAnalytics,
} from '../analytics.types';

const POSTHOG_HOST = 'https://us.i.posthog.com';

/** Structural subset of posthog-js: a test fake needs no real client. */
export type PostHogBrowserClient = {
	init(
		apiKey: string,
		config: { api_host: string; capture_exceptions: boolean },
	): void;
	capture(event: string, properties?: AnalyticsProperties): void;
	identify(
		distinctId: string,
		properties?: AnalyticsProperties,
		propertiesSetOnce?: AnalyticsProperties,
	): void;
	captureException(
		error: unknown,
		additionalProperties?: AnalyticsProperties,
	): void;
};

export type PostHogBrowserLoader = () => Promise<PostHogBrowserClient>;

const loadPostHogClient: PostHogBrowserLoader = () =>
	import('posthog-js').then(({ default: posthog }) => posthog);

/** Browser adapter: translates one event to posthog-js calls. */
export class PostHogBrowserAnalyticsAdapter implements IAnalytics {
	readonly #apiKey: string;
	readonly #loadClient: PostHogBrowserLoader;
	#client: Promise<PostHogBrowserClient> | undefined;

	constructor(
		apiKey: string,
		loadClient: PostHogBrowserLoader = loadPostHogClient,
	) {
		this.#apiKey = apiKey;
		this.#loadClient = loadClient;
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

	#getClient(): Promise<PostHogBrowserClient> {
		this.#client ??= this.#loadClient().then((posthog) => {
			posthog.init(this.#apiKey, {
				api_host: POSTHOG_HOST,
				capture_exceptions: true,
			});
			return posthog;
		});
		return this.#client;
	}
}
