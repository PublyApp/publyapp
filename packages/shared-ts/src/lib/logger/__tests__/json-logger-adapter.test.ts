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
	return { out, adapter: new JsonLoggerAdapter(out) };
};

describe('JsonLoggerAdapter', () => {
	it('writes one parseable JSON line with time, level, message, meta', () => {
		const { out, adapter } = make();
		adapter.write(entry({ level: 'warn', meta: { a: 1 } }));
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

	it('keeps time, level and message authoritative over meta', () => {
		const { out, adapter } = make();
		adapter.write(entry({ meta: { level: 'x', message: 'y' } }));
		expect(JSON.parse(out.mock.calls[0]?.[0] as string)).toMatchObject({
			level: 'info',
			message: 'm',
		});
	});

	it('writes each line before write returns: nothing is buffered when the caller continues', () => {
		// SIGTERM is not an `exit` event, so anything still buffered when the
		// process is stopped is lost. The line must be out by the time the
		// caller continues. (Process-level SIGTERM proof: fix2516-proof/busy-parent.cjs.)
		const { out, adapter } = make();
		for (let i = 0; i < 1000; i++) {
			adapter.write(entry({ message: `m${i}` }));
			expect(out).toHaveBeenCalledTimes(i + 1);
		}
		expect(JSON.parse(out.mock.calls[999]?.[0] as string)).toMatchObject({
			message: 'm999',
		});
	});

	it('writes the earlier lines before an error line', () => {
		const { out, adapter } = make();
		adapter.write(entry());
		adapter.write(entry({ level: 'error', meta: { err: { stack: 'trace' } } }));
		expect(out).toHaveBeenCalledTimes(2);
		expect(JSON.parse(out.mock.calls[1]?.[0] as string)).toMatchObject({
			level: 'error',
			err: { stack: 'trace' },
		});
	});
});
