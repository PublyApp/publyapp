import { logger } from '../lib/logger/iso-logger';
import { isAsyncFunction, isPromise } from './any.utils';
import { getErrorMessage } from './error.utils';

type Handler = (error: unknown) => unknown;
type AsyncHandler = (error: unknown) => Promise<unknown>;
type ErrorHandler<T extends GenericFunction = () => unknown> =
	ReturnType<T> extends PromiseLike<unknown> ? Handler | AsyncHandler : Handler;

const defaultErrorHandler: ErrorHandler = (error) => {
	logger.warn('You may want to define a custom error handler');
	logger.error(getErrorMessage(error), { error });
};

/**
 * Wraps a function within a try/catch block to catch any
 * unhandled error. Works for both sync and async functions.
 *
 * @param func - Function that should be wrapped.
 */
export const tryCatchWrapper = <F extends GenericFunction>({
	handler,
	onError,
}: {
	handler: F;
	onError?: ErrorHandler<F>;
}): F => {
	const handleError = onError ?? (defaultErrorHandler as ErrorHandler<F>);
	const originalHandler = handler;

	if (isAsyncFunction(handler)) {
		const wrappedFunctionAsync = async (...args: Parameters<F>) => {
			try {
				const result = await originalHandler(...args);
				return result;
			} catch (error) {
				if (isAsyncFunction(handleError)) {
					const result = await handleError(error);
					return result;
				}

				return handleError(error);
			}
		};

		return wrappedFunctionAsync as never;
	}

	if (isAsyncFunction(handleError)) {
		throw new Error(
			'Cannot have an async error handler if the main function not async',
		);
	}

	const wrappedFunctionSync = (...args: Parameters<F>) => {
		try {
			const result = handler(...args);

			if (isPromise(result)) {
				return result.catch(handleError as never);
			}

			return result;
		} catch (error) {
			return handleError(error);
		}
	};

	return wrappedFunctionSync as never;
};
