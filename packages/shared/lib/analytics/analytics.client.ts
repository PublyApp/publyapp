import type { PostHogConfig, Properties } from 'posthog-js';
import type {
	CaptureEventParams,
	CaptureExceptionParams,
	IAnalytics,
	IdentifyUserParams,
} from './analytics.types';

export interface IPostHogBrowser {
	init(apiKey: string, config?: Partial<PostHogConfig>, name?: string): void;
	identify(
		new_distinct_id?: string,
		userPropertiesToSet?: Properties,
		userPropertiesToSetOnce?: Properties,
	): void;
	capture(event_name: string, properties?: Properties | null): void;
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
	private posthog?: IPostHogBrowser;

	constructor(apiKey: string, posthog: IPostHogBrowser) {
		this.posthog = posthog;
		this.posthog.init(apiKey, {
			api_host: 'https://us.i.posthog.com',
			capture_exceptions: true,
		});
	}

	capture(params: CaptureEventParams): void {
		if (!this.posthog) {
			console.error('PostHog is not initialized');
			return;
		}
		// Translate to posthog-js browser format
		// Note: Browser PostHog automatically tracks distinctId, but we can set it via identify first
		this.posthog.capture(params.event, params.properties);
	}

	identify(params: IdentifyUserParams): void {
		if (!this.posthog) {
			console.error('PostHog is not initialized');
			return;
		}
		// Translate to posthog-js browser format
		this.posthog.identify(
			params.distinctId,
			params.properties,
			params.propertiesSetOnce,
		);
	}

	captureException(params: CaptureExceptionParams): void {
		if (!this.posthog) {
			console.error('PostHog is not initialized');
			return;
		}
		// Browser PostHog tracks distinctId automatically from session
		// If distinctId is provided, we could identify first, but typically not needed for exceptions
		this.posthog.captureException(params.error, params.additionalProperties);
	}
}
