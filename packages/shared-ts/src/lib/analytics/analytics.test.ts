import { describe, expect, test } from 'vitest';

import { MemoryAnalyticsAdapter } from './adapters/memory-analytics-adapter';
import { Analytics } from './analytics';
import type { AnalyticsEvent } from './analytics.types';

const capture = (): AnalyticsEvent => ({
	type: 'capture',
	distinctId: 'user-1',
	event: 'page_view',
	properties: {
		path: '/app',
		email: 'jane@example.com',
		contact: { note: 'mail bob@example.com' },
	},
});

const lastEvent = (adapter: MemoryAnalyticsAdapter): AnalyticsEvent => {
	const event = adapter.events.at(-1);
	if (!event) {
		throw new Error('expected the memory adapter to receive an event');
	}
	return event;
};

describe('Analytics', () => {
	test('sends capture, identify and exception through the one-method port', async () => {
		const adapter = new MemoryAnalyticsAdapter();
		const analytics = new Analytics(adapter);

		await analytics.send(capture());
		await analytics.send({
			type: 'identify',
			distinctId: 'user-1',
			properties: { plan: 'pro' },
			propertiesSetOnce: { source: 'migration' },
		});
		await analytics.send({
			type: 'exception',
			error: new Error('failure'),
			distinctId: 'user-1',
			additionalProperties: { route: '/app' },
		});

		expect(adapter.events.map((event) => event.type)).toEqual([
			'capture',
			'identify',
			'exception',
		]);
	});

	test('masks email values and sensitive keys once, before the adapter', async () => {
		const adapter = new MemoryAnalyticsAdapter();
		const analytics = new Analytics(adapter);

		await analytics.send(capture());
		const event = lastEvent(adapter);
		if (event.type !== 'capture') {
			throw new Error('expected a capture event');
		}

		expect(event.properties).toEqual({
			path: '/app',
			email: '[REDACTED]',
			contact: { note: 'mail [redacted-email]' },
		});
	});

	test('masks identify properties and exception messages too', async () => {
		const adapter = new MemoryAnalyticsAdapter();
		const analytics = new Analytics(adapter);

		await analytics.send({
			type: 'identify',
			distinctId: 'user-1',
			properties: { email: 'jane@example.com', plan: 'pro' },
		});
		await analytics.send({
			type: 'exception',
			error: new Error('failed for jane@example.com'),
		});

		const identify = adapter.events[0];
		const exception = adapter.events[1];
		if (identify?.type !== 'identify' || exception?.type !== 'exception') {
			throw new Error('expected identify then exception');
		}

		expect(identify.properties).toEqual({
			email: '[REDACTED]',
			plan: 'pro',
		});
		expect(exception.error).toBeInstanceOf(Error);
		expect((exception.error as Error).message).toBe(
			'failed for [redacted-email]',
		);
	});

	test('masks an e-mail-looking distinct id before the adapter sees it', async () => {
		const adapter = new MemoryAnalyticsAdapter();
		const analytics = new Analytics(adapter);

		await analytics.send({
			type: 'identify',
			distinctId: 'jane@example.com',
			properties: { plan: 'pro' },
		});
		await analytics.send({
			type: 'exception',
			error: new Error('failure'),
			distinctId: 'john@example.com',
		});

		const identify = adapter.events[0];
		const exception = adapter.events[1];
		if (identify?.type !== 'identify' || exception?.type !== 'exception') {
			throw new Error('expected identify then exception');
		}

		expect(identify.distinctId).toBe('[redacted-email]');
		expect(exception.distinctId).toBe('[redacted-email]');
	});

	test('keeps a non-email distinct id unchanged', async () => {
		const adapter = new MemoryAnalyticsAdapter();
		const analytics = new Analytics(adapter);

		await analytics.send(capture());

		const event = lastEvent(adapter);
		expect(event.distinctId).toBe('user-1');
	});

	test('does not touch the adapter without consent', async () => {
		const adapter = new MemoryAnalyticsAdapter();
		let consented = false;
		const analytics = new Analytics(adapter, () => consented);

		await expect(analytics.send(capture())).resolves.toBe(false);
		expect(adapter.events).toHaveLength(0);

		consented = true;
		await expect(analytics.send(capture())).resolves.toBe(true);
		expect(adapter.events).toHaveLength(1);
	});

	test('never throws into the caller when the consent provider throws', async () => {
		const adapter = new MemoryAnalyticsAdapter();
		const analytics = new Analytics(adapter, () => {
			throw new Error('consent store unavailable');
		});

		await expect(analytics.send(capture())).resolves.toBe(false);
		expect(adapter.events).toHaveLength(0);
	});

	test('never throws into the caller when the adapter throws', async () => {
		const analytics = new Analytics({
			send: () => {
				throw new Error('provider down');
			},
		});

		await expect(analytics.send(capture())).resolves.toBe(false);
	});
});
