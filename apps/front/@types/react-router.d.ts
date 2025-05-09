import type { SimplePostHog } from '@/shared/lib/posthog/posthog.types';

declare module 'react-router' {
	interface AppLoadContext {
		logger?: (...args: unknown[]) => void;
		postHogServer?: typeof SimplePostHog;
	}
}
