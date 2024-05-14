import _ from 'lodash';

export const sleep = <T = unknown>(timeout: number, value?: T) => {
	return new Promise((resolve) => {
		// eslint-disable-next-line no-promise-executor-return
		return setTimeout(() => {
			resolve(value);
		}, timeout);
	});
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Asyncfunction = (...args: any[]) => Promise<any>;

export const isAsyncFunction = (func: GenericFunction): func is Asyncfunction => {
	return func.constructor.name === 'AsyncFunction';
};

// https://github.com/browserify/node-util/blob/ef984721db7150f651800e051de4314c9517d42c/support/types.js#L50-L63
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isPromise = (input: unknown): input is Promise<any> => {
	return (
		(typeof Promise !== 'undefined' && input instanceof Promise) ||
		(input !== null &&
			typeof input === 'object' &&
			typeof (input as Record<string, unknown>).then === 'function' &&
			typeof (input as Record<string, unknown>).catch === 'function')
	);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DeepReadonly<T> = T extends (...args: any) => any ? T : { readonly [P in keyof T]: DeepReadonly<T[P]> };

/**
 * Recursively Object.freeze() objects and functions, works in strict mode
 * @link https://github.com/jsdf/deep-freeze/blob/master/index.js
 */
export const deepFreeze = <T>(o: T): DeepReadonly<T> => {
	Object.freeze(o);

	const oIsFunction = typeof o === 'function';
	const hasOwnProp = Object.prototype.hasOwnProperty;

	Object.getOwnPropertyNames(o).forEach((prop) => {
		if (
			hasOwnProp.call(o, prop) &&
			(oIsFunction ? prop !== 'caller' && prop !== 'callee' && prop !== 'arguments' : true) &&
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(o as any)[prop] !== null &&
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(typeof (o as any)[prop] === 'object' || typeof (o as any)[prop] === 'function') &&
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			!Object.isFrozen((o as any)[prop])
		) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			deepFreeze((o as any)[prop]);
		}
	});

	return o as never;
};

export const urlStartWithProtocol = (url: string) => {
	return ['http://', 'https://'].some((protocol) => {
		return url.startsWith(protocol);
	});
};

export const withResolvers = <T = unknown>() => {
	let resolve: (value: T) => void;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let reject: (reason: any) => void;

	const promise = new Promise((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});

	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	return { promise, resolve, reject };
};
