import { SilentPostHog } from '@/shared/lib/posthog/silent-posthog';
import { logger } from '@/shared/lib/winston.server';
import { nanoid } from 'nanoid';
import type { AppLoadContext } from 'react-router';

export const getDevContext = (loadContext: AppLoadContext) => {
	let finalLoadContext: AppLoadContext;

	if (import.meta.env.DEV) {
		finalLoadContext = {
			logger: logger,
			postHogServer: new SilentPostHog(),
			___NONCE___: nanoid(),
			...(loadContext as Record<string, unknown>), // keep the original load context if there are any values in it
		};
	} else {
		finalLoadContext = loadContext;
	}

	return finalLoadContext;
};
