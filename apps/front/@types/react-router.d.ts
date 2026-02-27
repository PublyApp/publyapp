import type { IAnalytics } from '@org/shared-ts/lib/analytics/analytics.types';
import type { ILogger } from '@org/shared-ts/lib/logger/logger.types';

declare module 'react-router' {
	interface AppLoadContext {
		logger: ILogger;
		analytics: IAnalytics;
		nonce: string;
	}
}
