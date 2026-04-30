import { logger } from '../lib/logger/iso-logger';
import { isAsyncFunction, isPromise } from './any.utils';
import { getErrorMessage } from './error.utils';

// oxlint-disable-next-line typescript/no-explicit-any -- return type can be anything
type Handler = (error: unknown) => any;
// oxlint-disable-next-line typescript/no-explicit-any -- return type can be anything
type AsyncHandler = (error: unknown) => Promise<any>;
// oxlint-disable-next-line typescript/no-explicit-any -- return type can be anything
type ErrorHandler<T extends GenericFunction = () => any> =
	// oxlint-disable-next-line typescript/no-explicit-any -- return type can be anything
	ReturnType<T> extends PromiseLike<any> ? Handler | AsyncHandler : Handler;

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

	if (isAsyncFunction(handler)) {
		// oxlint-disable-next-line typescript/no-explicit-any -- forwarding any arguments from the original function
		const wrappedFunctionAsync = async (...args: any[]) => {
			try {
				const result = await handler(...args);
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

	// oxlint-disable-next-line typescript/no-explicit-any -- forwarding any arguments from the original function
	const wrappedFunctionSync = (...args: any[]) => {
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
