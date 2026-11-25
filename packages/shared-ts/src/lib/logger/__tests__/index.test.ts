import { describe, expect, it } from 'vitest';

import { BrowserConsoleLoggerAdapter } from '../adapters/browser-console-logger-adapter';
import { MemoryLoggerAdapter } from '../adapters/memory-logger-adapter';
import { StdoutJsonLoggerAdapter } from '../adapters/stdout-json-logger-adapter';
import { WinstonLoggerAdapter } from '../adapters/winston-logger-adapter';
import { resolveAdapter } from '../index';

describe('resolveAdapter', () => {
	it('uses memory in tests and winston in development', () => {
		expect(resolveAdapter({ NODE_ENV: 'test' })).toBeInstanceOf(
			MemoryLoggerAdapter,
		);
		expect(resolveAdapter({ NODE_ENV: 'development' }, true)).toBeInstanceOf(
			WinstonLoggerAdapter,
		);
	});

	it('uses JSON on the production server and plain console in the browser', () => {
		expect(resolveAdapter({ NODE_ENV: 'production' }, true)).toBeInstanceOf(
			StdoutJsonLoggerAdapter,
		);
		expect(resolveAdapter({ NODE_ENV: 'production' }, false)).toBeInstanceOf(
			BrowserConsoleLoggerAdapter,
		);
	});

	it('LOG_ADAPTER forces winston or json', () => {
		expect(
			resolveAdapter({ NODE_ENV: 'production', LOG_ADAPTER: 'winston' }, true),
		).toBeInstanceOf(WinstonLoggerAdapter);
		expect(
			resolveAdapter({ NODE_ENV: 'test', LOG_ADAPTER: 'json' }, true),
		).toBeInstanceOf(StdoutJsonLoggerAdapter);
	});

	it('an unknown LOG_ADAPTER falls back to the automatic choice', () => {
		expect(
			resolveAdapter({ NODE_ENV: 'test', LOG_ADAPTER: 'toString' }, true),
		).toBeInstanceOf(MemoryLoggerAdapter);
		expect(
			resolveAdapter({ NODE_ENV: 'production', LOG_ADAPTER: 'bogus' }, true),
		).toBeInstanceOf(StdoutJsonLoggerAdapter);
	});
});
