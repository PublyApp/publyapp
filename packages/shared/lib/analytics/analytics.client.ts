import type {
	CaptureOptions,
	EventName,
	PostHogConfig,
	Properties,
} from 'posthog-js';

export interface IPostHogBrowser {
	init(apiKey: string, config?: Partial<PostHogConfig>, name?: string): void;
	identify(
		new_distinct_id?: string,
		userPropertiesToSet?: Properties,
		userPropertiesToSetOnce?: Properties,
	): void;
	capture(
		event_name: EventName,
		properties?: Properties | null,
		options?: CaptureOptions,
	): void;
	captureException(error: unknown, additionalProperties?: Properties): void;
}
export class PostHogAnalyticsBrowser {
	private static posthog: IPostHogBrowser;
	public static instance: PostHogAnalyticsBrowser;

	static initialize(apiKey: string, posthog: IPostHogBrowser) {
		PostHogAnalyticsBrowser.posthog = posthog;
		PostHogAnalyticsBrowser.posthog.init(apiKey, {
			api_host: 'https://us.i.posthog.com',
			capture_exceptions: true,
		});
		PostHogAnalyticsBrowser.instance = new PostHogAnalyticsBrowser();
	}

	browser = {
		identify(
			new_distinct_id?: string,
			userPropertiesToSet?: Properties,
			userPropertiesToSetOnce?: Properties,
		) {
			PostHogAnalyticsBrowser.posthog.identify(
				new_distinct_id,
				userPropertiesToSet,
				userPropertiesToSetOnce,
			);
		},
		capture(
			event_name: EventName,
			properties?: Properties | null,
			options?: CaptureOptions,
		) {
			PostHogAnalyticsBrowser.posthog.capture(event_name, properties, options);
		},
		captureException(error: unknown, additionalProperties?: Properties) {
			PostHogAnalyticsBrowser.posthog.captureException(
				error,
				additionalProperties,
			);
		},
	};

	node = {
		capture() {},
		identify() {},
		captureException() {},
	};
}
