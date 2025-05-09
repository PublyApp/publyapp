import { PostHog } from 'posthog-node';
import { env } from './env';
import type { SimplePostHog } from '@org/shared/lib/posthog/posthog.types';

/**
 * PostHog client that sends data to PostHog.
 * It is used when in production.
 */

/**
 * SilentPostHog is a PostHog client that does not send any data.
 * It is used when in local.
 */
class SilentPostHog implements SimplePostHog {
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

export const posthogClient = (() => {
	if (env.LOCAL) {
		return new SilentPostHog();
	}

	return new PostHog(
		'phc_oiBblxKhyJ8J0DXilNErvra0rPtLdTZytGSSD5OT5lx', // move API key to .env files
		{
			host: 'https://us.i.posthog.com',
			enableExceptionAutocapture: true,
		},
	);
})();
