import type { IAnalytics } from '@org/shared/lib/analytics/analytics.types';
import type { logger } from '@org/shared/lib/logger/winston.server';

declare module 'react-router' {
	interface AppLoadContext {
		logger: typeof logger;
		analytics: IAnalytics;
		nonce: string;
	}
}
