import type { AnalyticsEvent, IAnalytics } from '../analytics.types';

/** For tests: keeps every event it receives, already consented and masked. */
export class MemoryAnalyticsAdapter implements IAnalytics {
	readonly events: AnalyticsEvent[] = [];

	send(event: AnalyticsEvent): void {
		this.events.push(event);
	}

	clear(): void {
		this.events.length = 0;
	}
}
