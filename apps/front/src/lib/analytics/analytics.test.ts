import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	debug: vi.fn(),
	error: vi.fn(),
	isProductionRuntime: vi.fn(() => true),
	send: vi.fn(async () => true),
	warn: vi.fn(),
}));

vi.mock('@org/shared-ts/lib/logger', () => ({
	logger: {
		debug: mocks.debug,
		error: mocks.error,
		info: vi.fn(),
		warn: mocks.warn,
	},
}));

vi.mock('./analytics-instance', () => ({
	getAnalytics: () => ({ send: mocks.send }),
}));

vi.mock('../env', () => ({
	isProductionRuntime: mocks.isProductionRuntime,
}));

const captureStatus = async (status: number): Promise<void> => {
	const { captureBadRequest } = await import('./analytics');
	await captureBadRequest({
		request: new Request('https://app.example.test/path', {
			headers: { 'x-real-ip': '203.0.113.7' },
		}),
		status,
		path: '/path',
		method: 'GET',
		locale: 'en',
	});
};

const hashedAddress = createHash('sha256')
	.update('203.0.113.7')
	.digest('hex')
	.slice(0, 16);

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mocks.isProductionRuntime.mockReturnValue(true);
});

describe('captureBadRequest policy', () => {
	test('drops 404 responses before analytics without logging', async () => {
		await captureStatus(404);

		expect(mocks.send).not.toHaveBeenCalled();
		expect(mocks.debug).not.toHaveBeenCalled();
		expect(mocks.error).not.toHaveBeenCalled();
		expect(mocks.warn).not.toHaveBeenCalled();
	});

	test('sends the same bad_request event for a 5xx and confirms at error level', async () => {
		await captureStatus(503);

		expect(mocks.send).toHaveBeenCalledWith({
			type: 'capture',
			distinctId: hashedAddress,
			event: 'bad_request',
			properties: { path: '/path', method: 'GET', status: 503, locale: 'en' },
		});
		expect(mocks.error).toHaveBeenCalledWith('bad-request analytics captured', {
			path: '/path',
			status: 503,
		});
	});

	test('sends the same event for a 4xx and confirms at debug level', async () => {
		await captureStatus(422);

		expect(mocks.send).toHaveBeenCalledWith({
			type: 'capture',
			distinctId: hashedAddress,
			event: 'bad_request',
			properties: { path: '/path', method: 'GET', status: 422, locale: 'en' },
		});
		expect(mocks.debug).toHaveBeenCalledWith('bad-request analytics captured', {
			path: '/path',
			status: 422,
		});
		expect(mocks.error).not.toHaveBeenCalled();
	});

	test('drops everything outside production before creating an event', async () => {
		mocks.isProductionRuntime.mockReturnValue(false);

		await captureStatus(503);

		expect(mocks.send).not.toHaveBeenCalled();
	});

	test('does not log a success line when the service reports the send failed', async () => {
		mocks.send.mockResolvedValueOnce(false);

		await captureStatus(503);

		expect(mocks.send).toHaveBeenCalledTimes(1);
		expect(mocks.error).not.toHaveBeenCalled();
		expect(mocks.debug).not.toHaveBeenCalled();
		expect(mocks.warn).not.toHaveBeenCalled();
	});
});
