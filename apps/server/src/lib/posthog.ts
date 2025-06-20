import { SilentPostHog } from '@org/shared/lib/posthog/silent-posthog';
import { PostHog } from 'posthog-node';
import { env } from './env';

/**
 * PostHog client that sends data to PostHog.
 * It is used when in production.
 */

export const postHogServer = (() => {
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
