import { logger, toLogError } from '@org/shared-ts/lib/logger';

import { maskAnalyticsEvent } from './analytics-masking';
import type {
	AnalyticsConsent,
	AnalyticsEvent,
	IAnalytics,
} from './analytics.types';

const ALWAYS_CONSENTED: AnalyticsConsent = () => true;

/**
 * The service business code calls: one place decides consent, masks personal
 * data and contains adapter failures. Adapters only translate to their vendor.
 */
export class Analytics {
	readonly #adapter: IAnalytics;
	readonly #hasConsent: AnalyticsConsent;
	/** Test/development mode: log the masked event instead of sending it. */
	logOnly = false;

	constructor(
		adapter: IAnalytics,
		hasConsent: AnalyticsConsent = ALWAYS_CONSENTED,
	) {
		this.#adapter = adapter;
		this.#hasConsent = hasConsent;
	}

	/** `false` means nothing was sent: no consent, or the adapter failed. */
	async send(event: AnalyticsEvent): Promise<boolean> {
		try {
			// A throwing consent provider is a side effect failure like any other;
			// it must not reject the request that produced the event.
			if (!this.#hasConsent()) {
				return false;
			}

			const masked = maskAnalyticsEvent(event);
			if (this.logOnly) {
				logger.info(
					`Analytics.${event.type}`,
					'error' in masked
						? { ...masked, error: toLogError(masked.error) }
						: masked,
				);
				return true;
			}
			await this.#adapter.send(masked);
			return true;
		} catch {
			// Analytics must never break the request that produced the event.
			logger.error('Analytics send failed', { type: event.type });
			return false;
		}
	}
}
