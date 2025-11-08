import type { PostHogConfig, Properties } from 'posthog-js';
import type { PostHog } from 'posthog-node';
import { isServer } from '../constants';
import { isoLogger } from '../logger/iso-logger';
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
			isoLogger.info('Analytics.init', 'log only mode');
			this.initialized = true;
			return;
		}

		try {
			if (isServer) {
				await this.initServer();
			} else {
				await this.initBrowser();
			}
			this.initialized = true;
		} catch (error) {
			isoLogger.error('Failed to initialize analytics', error);
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
			isoLogger.warn('Analytics not initialized, skipping capture event');
			return;
		}

		if (this.logOnly) {
			isoLogger.info('Analytics.capture', params);
			return;
		}

		if (isServer) {
			if (!this.posthogNode) {
				isoLogger.error('PostHog Node is not initialized');
				return;
			}
			// Server-side: posthog-node EventMessage format
			this.posthogNode.capture({
				distinctId: params.distinctId,
				event: params.event,
				properties: params.properties,
			});
		} else {
			if (!this.posthogBrowser) {
				isoLogger.error('PostHog Browser is not initialized');
				return;
			}
			// Browser-side: posthog-js format
			// Note: Browser PostHog automatically tracks distinctId, but we can set it via identify first
			this.posthogBrowser.capture(params.event, params.properties);
		}
	}

	identify(params: IdentifyUserParams): void {
		if (!this.initialized) {
			isoLogger.warn('Analytics not initialized, skipping identify user');
			return;
		}

		if (this.logOnly) {
			isoLogger.info('Analytics.identify', params);
			return;
		}

		if (isServer) {
			if (!this.posthogNode) {
				isoLogger.error('PostHog Node is not initialized');
				return;
			}
			// Server-side: posthog-node IdentifyMessage format
			const properties = {
				...params.properties,
				...(params.propertiesSetOnce
					? { $set_once: params.propertiesSetOnce }
					: {}),
			};

			this.posthogNode.identify({
				distinctId: params.distinctId,
				properties,
			});
		} else {
			if (!this.posthogBrowser) {
				isoLogger.error('PostHog Browser is not initialized');
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
			isoLogger.warn('Analytics not initialized, skipping capture exception');
			return;
		}

		if (this.logOnly) {
			isoLogger.info('Analytics.captureException', params);
			return;
		}

		if (isServer) {
			if (!this.posthogNode) {
				isoLogger.error('PostHog Node is not initialized');
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
				isoLogger.error('PostHog Browser is not initialized');
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
		if (isServer && this.posthogNode) {
			await this.posthogNode.shutdown();
		}
	}
}
