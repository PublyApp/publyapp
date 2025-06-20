import type { SimplePostHog } from './posthog.types';

/**
 * SilentPostHog is a PostHog client that does not send any data.
 * It is used when in local.
 */
export class SilentPostHog implements SimplePostHog {
	capture() {
		/* do nothing */
	}
	identify() {
		/* do nothing */
	}
	captureException() {
		/* do nothing */
	}
}
