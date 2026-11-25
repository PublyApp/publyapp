import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import {
	type LoggerHooks,
	type Signal,
	StdoutJsonLoggerAdapter,
} from '../adapters/stdout-json-logger-adapter';
import type { LogEntry } from '../logger.types';

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
	level: 'info',
	message: 'm',
	time: new Date('2026-11-24T10:00:00Z'),
	...over,
});

const make = () => {
	const out = vi.fn<(chunk: string) => void>();
	const kill = vi.fn<(pid: number, signal: Signal) => void>();
	const hooks: LoggerHooks & EventEmitter = Object.assign(new EventEmitter(), {
		pid: 4242,
		kill,
	});
	return { out, hooks, kill, adapter: new StdoutJsonLoggerAdapter(out, hooks) };
};

const lines = (out: ReturnType<typeof vi.fn>): string[] =>
	(out.mock.calls[0]?.[0] as string).trim().split('\n');

describe('StdoutJsonLoggerAdapter', () => {
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

	it('does not block: one burst is written as one batch after the caller yields', async () => {
		const { out, adapter } = make();
		for (let i = 0; i < 1000; i++) {
			adapter.write(entry({ message: `m${i}` }));
		}
		expect(out).not.toHaveBeenCalled();
		await Promise.resolve();
		expect(out).toHaveBeenCalledTimes(1);
		expect(lines(out)).toHaveLength(1000);
	});

	it('flushes everything synchronously on error', () => {
		const { out, adapter } = make();
		adapter.write(entry());
		adapter.write(entry({ level: 'error', meta: { err: { stack: 'trace' } } }));
		expect(out).toHaveBeenCalledTimes(1);
		expect(lines(out)).toHaveLength(2);
		expect(JSON.parse(lines(out)[1] as string)).toMatchObject({
			level: 'error',
			err: { stack: 'trace' },
		});
	});

	it.each(['beforeExit', 'exit'] as const)('flushes on %s', (event) => {
		const { out, hooks, adapter } = make();
		adapter.write(entry());
		hooks.emit(event);
		expect(out).toHaveBeenCalledTimes(1);
	});

	it('flushes SIGTERM and re-raises it when no other listener remains', () => {
		const { out, hooks, kill, adapter } = make();
		adapter.write(entry({ message: 'last line' }));
		expect(out).not.toHaveBeenCalled();

		hooks.emit('SIGTERM');

		expect(JSON.parse(lines(out)[0] as string)).toMatchObject({
			message: 'last line',
		});
		expect(kill).toHaveBeenCalledWith(4242, 'SIGTERM');
	});

	it('flushes SIGTERM but leaves termination to another listener', () => {
		const { out, hooks, kill, adapter } = make();
		const applicationHandler = vi.fn();
		hooks.on('SIGTERM', applicationHandler);
		adapter.write(entry());

		hooks.emit('SIGTERM');

		expect(out).toHaveBeenCalledTimes(1);
		expect(applicationHandler).toHaveBeenCalledTimes(1);
		expect(kill).not.toHaveBeenCalled();
	});

	it('flushes SIGINT and re-raises it when no other listener remains', () => {
		const { out, hooks, kill, adapter } = make();
		adapter.write(entry());
		hooks.emit('SIGINT');
		expect(out).toHaveBeenCalledTimes(1);
		expect(kill).toHaveBeenCalledWith(4242, 'SIGINT');
	});

	it('registers the signal hooks once per target even with several adapters', () => {
		const { hooks } = make();
		new StdoutJsonLoggerAdapter(vi.fn(), hooks);
		expect(hooks.listenerCount('SIGTERM')).toBe(1);
		expect(hooks.listenerCount('SIGINT')).toBe(1);
	});

	it('flushes every adapter of the target on SIGTERM', () => {
		const { out, hooks, adapter } = make();
		const secondOut = vi.fn();
		const second = new StdoutJsonLoggerAdapter(secondOut, hooks);
		adapter.write(entry());
		second.write(entry());

		hooks.emit('SIGTERM');

		expect(out).toHaveBeenCalledTimes(1);
		expect(secondOut).toHaveBeenCalledTimes(1);
	});
});
