import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	warn: vi.fn(),
}));

const nodeState = vi.hoisted(() => ({
	capture: vi.fn(),
	captureException: vi.fn(),
	identify: vi.fn(),
	_shutdown: vi.fn(),
}));

const browserState = vi.hoisted(() => ({
	capture: vi.fn(),
	captureException: vi.fn(),
	init: vi.fn(),
	identify: vi.fn(),
}));

vi.mock('../logger/iso-logger', () => ({
	logger: {
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: mocks.warn,
	},
}));

vi.mock('posthog-node', () => ({
	PostHog: vi.fn(() => nodeState),
}));

vi.mock('posthog-js', () => ({
	default: {
		capture: browserState.capture,
		captureException: browserState.captureException,
		identify: browserState.identify,
		init: browserState.init,
	},
}));

const loadAnalytics = async () => {
	vi.resetModules();
	vi.clearAllMocks();
	const module = await import('./iso-analytics');
	return module.IsoAnalytics;
};

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
});

describe('IsoAnalytics uninitialized warning', () => {
	test('warns only once per process across all uninitialized call sites', async () => {
		const IsoAnalytics = await loadAnalytics();
		const firstClient = new IsoAnalytics('token');
		const secondClient = new IsoAnalytics('token');

		firstClient.capture({ distinctId: 'user-1', event: 'event' });
		firstClient.identify({ distinctId: 'user-1' });
		firstClient.captureException({ error: new Error('failure') });
		secondClient.capture({ distinctId: 'user-2', event: 'event' });

		expect(mocks.warn).toHaveBeenCalledTimes(1);
		expect(mocks.warn).toHaveBeenCalledWith(
			'Analytics not initialized; skipping analytics calls (this warning will not repeat)',
		);
	});
});

describe('IsoAnalytics server path', () => {
	test('captures with posthog-node EventMessage', async () => {
		const IsoAnalytics = await loadAnalytics();
		const analytics = new IsoAnalytics('server-token', true);

		await analytics.init();
		analytics.capture({
			distinctId: 'user-1',
			event: 'server_event',
			properties: {
				action: 'create',
				value: 42,
			},
		});

		expect(nodeState.capture).toHaveBeenCalledWith({
			distinctId: 'user-1',
			event: 'server_event',
			properties: {
				action: 'create',
				value: 42,
			},
		});
		expect(browserState.capture).not.toHaveBeenCalled();
	});

	test('identifies with posthog-node IdentifyMessage properties', async () => {
		const IsoAnalytics = await loadAnalytics();
		const analytics = new IsoAnalytics('server-token', true);

		await analytics.init();
		analytics.identify({
			distinctId: 'user-1',
			properties: {
				email: 'x@example.com',
			},
			propertiesSetOnce: {
				source: 'migration',
			},
		});

		expect(nodeState.identify).toHaveBeenCalledWith({
			distinctId: 'user-1',
			properties: {
				$set: {
					email: 'x@example.com',
				},
				$set_once: {
					source: 'migration',
				},
			},
		});
		expect(browserState.identify).not.toHaveBeenCalled();
	});
});

describe('IsoAnalytics browser path', () => {
	test('captures and identifies with posthog-js', async () => {
		const IsoAnalytics = await loadAnalytics();
		const analytics = new IsoAnalytics('browser-token', false);

		await analytics.init();
		analytics.capture({
			distinctId: 'browser-user',
			event: 'browser_event',
			properties: {
				page: 'home',
			},
		});
		analytics.identify({
			distinctId: 'browser-user',
			properties: { name: 'Browser User' },
			propertiesSetOnce: { created_at: 'today' },
		});

		expect(browserState.capture).toHaveBeenCalledWith('browser_event', {
			page: 'home',
		});
		expect(browserState.identify).toHaveBeenCalledWith(
			'browser-user',
			{ name: 'Browser User' },
			{ created_at: 'today' },
		);
		expect(browserState.init).toHaveBeenCalledWith('browser-token', {
			api_host: 'https://us.i.posthog.com',
			capture_exceptions: true,
		});
		expect(nodeState.capture).not.toHaveBeenCalled();
		expect(nodeState.identify).not.toHaveBeenCalled();
	});
});
