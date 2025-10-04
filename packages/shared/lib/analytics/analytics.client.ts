import type {
	CaptureOptions,
	EventName,
	PostHogConfig,
	Properties,
} from 'posthog-js';
import type { IAnalytics } from './analytics.types';

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

export const posthogBrowserMock: IPostHogBrowser = {
	init: (...args) => {
		console.warn('posthog mock object is being used', args);
	},
	capture: (...args) => {
		console.warn('posthog mock object is being used', args);
	},
	captureException: () => {
		console.warn('posthog mock object is being used');
	},
	identify: (...args) => {
		console.warn('posthog mock object is being used', args);
	},
};

export class AnalyticsBrowser implements IAnalytics {
	private static posthog?: IPostHogBrowser;
	public static instance: AnalyticsBrowser;

	private constructor() {}

	static initialize(apiKey: string, posthog: IPostHogBrowser) {
		AnalyticsBrowser.posthog = posthog;
		AnalyticsBrowser.posthog.init(apiKey, {
			api_host: 'https://us.i.posthog.com',
			capture_exceptions: true,
		});
		AnalyticsBrowser.instance = new AnalyticsBrowser();
	}

	public static identify(distinctId: string, properties?: Properties) {
		AnalyticsBrowser.instance.browser.identify(distinctId, properties);
	}

	public static capture(event_name: EventName, properties?: Properties) {
		AnalyticsBrowser.instance.browser.capture(event_name, properties);
	}

	public static captureException(
		error: unknown,
		additionalProperties?: Properties,
	) {
		AnalyticsBrowser.instance.browser.captureException(
			error,
			additionalProperties,
		);
	}

	browser = {
		identify(
			new_distinct_id?: string,
			userPropertiesToSet?: Properties,
			userPropertiesToSetOnce?: Properties,
		) {
			if (!AnalyticsBrowser.posthog) {
			}
			if (!AnalyticsBrowser.posthog) {
				console.error('PostHog is not initialized');
				return;
			}
			AnalyticsBrowser.posthog.identify(
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
			if (!AnalyticsBrowser.posthog) {
				console.error('PostHog is not initialized');
				return;
			}
			AnalyticsBrowser.posthog.capture(event_name, properties, options);
		},
		captureException(error: unknown, additionalProperties?: Properties) {
			if (!AnalyticsBrowser.posthog) {
				console.error('PostHog is not initialized');
				return;
			}
			AnalyticsBrowser.posthog.captureException(error, additionalProperties);
		},
	};

	node = {
		capture() {
			console.error('AnalyticsBrowser.node.capture is not supported on client');
		},
		identify() {
			console.error(
				'AnalyticsBrowser.node.identify is not supported on client',
			);
		},
		captureException() {
			console.error(
				'AnalyticsBrowser.node.captureException is not supported on client',
			);
		},
	};
}
