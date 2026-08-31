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

// ---- #1952: coverage of the unwritten adversarial shapes -----------------
// The brief asks for tests on the cases where the input does not look like
// what the wrapper is shaped for: non-Error throwables, arguments the
// caller expects to reach the handler, and the default handler's log
// payload. Each test below pins one shape; the paired proof mutates the
// wrapper so the test goes RED, then restores the wrapper and the test
// goes GREEN.

test('tryCatchWrapper forwards a non-Error throwable (string) through onError as-is', () => {
	const onError = vi.fn().mockReturnValue('string-recovered');
	const handler = () => {
		// eslint-disable-next-line @typescript-eslint/no-throw-literal
		throw 'a literal string';
	};

	const wrapped = tryCatchWrapper({ handler, onError });
	const result = wrapped();

	expect(onError).toHaveBeenCalledTimes(1);
	expect(onError).toHaveBeenCalledWith('a literal string');
	expect(result).toBe('string-recovered');
});

test('tryCatchWrapper forwards the handler args to the handler and to onError on rejection', () => {
	const onError = vi.fn().mockReturnValue('arg-recovered');
	const handler = (a: number, b: string) => {
		if (a === 0) {
			throw new Error(`bad-a:${a},b:${b}`);
		}
		return `ok:${a}:${b}`;
	};

	const wrapped = tryCatchWrapper({ handler, onError });
	const ok = wrapped(0, 'first');
	expect(ok).toBe('arg-recovered');
	expect(onError).toHaveBeenCalledTimes(1);
	const errArg = onError.mock.calls[0]?.[0];
	expect(errArg).toBeInstanceOf(Error);
	expect((errArg as Error).message).toBe('bad-a:0,b:first');

	const ok2 = wrapped(7, 'second');
	expect(ok2).toBe('ok:7:second');
});

test('tryCatchWrapper default handler logs a structured error (the first argument), not the error object directly', () => {
	// The default handler is `logger.error(getErrorMessage(error), { error })`.
	// The first argument to logger.error MUST be the human-readable message,
	// not the raw error — a mutation that swaps them would dump a non-string
	// into a slot that downstream serializers expect to be a string, and the
	// log would either stringify badly or throw.
	warnSpy.mockClear();
	errorSpy.mockClear();
	const handler = () => {
		throw new Error('structured-boom');
	};

	const wrapped = tryCatchWrapper({ handler });
	const result = wrapped();

	expect(result).toBeUndefined();
	expect(errorSpy).toHaveBeenCalledTimes(1);
	const [firstArg, secondArg] = errorSpy.mock.calls[0] ?? [];
	expect(typeof firstArg).toBe('string');
	expect(firstArg).toBe('structured-boom');
	expect(secondArg).toEqual({ error: expect.any(Error) });
});

test('tryCatchWrapper async branch awaits onError when onError itself is async, and returns its resolved value', async () => {
	const onError = vi.fn().mockResolvedValue('async-on-error-ok');
	const handler = async () => {
		throw new Error('async-on-error-boom');
	};

	const wrapped = tryCatchWrapper({ handler, onError });
	const result = await wrapped();

	expect(onError).toHaveBeenCalledTimes(1);
	expect(result).toBe('async-on-error-ok');
});

test('tryCatchWrapper async branch surfaces onError rejection as the wrapped promise rejection', async () => {
	// If onError itself rejects, the wrapper's returned promise MUST reject
	// with that same error — silently swallowing it would be a worse bug
	// than the original handler throwing. A "swallow the rejection" mutation
	// would return undefined here and the test would fail.
	const onError = vi
		.fn()
		.mockRejectedValue(new Error('on-error-itself-blew-up'));
	const handler = async () => {
		throw new Error('handler-boom');
	};

	const wrapped = tryCatchWrapper({ handler, onError });
	await expect(wrapped()).rejects.toThrow('on-error-itself-blew-up');
	expect(onError).toHaveBeenCalledTimes(1);
});

test('tryCatchWrapper sync branch with a non-Error throwable (null) routes through the default handler and returns undefined', () => {
	// `throw null` is valid JavaScript: a `null` thrown does not have a
	// `.message`, so the default handler must coerce via `getErrorMessage`
	// rather than crashing. A mutation that dropped the getErrorMessage
	// call and passed `error` directly to `logger.error` would still pass
	// the typeof check above (logger.error accepts unknown), but the
	// second-arg `{ error }` shape would carry `null` instead of the error
	// instance, which downstream serializers cannot re-throw. This test
	// pins both: typeof firstArg === 'string' AND secondArg.error is null.
	warnSpy.mockClear();
	errorSpy.mockClear();
	const handler = () => {
		// eslint-disable-next-line @typescript-eslint/no-throw-literal
		throw null;
	};

	const wrapped = tryCatchWrapper({ handler });
	const result = wrapped();

	expect(result).toBeUndefined();
	expect(warnSpy).toHaveBeenCalledTimes(1);
	expect(errorSpy).toHaveBeenCalledTimes(1);
	const [firstArg, secondArg] = errorSpy.mock.calls[0] ?? [];
	expect(typeof firstArg).toBe('string');
	expect(firstArg).not.toBe('');
	expect(secondArg).toEqual({ error: null });
});
