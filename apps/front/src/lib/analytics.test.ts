import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	capture: vi.fn(),
	constructedTokens: [] as string[],
	debug: vi.fn(),
	error: vi.fn(),
	getPublicEnv: vi.fn(() => ({
		apiBaseUrl: 'https://api.example.test',
		posthogProjectToken: 'project-token',
	})),
	info: vi.fn(),
	init: vi.fn(async () => undefined),
	isProductionRuntime: vi.fn(() => true),
	warn: vi.fn(),
}));

vi.mock('@org/shared-ts/lib/analytics/iso-analytics', () => ({
	IsoAnalytics: class {
		public logOnly = false;

		public constructor(token: string) {
			mocks.constructedTokens.push(token);
		}

		public init = mocks.init;
		public capture = mocks.capture;
	},
}));

vi.mock('@org/shared-ts/lib/logger/iso-logger', () => ({
	logger: {
		debug: mocks.debug,
		error: mocks.error,
		info: mocks.info,
		warn: mocks.warn,
	},
}));

vi.mock('./env', () => ({
	getPublicEnv: mocks.getPublicEnv,
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

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mocks.constructedTokens.length = 0;
	mocks.getPublicEnv.mockReturnValue({
		apiBaseUrl: 'https://api.example.test',
		posthogProjectToken: 'project-token',
	});
	mocks.isProductionRuntime.mockReturnValue(true);
});

describe('captureBadRequest status policy', () => {
	test('drops 404 responses before analytics initialization without logging', async () => {
		await captureStatus(404);

		expect(mocks.getPublicEnv).not.toHaveBeenCalled();
		expect(mocks.constructedTokens).toEqual([]);
		expect(mocks.capture).not.toHaveBeenCalled();
		expect(mocks.debug).not.toHaveBeenCalled();
		expect(mocks.error).not.toHaveBeenCalled();
		expect(mocks.info).not.toHaveBeenCalled();
		expect(mocks.warn).not.toHaveBeenCalled();
	});

	test('captures 5xx responses and confirms them at error level', async () => {
		await captureStatus(503);

		expect(mocks.capture).toHaveBeenCalledWith(
			expect.objectContaining({ event: 'bad_request' }),
		);
		expect(mocks.error).toHaveBeenCalledWith('bad-request analytics captured', {
			path: '/path',
			status: 503,
		});
	});

	test('captures other 4xx responses and confirms them at debug level', async () => {
		await captureStatus(422);

		expect(mocks.capture).toHaveBeenCalledWith(
			expect.objectContaining({ event: 'bad_request' }),
		);
		expect(mocks.debug).toHaveBeenCalledWith('bad-request analytics captured', {
			path: '/path',
			status: 422,
		});
		expect(mocks.error).not.toHaveBeenCalled();
	});
});
