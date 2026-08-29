import forEach from 'lodash/forEach.js';
import get from 'lodash/get.js';

export const delay = <T = unknown>(
	timeout: number,
	value?: T,
	options: { trace?: boolean } = {},
) => {
	if (options.trace) {
		const traceLog = async (): Promise<void> => {
			const { logger } = await import('@org/shared-ts/lib/logger/iso-logger');
			logger.warn('delay function invoked', { timeout, value });
		};
		void traceLog();
	}
	return new Promise<T>((resolve) => {
		return setTimeout(() => {
			resolve(value as T | PromiseLike<T>);
		}, timeout);
	});
};

/**
 * Thin alias over {@link delay} for the "wait N ms, no value" case.
 * Same signature the local copies used (`(ms: number): Promise<void>`).
 */
export const sleep = (ms: number): Promise<void> => delay(ms);

export const isAsyncFunction = (
	func: GenericFunction,
): func is AsyncFunction => {
	return func.constructor.name === 'AsyncFunction';
};

// https://github.com/browserify/node-util/blob/ef984721db7150f651800e051de4314c9517d42c/support/types.js#L50-L63
export const isPromise = (input: unknown): input is Promise<unknown> => {
	return (
		(typeof Promise !== 'undefined' && input instanceof Promise) ||
		(input !== null &&
			typeof input === 'object' &&
			typeof (input as Record<string, unknown>).then === 'function' &&
			typeof (input as Record<string, unknown>).catch === 'function')
	);
};

type DeepReadonly<T> = T extends GenericFunction
	? T
	: { readonly [P in keyof T]: DeepReadonly<T[P]> };

/**
 * Recursively Object.freeze() objects and functions, works in strict mode
 * @link https://github.com/jsdf/deep-freeze/blob/master/index.js
 */
export const deepFreeze = <T>(o: T): DeepReadonly<T> => {
	Object.freeze(o);

	const oIsFunction = typeof o === 'function';
	const hasOwnProp = Object.prototype.hasOwnProperty;

	forEach(Object.getOwnPropertyNames(o), (prop) => {
		if (
			hasOwnProp.call(o, prop) &&
			(oIsFunction
				? prop !== 'caller' && prop !== 'callee' && prop !== 'arguments'
				: true) &&
			get(o, prop) !== null &&
			(typeof get(o, prop) === 'object' ||
				typeof get(o, prop) === 'function') &&
			!Object.isFrozen(get(o, prop))
		) {
			deepFreeze(get(o, prop));
		}
	});

	return o as DeepReadonly<T>;
};

export const urlStartWithProtocol = (url: string) => {
	return ['http://', 'https://'].some((protocol) => {
		return url.startsWith(protocol);
	});
};

export const withResolvers = <T = unknown>() => {
	let resolve: (value: T | PromiseLike<T>) => void = () => {};
	let reject: (reason?: unknown) => void = () => {};

	const promise = new Promise<T>((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});

	return { promise, resolve, reject };
};

/**
 * @link https://stackoverflow.com/a/58110124/15003148
 */
export const nonNullable = <T>(value: T): value is NonNullable<T> => {
	return value !== null && value !== undefined;
};

export const mbToBytes = (mb: number) => {
	return mb * 1024 * 1024;
};
