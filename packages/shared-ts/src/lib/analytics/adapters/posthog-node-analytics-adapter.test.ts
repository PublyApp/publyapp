import { describe, expect, test, vi } from 'vitest';

import {
	PostHogNodeAnalyticsAdapter,
	type PostHogNodeClient,
} from './posthog-node-analytics-adapter';

const createClient = (): PostHogNodeClient => ({
	capture: vi.fn(),
	identify: vi.fn(),
	captureException: vi.fn(),
});

const createAdapter = () => {
	const client = createClient();
	const factory = vi.fn(async () => client);
	return {
		adapter: new PostHogNodeAnalyticsAdapter('server-token', factory),
		client,
		factory,
	};
};

describe('PostHogNodeAnalyticsAdapter', () => {
	test('constructs the client once with the PostHog host and exception autocapture', async () => {
		const { adapter, factory } = createAdapter();

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

		expect(factory).toHaveBeenCalledTimes(1);
		expect(factory).toHaveBeenCalledWith('server-token', {
			host: 'https://us.i.posthog.com',
			enableExceptionAutocapture: true,
		});
	});

	test('translates a capture to a posthog-node EventMessage', async () => {
		const { adapter, client } = createAdapter();
		const properties = { path: '/app', status: 422 };

		await adapter.send({
			type: 'capture',
			distinctId: 'user-1',
			event: 'server_event',
			properties,
		});

		expect(client.capture).toHaveBeenCalledWith({
			distinctId: 'user-1',
			event: 'server_event',
			properties,
		});
	});

	test('translates identify properties to $set and $set_once', async () => {
		const { adapter, client } = createAdapter();

		await adapter.send({
			type: 'identify',
			distinctId: 'user-1',
			properties: { email: 'x@example.com' },
			propertiesSetOnce: { source: 'migration' },
		});

		expect(client.identify).toHaveBeenCalledWith({
			distinctId: 'user-1',
			properties: {
				$set: { email: 'x@example.com' },
				$set_once: { source: 'migration' },
			},
		});
		expect(client.capture).not.toHaveBeenCalled();
	});

	test('translates an exception with its distinct id and extra properties', async () => {
		const { adapter, client } = createAdapter();
		const error = new Error('failure');

		await adapter.send({
			type: 'exception',
			error,
			distinctId: 'user-1',
			additionalProperties: { route: '/app' },
		});

		expect(client.captureException).toHaveBeenCalledWith(error, 'user-1', {
			route: '/app',
		});
	});
});
