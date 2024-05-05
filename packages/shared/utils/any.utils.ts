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
// eslint-disable-next-line func-style, prefer-arrow/prefer-arrow-functions, @typescript-eslint/no-explicit-any
export const isPromise = (input: unknown): input is Promise<any> => {
	return (
		(typeof Promise !== 'undefined' && input instanceof Promise) ||
		(input !== null &&
			typeof input === 'object' &&
			typeof (input as Record<string, unknown>).then === 'function' &&
			typeof (input as Record<string, unknown>).catch === 'function')
	);
};
