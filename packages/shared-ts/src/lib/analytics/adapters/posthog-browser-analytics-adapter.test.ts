import { describe, expect, test, vi } from 'vitest';

import { PostHogBrowserAnalyticsAdapter } from './posthog-browser-analytics-adapter';

const createAdapter = () => {
	const init = vi.fn();
	const capture = vi.fn();
	const identify = vi.fn();
	const captureException = vi.fn();
	const load = vi.fn(async () => ({
		init,
		capture,
		identify,
		captureException,
	}));
	return {
		adapter: new PostHogBrowserAnalyticsAdapter('browser-token', load),
		capture,
		captureException,
		identify,
		init,
		load,
	};
};

describe('PostHogBrowserAnalyticsAdapter', () => {
	test('initializes posthog-js once with the PostHog host and exception capture', async () => {
		const { adapter, init, load } = createAdapter();

		await adapter.send({
			type: 'capture',
			distinctId: 'user-1',
			event: 'first',
		});
		await adapter.send({
			type: 'capture',
			distinctId: 'user-1',
			event: 'second',
		});

		expect(load).toHaveBeenCalledTimes(1);
		expect(init).toHaveBeenCalledTimes(1);
		expect(init).toHaveBeenCalledWith('browser-token', {
			api_host: 'https://us.i.posthog.com',
			capture_exceptions: true,
		});
	});

	test('captures with the event name and properties (the browser client owns the distinct id)', async () => {
		const { adapter, capture } = createAdapter();
		const properties = { page: 'home' };

		await adapter.send({
			type: 'capture',
			distinctId: 'browser-user',
			event: 'browser_event',
			properties,
		});

		expect(capture).toHaveBeenCalledWith('browser_event', properties);
		expect(capture).toHaveBeenCalledTimes(1);
	});

	test('identifies with the distinct id, properties and set-once properties', async () => {
		const { adapter, identify } = createAdapter();

		await adapter.send({
			type: 'identify',
			distinctId: 'browser-user',
			properties: { name: 'Browser User' },
			propertiesSetOnce: { created_at: 'today' },
		});

		expect(identify).toHaveBeenCalledWith(
			'browser-user',
			{ name: 'Browser User' },
			{ created_at: 'today' },
		);
	});

	test('translates an exception with its additional properties', async () => {
		const { adapter, captureException } = createAdapter();
		const error = new Error('failure');

		await adapter.send({
			type: 'exception',
			error,
			additionalProperties: { route: '/app' },
		});

		expect(captureException).toHaveBeenCalledWith(error, { route: '/app' });
	});
});
