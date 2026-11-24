import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrowserConsoleLoggerAdapter } from '../adapters/browser-console-logger-adapter';
import { JsonLoggerAdapter } from '../adapters/json-logger-adapter';
import { MemoryLoggerAdapter } from '../adapters/memory-logger-adapter';
import { resolveAdapter } from '../index.browser';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('browser entry resolveAdapter', () => {
	it('uses memory in tests and the sober console adapter in production', () => {
		expect(resolveAdapter({ NODE_ENV: 'test' })).toBeInstanceOf(
			MemoryLoggerAdapter,
		);
		expect(resolveAdapter({ NODE_ENV: 'production' })).toBeInstanceOf(
			BrowserConsoleLoggerAdapter,
		);
	});

	it('logs synchronously in development, grouped with expanded meta', () => {
		const group = vi
			.spyOn(console, 'group')
			.mockImplementation(() => undefined);
		const dir = vi.spyOn(console, 'dir').mockImplementation(() => undefined);
		const groupEnd = vi
			.spyOn(console, 'groupEnd')
			.mockImplementation(() => undefined);
		const adapter = resolveAdapter({ NODE_ENV: 'development' });

		expect(adapter).toBeInstanceOf(BrowserConsoleLoggerAdapter);
		// no await: the adapter must accept the very first call after import
		adapter.write({
			level: 'info',
			message: 'first',
			meta: { a: 1 },
			time: new Date(),
		});

		expect(group).toHaveBeenCalledWith(
			expect.stringContaining('first'),
			expect.any(String),
			expect.any(String),
		);
		expect(dir).toHaveBeenCalledWith(
			{ a: 1 },
			{ depth: Number.POSITIVE_INFINITY, colors: true },
		);
		expect(groupEnd).toHaveBeenCalledOnce();
	});

	it('keeps JSON forcing and falls back from winston to the console', () => {
		expect(
			resolveAdapter({ NODE_ENV: 'test', LOG_ADAPTER: 'json' }),
		).toBeInstanceOf(JsonLoggerAdapter);
		expect(
			resolveAdapter({ NODE_ENV: 'development', LOG_ADAPTER: 'winston' }),
		).toBeInstanceOf(BrowserConsoleLoggerAdapter);
	});
});
