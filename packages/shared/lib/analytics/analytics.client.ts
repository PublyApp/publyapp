import type {
	CaptureOptions,
	EventName,
	PostHogConfig,
	Properties,
} from 'posthog-js';
import type { EventMessage, IdentifyMessage } from 'posthog-node';
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

	// Server-side capture signature (not used on browser, but required by interface)
	capture(event: EventMessage): void;
	// Client-side capture with event name and properties
	capture(
		event: EventName,
		properties?: Properties | null,
		options?: CaptureOptions,
	): void;
	capture(
		event: EventName | EventMessage,
		properties?: Properties | null,
		options?: CaptureOptions,
	): void {
		if (!AnalyticsBrowser.posthog) {
			console.error('PostHog is not initialized');
			return;
		}
		// Browser implementation only handles EventName
		AnalyticsBrowser.posthog.capture(event as EventName, properties, options);
	}

	// Server-side identify signature (not used on browser, but required by interface)
	identify(props: IdentifyMessage): void;
	// Client-side identify with distinct ID and properties
	identify(
		distinctId: string,
		userPropertiesToSet?: Properties,
		userPropertiesToSetOnce?: Properties,
	): void;
	identify(
		propsOrDistinctId: IdentifyMessage | string,
		userPropertiesToSet?: Properties,
		userPropertiesToSetOnce?: Properties,
	): void {
		if (!AnalyticsBrowser.posthog) {
			console.error('PostHog is not initialized');
			return;
		}
		// Browser implementation only handles string distinctId
		const distinctId =
			typeof propsOrDistinctId === 'string'
				? propsOrDistinctId
				: propsOrDistinctId.distinctId;
		AnalyticsBrowser.posthog.identify(
			distinctId,
			userPropertiesToSet,
			userPropertiesToSetOnce,
		);
	}

	// Server-side captureException signature (not used on browser, but required by interface)
	captureException(
		error: unknown,
		distinctId?: string,
		additionalProperties?: Properties,
	): void;
	// Client-side captureException with properties only
	captureException(error: unknown, additionalProperties?: Properties): void;
	captureException(
		error: unknown,
		distinctIdOrProperties?: string | Properties,
		additionalProperties?: Properties,
	): void {
		if (!AnalyticsBrowser.posthog) {
			console.error('PostHog is not initialized');
			return;
		}
		// Browser implementation handles properties only (distinctId is automatic)
		const properties =
			typeof distinctIdOrProperties === 'object'
				? distinctIdOrProperties
				: additionalProperties;
		AnalyticsBrowser.posthog.captureException(error, properties);
	}
}
