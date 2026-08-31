import { expect, test, vi } from 'vitest';

const { warnSpy, errorSpy } = vi.hoisted(() => {
	const warnSpy = vi.fn();
	const errorSpy = vi.fn();
	return { warnSpy, errorSpy };
});

vi.mock('@org/shared-ts/lib/logger/iso-logger', () => ({
	logger: {
		warn: (...args: unknown[]) => warnSpy(...args),
		info: vi.fn(),
		error: (...args: unknown[]) => errorSpy(...args),
		debug: vi.fn(),
	},
}));

import { tryCatchWrapper } from './try-catch';

test('tryCatchWrapper returns the sync handler value when it returns one', () => {
	const handler = () => 42;

	const wrapped = tryCatchWrapper({ handler });
	const result = wrapped();

	expect(result).toBe(42);
});

test('tryCatchWrapper routes a sync handler throw through the onError handler and returns its result', () => {
	const onError = vi.fn().mockReturnValue('recovered');
	const handler = () => {
		throw new Error('boom');
	};

	const wrapped = tryCatchWrapper({ handler, onError });
	const result = wrapped();

	expect(onError).toHaveBeenCalledTimes(1);
	expect(onError).toHaveBeenCalledWith(expect.any(Error));
	expect((onError.mock.calls[0]![0] as Error).message).toBe('boom');
	expect(result).toBe('recovered');
});

test('tryCatchWrapper awaits the async handler resolution and returns the resolved value', async () => {
	const handler = async () => 'async-ok';

	const wrapped = tryCatchWrapper({ handler });
	const result = await wrapped();

	expect(result).toBe('async-ok');
});

test('tryCatchWrapper routes an async handler rejection through the onError handler', async () => {
	const onError = vi.fn().mockReturnValue('async-recovered');
	const handler = async () => {
		throw new Error('async-boom');
	};

	const wrapped = tryCatchWrapper({ handler, onError });
	const result = await wrapped();

	expect(onError).toHaveBeenCalledTimes(1);
	expect((onError.mock.calls[0]![0] as Error).message).toBe('async-boom');
	expect(result).toBe('async-recovered');
});

test('tryCatchWrapper attaches .catch to a sync handler that returned a rejecting promise (#1952: closed switch between sync/async branches)', async () => {
	// #1952: this branch is the one the issue names as the load-bearing gap.
	// A handler that is not an async function but happens to return a
	// rejecting promise must NOT surface that rejection as an unhandled
	// rejection — the wrapper is responsible for forwarding the rejection
	// through onError, exactly as the async-handler branch does. A
	// "treat the return value as the success payload" mutation that
	// collapses sync-vs-promise into one branch would return the pending
	// promise here, the test would receive a pending promise where it
	// expects a value, and every caller would silently hang.
	const onError = vi.fn().mockReturnValue('sync-promise-recovered');
	const handler = (): Promise<never> => {
		return Promise.reject(new Error('sync-promise-boom'));
	};

	const unhandledRejections: unknown[] = [];
	const onUnhandled = (reason: unknown) => {
		unhandledRejections.push(reason);
	};
	process.on('unhandledRejection', onUnhandled);
	try {
		const wrapped = tryCatchWrapper({ handler, onError });
		const result = await wrapped();

		expect(onError).toHaveBeenCalledTimes(1);
		expect((onError.mock.calls[0]![0] as Error).message).toBe(
			'sync-promise-boom',
		);
		expect(result).toBe('sync-promise-recovered');

		// Belt-and-braces: the rejection must be handled by the wrapper's
		// `.catch`, NOT escape as an unhandled rejection (Node then reports
		// the process-side warning, which a future reviewer chasing a
		// flaky test would have to correlate back here).
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(unhandledRejections).toEqual([]);
	} finally {
		process.off('unhandledRejection', onUnhandled);
	}
});

test('tryCatchWrapper throws when constructed with an async onError but a sync handler (impossible configuration)', () => {
	const asyncOnError = async (_error: unknown) => 'never';
	const handler = () => 'never-reached';

	// The check fires at WRAPPER CONSTRUCTION time, not at call time —
	// a sync handler paired with an async error handler is a misuse that
	// the wrapper detects eagerly so the caller never silently drops its
	// async handler.
	expect(() =>
		tryCatchWrapper({
			handler,
			onError: asyncOnError,
		}),
	).toThrow(
		/Cannot have an async error handler if the main function not async/,
	);
});

test('tryCatchWrapper uses the default error handler (logs via logger) when no onError is supplied', () => {
	warnSpy.mockClear();
	errorSpy.mockClear();
	const handler = () => {
		throw new Error('default-handler-boom');
	};

	const wrapped = tryCatchWrapper({ handler });
	// The default handler returns undefined — the wrapper must surface it.
	const result = wrapped();

	expect(result).toBeUndefined();
	expect(warnSpy).toHaveBeenCalledWith(
		'You may want to define a custom error handler',
	);
	expect(errorSpy).toHaveBeenCalledTimes(1);
});
