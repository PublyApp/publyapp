// export { };
import type { SimplePostHog } from '@org/shared/lib/posthog/posthog.types';
import type { logger } from '@org/shared/lib/winston.server';

declare module 'react-router' {
	interface AppLoadContext {
		logger: typeof logger;
		postHogServer: SimplePostHog;
	}
}
