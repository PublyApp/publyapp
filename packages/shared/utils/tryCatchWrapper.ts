/* eslint-disable @typescript-eslint/no-explicit-any */
import { isAsyncFunction } from './any.utils';

type Handler = (error: unknown) => any;
type AsyncHandler = (error: unknown) => Promise<any>;
type ErrorHandler<T extends GenericFunction = () => any> =
	ReturnType<T> extends PromiseLike<any> ? Handler | AsyncHandler : Handler;

const defaultErrorHandler: ErrorHandler = (error) => {
	console.warn('You may want to define a custom error handler');
	console.error(error);
	console.trace(error);
};

/**
 * Wraps a function within a try/catch block to catch any
 * unhandled error. Works for both sync and async functions.
 *
 * @param func - Function that should be wrapped.
 */
export const tryCatchWrapper = <F extends GenericFunction>(
	func: F,
	errorHandler: ErrorHandler<F> = defaultErrorHandler,
): F => {
	if (isAsyncFunction(func)) {
		const wrappedFunctionAsync = async (...args: any[]) => {
			try {
				const result = await func(...args);
				return result;
			} catch (error) {
				if (isAsyncFunction(errorHandler)) {
					const result = await errorHandler(error);
					return result;
				}

				return errorHandler(error);
			}
		};

		return wrappedFunctionAsync as never;
	}

	if (isAsyncFunction(errorHandler)) {
		throw new Error('Cannot have an async error handler if the main function not async');
	}

	const wrappedFunctionSync = (...args: any[]) => {
		try {
			return func(...args);
		} catch (error) {
			return errorHandler(error);
		}
	};

	return wrappedFunctionSync as never;
};
