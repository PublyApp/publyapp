import type { SimplePostHog } from '@org/shared/lib/posthog/posthog.types';

declare module 'react-router' {
	interface AppLoadContext {
		logger?: (...args: unknown[]) => void;
		postHogServer?: SimplePostHog;
	}
}
