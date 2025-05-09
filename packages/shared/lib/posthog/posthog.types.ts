import type { PostHog } from 'posthog-node';

export type SimplePostHog = Pick<
	PostHog,
	'capture' | 'identify' | 'captureException'
>;
