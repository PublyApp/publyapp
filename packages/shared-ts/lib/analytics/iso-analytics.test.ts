import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	warn: vi.fn(),
}));

const constantsState = vi.hoisted(() => ({
	isServer: false,
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

vi.mock('../constants', () => ({
	get isServer() {
		return constantsState.isServer;
	},
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
	PostHog: vi.fn(function () {
		return nodeState;
	}),
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
	vi.clearAllMocks();
	const { IsoAnalytics } = await import('./iso-analytics');

	const setServerRuntime = (isServerRuntime: boolean): void => {
		constantsState.isServer = isServerRuntime;
	};

	return { IsoAnalytics, setServerRuntime };
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('IsoAnalytics uninitialized warning', () => {
	test('warns only once per process across all uninitialized call sites', async () => {
		const { IsoAnalytics } = await loadAnalytics();
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
		const { IsoAnalytics, setServerRuntime } = await loadAnalytics();
		const analytics = new IsoAnalytics('server-token');
		setServerRuntime(true);
		expect(constantsState.isServer).toBe(true);

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
		const { IsoAnalytics, setServerRuntime } = await loadAnalytics();
		const analytics = new IsoAnalytics('server-token');
		setServerRuntime(true);
		expect(constantsState.isServer).toBe(true);

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

	test('awaits server shutdown', async () => {
		const { IsoAnalytics, setServerRuntime } = await loadAnalytics();
		const analytics = new IsoAnalytics('server-token');
		setServerRuntime(true);
		expect(constantsState.isServer).toBe(true);
		nodeState._shutdown.mockResolvedValue(undefined);

		await analytics.init();
		await analytics.shutdown();

		expect(nodeState._shutdown).toHaveBeenCalledTimes(1);
	});
});

describe('IsoAnalytics browser path', () => {
	test('captures and identifies with posthog-js', async () => {
		const { IsoAnalytics, setServerRuntime } = await loadAnalytics();
		const analytics = new IsoAnalytics('browser-token');
		setServerRuntime(false);
		expect(constantsState.isServer).toBe(false);

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
