import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { JsonLoggerAdapter } from '../adapters/json-logger-adapter';
import type { LogEntry } from '../logger.types';

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
	level: 'info',
	message: 'm',
	time: new Date('2026-11-24T10:00:00Z'),
	...over,
});

const make = () => {
	const out = vi.fn<(chunk: string) => void>();
	const hooks = new EventEmitter();
	return { out, hooks, adapter: new JsonLoggerAdapter(out, hooks) };
};

describe('JsonLoggerAdapter', () => {
	it('writes one parseable JSON line with time, level, message, meta', async () => {
		const { out, adapter } = make();
		adapter.write(entry({ level: 'warn', meta: { a: 1 } }));
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
		const { out, adapter } = make();
		adapter.write(entry({ meta: { level: 'x', message: 'y' } }));
		await Promise.resolve();
		expect(JSON.parse(out.mock.calls[0]?.[0] as string)).toMatchObject({
			level: 'info',
			message: 'm',
		});
	});

	it('does not block: a burst is written as one batch after the caller yields', async () => {
		const { out, adapter } = make();
		for (let i = 0; i < 1000; i++) {
			adapter.write(entry({ message: `m${i}` }));
		}
		expect(out).not.toHaveBeenCalled();
		await Promise.resolve();
		expect(out).toHaveBeenCalledTimes(1);
		expect((out.mock.calls[0]?.[0] as string).trim().split('\n')).toHaveLength(
			1000,
		);
	});

	it('flushes everything synchronously on error', () => {
		const { out, adapter } = make();
		adapter.write(entry());
		adapter.write(entry({ level: 'error', meta: { err: { stack: 'trace' } } }));
		expect(out).toHaveBeenCalledTimes(1);
		const lines = (out.mock.calls[0]?.[0] as string).trim().split('\n');
		expect(lines).toHaveLength(2);
		expect(JSON.parse(lines[1] as string)).toMatchObject({
			level: 'error',
			err: { stack: 'trace' },
		});
	});

	it.each(['beforeExit', 'exit'])('flushes on %s', (event) => {
		const { out, hooks, adapter } = make();
		adapter.write(entry());
		hooks.emit(event);
		expect(out).toHaveBeenCalledTimes(1);
	});
});
