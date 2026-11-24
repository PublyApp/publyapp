import { logger } from '../logger/iso-logger';
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

	async send(event: AnalyticsEvent): Promise<void> {
		if (!this.#hasConsent()) {
			return;
		}

		try {
			const masked = maskAnalyticsEvent(event);
			if (this.logOnly) {
				logger.info(`Analytics.${event.type}`, masked);
				return;
			}
			await this.#adapter.send(masked);
		} catch {
			// Analytics must never break the request that produced the event.
			logger.error('Analytics send failed', { type: event.type });
		}
	}
}
