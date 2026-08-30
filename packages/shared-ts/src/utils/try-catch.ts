import { logger } from '../lib/logger/iso-logger.ts';
import { isAsyncFunction, isPromise } from './any.utils.ts';
import { getErrorMessage } from './error.utils.ts';

/**
 * Outcome of a wrapped call: the handler's own value, its awaited form,
 * or nothing when an error was handled instead of producing a value.
 */
type TryCatchResult<F extends GenericFunction> =
	| ReturnType<F>
	| Awaited<ReturnType<F>>
	| void;

/**
 * The wrapper keeps the original handler's parameter list and admits every
 * outcome it can actually produce, so callers lose no type evidence.
 */
type TryCatchWrapped<F extends GenericFunction> = (
	...args: Parameters<F>
) => TryCatchResult<F> | Promise<TryCatchResult<F>>;

type Handler = (error: unknown) => void;
type AsyncHandler = (error: unknown) => Promise<void>;
type ErrorHandler<T extends GenericFunction = () => void> =
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
}): TryCatchWrapped<F> => {
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

		return wrappedFunctionAsync;
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
				return result.catch(handleError);
			}

			return result;
		} catch (error) {
			return handleError(error);
		}
	};

	return wrappedFunctionSync;
};
