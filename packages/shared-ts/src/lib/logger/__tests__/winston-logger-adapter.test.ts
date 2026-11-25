import { describe, expect, it, vi } from 'vitest';

import { WinstonLoggerAdapter } from '../adapters/winston-logger-adapter';

describe('WinstonLoggerAdapter', () => {
	it('only translates the entry into a winston log call', () => {
		const log = vi.fn();
		const adapter = new WinstonLoggerAdapter({ log });
		adapter.write({
			level: 'warn',
			message: 'kept as-is a@b.com',
			meta: { a: 1 },
			time: new Date('2026-11-24T10:00:00Z'),
		});
		expect(log).toHaveBeenCalledWith({
			a: 1,
			level: 'warn',
			message: 'kept as-is a@b.com',
			timestamp: '2026-11-24T10:00:00.000Z',
		});
	});

	it('does not let meta spoof level, message or timestamp', () => {
		const log = vi.fn();
		new WinstonLoggerAdapter({ log }).write({
			level: 'info',
			message: 'm',
			meta: { level: 'error', message: 'spoof', timestamp: 'x' },
			time: new Date('2026-11-24T10:00:00Z'),
		});
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				level: 'info',
				message: 'm',
				timestamp: '2026-11-24T10:00:00.000Z',
			}),
		);
	});
});
