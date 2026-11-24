import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { resolveSink } from '../index';
import type { LogEntry } from '../logger.contract';
import { BrowserProdSink } from '../sinks/browser-prod.sink';
import { JsonStdoutSink } from '../sinks/json-stdout.sink';
import { MemorySink } from '../sinks/memory.sink';
import { PrettyConsoleSink } from '../sinks/pretty-console.sink';

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
	level: 'info',
	message: 'm',
	time: new Date('2026-11-24T10:00:00Z'),
	...over,
});

describe('JsonStdoutSink', () => {
	const make = () => {
		const out = vi.fn();
		const hooks = new EventEmitter();
		return { out, hooks, sink: new JsonStdoutSink(out, hooks) };
	};

	it('writes one parseable JSON line with time, level, message, meta', async () => {
		const { out, sink } = make();
		sink.write(entry({ level: 'warn', meta: { a: 1 } }));
		await Promise.resolve();
		const line = out.mock.calls[0]?.[0] as string;
		expect(line.endsWith('\n')).toBe(true);
		expect(line).not.toContain('\u001B');
		expect(JSON.parse(line)).toEqual({
			time: '2026-11-24T10:00:00.000Z',
			level: 'warn',
			message: 'm',
			a: 1,
		});
	});

	it('keeps time, level and message authoritative over meta', async () => {
		const { out, sink } = make();
		sink.write(entry({ meta: { level: 'x', message: 'y' } }));
		await Promise.resolve();
		expect(JSON.parse(out.mock.calls[0]?.[0] as string)).toMatchObject({
			level: 'info',
			message: 'm',
		});
	});

	it('does not write a burst one by one: one batch after the caller yields', async () => {
		const { out, sink } = make();
		for (let i = 0; i < 1000; i++) {
			sink.write(entry({ message: `m${i}` }));
		}
		expect(out).not.toHaveBeenCalled();
		await Promise.resolve();
		expect(out).toHaveBeenCalledTimes(1);
		expect((out.mock.calls[0]?.[0] as string).trim().split('\n')).toHaveLength(
			1000,
		);
	});

	it('flushes everything synchronously on error', () => {
		const { out, sink } = make();
		sink.write(entry());
		sink.write(entry({ level: 'error', meta: { err: { stack: 'trace' } } }));
		expect(out).toHaveBeenCalledTimes(1);
		const lines = (out.mock.calls[0]?.[0] as string).trim().split('\n');
		expect(lines).toHaveLength(2);
		expect(JSON.parse(lines[1] as string)).toMatchObject({
			level: 'error',
			err: { stack: 'trace' },
		});
	});

	it.each(['beforeExit', 'exit'])('flushes on %s', (event) => {
		const { out, hooks, sink } = make();
		sink.write(entry());
		hooks.emit(event);
		expect(out).toHaveBeenCalledTimes(1);
	});
});

describe('MemorySink', () => {
	it('keeps entries and clears', () => {
		const sink = new MemorySink();
		sink.write(entry());
		expect(sink.entries).toHaveLength(1);
		sink.clear();
		expect(sink.entries).toHaveLength(0);
	});
});

describe('console sinks', () => {
	it('pretty sink writes the message and expands meta', () => {
		const log = vi.spyOn(console, 'info').mockImplementation(() => {});
		const dir = vi.spyOn(console, 'dir').mockImplementation(() => {});
		new PrettyConsoleSink().write(entry({ meta: { a: 1 } }));
		expect(log.mock.calls[0]?.[0]).toContain('m');
		expect(dir).toHaveBeenCalledWith({ a: 1 }, expect.anything());
		vi.restoreAllMocks();
	});

	it('browser prod sink only writes warn and error', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const info = vi.spyOn(console, 'info').mockImplementation(() => {});
		const sink = new BrowserProdSink();
		sink.write(entry({ level: 'info' }));
		sink.write(entry({ level: 'warn' }));
		expect(info).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledWith('m');
		vi.restoreAllMocks();
	});
});

describe('resolveSink', () => {
	it('LOG_SINK forces a sink, any other value falls back to automatic', () => {
		expect(
			resolveSink({ NODE_ENV: 'production', LOG_SINK: 'pretty' }),
		).toBeInstanceOf(PrettyConsoleSink);
		expect(
			resolveSink({ NODE_ENV: 'development', LOG_SINK: 'json' }),
		).toBeInstanceOf(JsonStdoutSink);
		expect(resolveSink({ NODE_ENV: 'test', LOG_SINK: 'bogus' })).toBeInstanceOf(
			MemorySink,
		);
		expect(
			resolveSink({ NODE_ENV: 'test', LOG_SINK: 'toString' }),
		).toBeInstanceOf(MemorySink);
	});

	it('picks the dev sink only outside production, memory in tests', () => {
		expect(resolveSink({ NODE_ENV: 'development' })).toBeInstanceOf(
			PrettyConsoleSink,
		);
		expect(resolveSink({ NODE_ENV: 'test' })).toBeInstanceOf(MemorySink);
		expect(resolveSink({ NODE_ENV: 'production' })).toBeInstanceOf(
			JsonStdoutSink,
		);
	});
});
