import { PostHog } from 'posthog-node';
import { env } from './env';

type SimplePostHog = Pick<PostHog, 'capture' | 'identify' | 'captureException'>;

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
