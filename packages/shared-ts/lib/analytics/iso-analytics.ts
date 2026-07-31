import type { PostHogConfig, Properties } from 'posthog-js';
import type { EventMessage, IdentifyMessage, PostHog } from 'posthog-node';

import { isServer } from '../constants';
import { logger } from '../logger/iso-logger';
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

let hasWarnedAnalyticsNotInitialized = false;

const warnAnalyticsNotInitializedOnce = (): void => {
	if (hasWarnedAnalyticsNotInitialized) {
		return;
	}

	hasWarnedAnalyticsNotInitialized = true;
	logger.warn(
		'Analytics not initialized; skipping analytics calls (this warning will not repeat)',
	);
};

/**
 * IsoAnalytics is a unified analytics client that works on both server and browser environments.
 * It automatically detects the runtime environment and uses the appropriate PostHog implementation:
 * - Server: Uses posthog-node for server-side analytics
 * - Browser: Uses posthog-js for client-side analytics
 *
 * This follows the same pattern as IsoLogger for consistent cross-environment functionality.
 *
 * Usage:
 * ```typescript
 * // In apps/front, create an instance with your API key
 * const analytics = new IsoAnalytics(apiKey);
 * await analytics.init(); // Must be called before using
 *
 * // Then use it anywhere
 * analytics.capture({ distinctId: 'user-id', event: 'page_view' });
 * analytics.identify({ distinctId: 'user-id', properties: { email: 'user@example.com' } });
 * ```
 */
export class IsoAnalytics implements IAnalytics {
	public logOnly = false;

	private apiKey: string;
	private initialized = false;
	private posthogNode: PostHog | null = null;
	private posthogBrowser: IPostHogBrowser | null = null;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	private isServerRuntime(): boolean {
		return isServer;
	}

	/**
	 * Initialize the analytics client based on the current environment.
	 * This method is idempotent and can be called multiple times safely.
	 *
	 * IMPORTANT: Must be called before using any analytics methods.
	 */
	async init(): Promise<void> {
		if (this.initialized) {
			return;
		}

		if (this.logOnly) {
			logger.info('Analytics.init', 'log only mode');
			this.initialized = true;
			return;
		}

		try {
			if (this.isServerRuntime()) {
				await this.initServer();
			} else {
				await this.initBrowser();
			}
			this.initialized = true;
		} catch (error) {
			logger.error('Failed to initialize analytics', error);
		}
	}

	private async initServer(): Promise<void> {
		const { PostHog } = await import('posthog-node');
		this.posthogNode = new PostHog(this.apiKey, {
			host: 'https://us.i.posthog.com',
			enableExceptionAutocapture: true,
		});
	}

	private async initBrowser(): Promise<void> {
		const posthog = await import('posthog-js');
		this.posthogBrowser = posthog.default as unknown as IPostHogBrowser;
		this.posthogBrowser.init(this.apiKey, {
			api_host: 'https://us.i.posthog.com',
			capture_exceptions: true,
		});
	}

	capture(params: CaptureEventParams): void {
		if (!this.initialized) {
			warnAnalyticsNotInitializedOnce();
			return;
		}

		if (this.logOnly) {
			logger.info('Analytics.capture', params);
			return;
		}

		if (this.isServerRuntime()) {
			if (!this.posthogNode) {
				logger.error('PostHog Node is not initialized');
				return;
			}
			// Server-side: posthog-node EventMessage format
			const captureMessage: EventMessage = {
				distinctId: params.distinctId,
				event: params.event,
				properties: params.properties,
			};

			this.posthogNode.capture(captureMessage);
		} else {
			if (!this.posthogBrowser) {
				logger.error('PostHog Browser is not initialized');
				return;
			}
			// Browser-side: posthog-js format
			// Note: Browser PostHog automatically tracks distinctId, but we can set it via identify first
			this.posthogBrowser.capture(params.event, params.properties);
		}
	}

	identify(params: IdentifyUserParams): void {
		if (!this.initialized) {
			warnAnalyticsNotInitializedOnce();
			return;
		}

		if (this.logOnly) {
			logger.info('Analytics.identify', params);
			return;
		}

		if (this.isServerRuntime()) {
			if (!this.posthogNode) {
				logger.error('PostHog Node is not initialized');
				return;
			}
			// Server-side: posthog-node IdentifyMessage format
			const properties = {
				...(params.properties ? { $set: params.properties } : {}),
				...(params.propertiesSetOnce
					? { $set_once: params.propertiesSetOnce }
					: {}),
			};

			const identifyMessage: IdentifyMessage = {
				distinctId: params.distinctId,
				properties,
			};

			this.posthogNode.identify(identifyMessage);
		} else {
			if (!this.posthogBrowser) {
				logger.error('PostHog Browser is not initialized');
				return;
			}
			// Browser-side: posthog-js format
			this.posthogBrowser.identify(
				params.distinctId,
				params.properties,
				params.propertiesSetOnce,
			);
		}
	}

	captureException(params: CaptureExceptionParams): void {
		if (!this.initialized) {
			warnAnalyticsNotInitializedOnce();
			return;
		}

		if (this.logOnly) {
			logger.info('Analytics.captureException', params);
			return;
		}

		if (this.isServerRuntime()) {
			if (!this.posthogNode) {
				logger.error('PostHog Node is not initialized');
				return;
			}
			// Server-side: posthog-node format
			this.posthogNode.captureException(
				params.error,
				params.distinctId,
				params.additionalProperties,
			);
		} else {
			if (!this.posthogBrowser) {
				logger.error('PostHog Browser is not initialized');
				return;
			}
			// Browser-side: posthog-js format
			// Browser PostHog tracks distinctId automatically from session
			this.posthogBrowser.captureException(
				params.error,
				params.additionalProperties,
			);
		}
	}

	/**
	 * Shutdown the analytics client and flush any pending events.
	 * This is mainly useful on the server-side to ensure all events are sent before the process exits.
	 */
	async shutdown(): Promise<void> {
		if (this.isServerRuntime() && this.posthogNode) {
			await this.posthogNode._shutdown();
		}
	}
}
