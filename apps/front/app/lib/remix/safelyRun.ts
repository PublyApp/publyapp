import _ from 'lodash';

/**
 * Generic function that accepts any number of parameters.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GenericFunction = ((...args: any[]) => any) | ((...args: any[]) => Promise<any>);

/**
 * Can be used to wrap a function within a function with the
 * same signature.
 *
 * @param F - Function that should be wrapped.
 */
type TryCatchWrapper<F extends GenericFunction> = (
	...args: Parameters<F>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
) => ReturnType<F> extends PromiseLike<any> ? ReturnType<F> | Promise<Error> : ReturnType<F> | Error;

/**
 * Wraps a function within a try/catch block to catch any
 * unhandled error. Works for both sync and async functions.
 *
 * @param func - Function that should be wrapped.
 */
export const safelyRunInLoader = <F extends GenericFunction>(func: F): TryCatchWrapper<F> => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const toRun = (...args: any[]) => {
		try {
			// eslint-disable-next-line @typescript-eslint/return-await
			return func(...args);
		} catch (error) {
			// console.error(error);
			return error;
			// Do whatever you want.
		}
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const asyncToRun = async (...args: any[]) => {
		try {
			// eslint-disable-next-line @typescript-eslint/return-await
			return await func(...args);
		} catch (error) {
			// console.error(error);
			return error;
			// Do whatever you want.
		}
	};

	if (func.constructor.name === 'AsyncFunction') {
		return asyncToRun as never;
	}

	return toRun as never;
};

// const handler = ({ a = 'ok' }: { a: string }) => {
// 	console.log(a);
// 	throw new Error('FOOBAR');
// };

// tryCatchWrapper(handler)({ a: 'lol' });
