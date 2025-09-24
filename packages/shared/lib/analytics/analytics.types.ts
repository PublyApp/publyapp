import type { CaptureOptions, EventName, Properties } from 'posthog-js';
import type { EventMessage, IdentifyMessage } from 'posthog-node';

// export type IAnalytics = Pick<
// 	PostHog,
// 	'capture' | 'identify' | 'captureException'
// >;
export interface IAnalytics {
	node: {
		capture(props: EventMessage): void;
		identify(props: IdentifyMessage): void;
		captureException(
			error: unknown,
			distinctId?: string,
			// biome-ignore lint/suspicious/noExplicitAny: inherit from PostHog
			additionalProperties?: Record<string | number, any>,
		): void;
	};

	browser: {
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
	};
}
