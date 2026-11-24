import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { AnalyticsEvent } from '@org/shared-ts/lib/analytics/analytics.types';

const mocks = vi.hoisted(() => ({
	browserConstruct: vi.fn(),
	browserSend: vi.fn(),
	consent: {
		value: { functional: true, analytics: false, marketing: false },
	},
	error: vi.fn(),
	info: vi.fn(),
	isServer: { value: false },
	nodeConstruct: vi.fn(),
	nodeSend: vi.fn(),
	token: { value: 'browser-token' as string | undefined },
}));

vi.mock('@org/shared-ts/lib/logger/iso-logger', () => ({
	logger: {
		debug: vi.fn(),
		error: mocks.error,
		info: mocks.info,
		warn: vi.fn(),
	},
}));

vi.mock('@org/shared-ts/lib/constants', () => ({
	get isServer() {
		return mocks.isServer.value;
	},
}));

vi.mock('../env', () => ({
	getPublicEnv: () => ({ posthogProjectToken: mocks.token.value }),
}));

vi.mock('../store/cookie-consent-store', () => ({
	useCookieConsentStore: {
		getState: () => ({ consent: mocks.consent.value }),
	},
}));

vi.mock(
	'@org/shared-ts/lib/analytics/adapters/posthog-browser-analytics-adapter',
	() => ({
		PostHogBrowserAnalyticsAdapter: class {
			constructor(apiKey: string) {
				mocks.browserConstruct(apiKey);
			}
			send(event: AnalyticsEvent) {
				return mocks.browserSend(event);
			}
		},
	}),
);

vi.mock(
	'@org/shared-ts/lib/analytics/adapters/posthog-node-analytics-adapter',
	() => ({
		PostHogNodeAnalyticsAdapter: class {
			constructor(apiKey: string) {
				mocks.nodeConstruct(apiKey);
			}
			send(event: AnalyticsEvent) {
				return mocks.nodeSend(event);
			}
		},
	}),
);

const event: AnalyticsEvent = {
	type: 'capture',
	distinctId: 'user-1',
	event: 'page_view',
};

const loadService = async () => {
	vi.resetModules();
	const { getAnalytics } = await import('./analytics-instance');
	return getAnalytics();
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.isServer.value = false;
	mocks.token.value = 'browser-token';
	mocks.consent.value = {
		functional: true,
		analytics: false,
		marketing: false,
	};
});

describe('getAnalytics wiring', () => {
	test('browser: builds the browser adapter with the token and follows only the analytics consent category', async () => {
		const analytics = await loadService();

		expect(mocks.browserConstruct).toHaveBeenCalledWith('browser-token');
		expect(mocks.nodeConstruct).not.toHaveBeenCalled();
		expect(analytics.logOnly).toBe(false);

		// `functional` is true: reading the wrong store field would send here.
		await analytics.send(event);
		expect(mocks.browserSend).not.toHaveBeenCalled();

		mocks.consent.value = {
			functional: false,
			analytics: true,
			marketing: false,
		};
		await analytics.send(event);
		expect(mocks.browserSend).toHaveBeenCalledWith(event);
	});

	test('browser: no token means log-only and nothing reaches the adapter', async () => {
		mocks.token.value = undefined;
		const analytics = await loadService();

		expect(mocks.browserConstruct).toHaveBeenCalledWith('');
		expect(analytics.logOnly).toBe(true);

		mocks.consent.value = {
			functional: true,
			analytics: true,
			marketing: true,
		};
		await analytics.send(event);

		expect(mocks.browserSend).not.toHaveBeenCalled();
	});

	test('server: builds the node adapter and does not gate operational analytics on cookie consent', async () => {
		mocks.isServer.value = true;
		mocks.token.value = 'server-token';
		mocks.consent.value = {
			functional: false,
			analytics: false,
			marketing: false,
		};
		const analytics = await loadService();

		expect(mocks.nodeConstruct).toHaveBeenCalledWith('server-token');
		expect(mocks.browserConstruct).not.toHaveBeenCalled();
		expect(analytics.logOnly).toBe(false);

		await analytics.send(event);
		expect(mocks.nodeSend).toHaveBeenCalledWith(event);
	});
});
