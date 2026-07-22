import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	warn: vi.fn(),
}));

vi.mock('../logger/iso-logger', () => ({
	logger: {
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: mocks.warn,
	},
}));

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
});

describe('IsoAnalytics uninitialized warning', () => {
	test('warns only once per process across all uninitialized call sites', async () => {
		const { IsoAnalytics } = await import('./iso-analytics');
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
