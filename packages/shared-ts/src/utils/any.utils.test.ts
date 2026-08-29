import { afterEach, expect, test, vi } from 'vitest';

const { warnSpy } = vi.hoisted(() => {
	const warnSpy = vi.fn();
	return { warnSpy };
});

vi.mock('@org/shared-ts/lib/logger/iso-logger', () => ({
	logger: {
		warn: (...args: unknown[]) => warnSpy(...args),
		info: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

import { delay, sleep } from './any.utils';

afterEach(() => {
	warnSpy.mockClear();
});

test('delay(10) without options does not log a warning', async () => {
	await delay(10);
	expect(warnSpy).not.toHaveBeenCalled();
});

test('delay(10, undefined, { trace: true }) logs a warning', async () => {
	await delay(10, undefined, { trace: true });
	expect(warnSpy).toHaveBeenCalledTimes(1);
	expect(warnSpy).toHaveBeenCalledWith('delay function invoked', {
		timeout: 10,
		value: undefined,
	});
});

test('delay with { trace: true } swallows a throwing logger (no unhandled rejection)', async () => {
	// #1869: delay() fires traceLog() as fire-and-forget. Without the
	// .catch(() => {}), a logger that throws rejects traceLog() and that
	// rejection is unhandled — Node then reports an unhandledRejection and
	// this test goes RED. With the .catch, nothing surfaces.
	const unhandledRejections: unknown[] = [];
	const onUnhandledRejection = (reason: unknown) => {
		unhandledRejections.push(reason);
	};
	process.on('unhandledRejection', onUnhandledRejection);
	try {
		warnSpy.mockImplementation(() => {
			throw new Error('logger exploded');
		});
		await delay(10, undefined, { trace: true });
		// Give the fire-and-forget traceLog() promise time to settle before
		// asserting that no unhandled rejection escaped.
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(unhandledRejections).toEqual([]);
	} finally {
		process.off('unhandledRejection', onUnhandledRejection);
		warnSpy.mockReset();
	}
});

test('delay resolves with the provided value', async () => {
	const result = await delay<number>(10, 42);
	expect(result).toBe(42);
});

test('sleep(10) does not log a warning', async () => {
	await sleep(10);
	expect(warnSpy).not.toHaveBeenCalled();
});
