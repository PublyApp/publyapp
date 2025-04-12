import _ from 'lodash';

export const sleep = <T = unknown>(timeout: number, value?: T) => {
	const newLocal = 'sleep function invoked';
	console.warn(`%c${newLocal}`, 'color: yellow');
	return new Promise<T>((resolve) => {
		return setTimeout(() => {
			resolve(value as never);
		}, timeout);
	});
};

// biome-ignore lint/suspicious/noExplicitAny: any is the only way to do this
type Asyncfunction = (...args: any[]) => Promise<any>;

export const isAsyncFunction = (
	func: GenericFunction,
): func is Asyncfunction => {
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

// biome-ignore lint/suspicious/noExplicitAny: any is the only way to do this
type DeepReadonly<T> = T extends (...args: any) => any
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

	_.forEach(Object.getOwnPropertyNames(o), (prop) => {
		if (
			hasOwnProp.call(o, prop) &&
			(oIsFunction
				? prop !== 'caller' && prop !== 'callee' && prop !== 'arguments'
				: true) &&
			_.get(o, prop) !== null &&
			(typeof _.get(o, prop) === 'object' ||
				typeof _.get(o, prop) === 'function') &&
			!Object.isFrozen(_.get(o, prop))
		) {
			deepFreeze(_.get(o, prop));
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

	// biome-ignore lint/suspicious/noExplicitAny: any is the only way to do this
	let reject: (reason: any) => void;

	const promise = new Promise((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});

	// @ts-ignore
	return { promise, resolve, reject };
};
