import { isAsyncFunction, isPromise } from './any.utils';

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type Handler = (error: unknown) => any;
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type AsyncHandler = (error: unknown) => Promise<any>;
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type ErrorHandler<T extends GenericFunction = () => any> =
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
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
export const tryCatchWrapper = <F extends GenericFunction>({
	handler,
	onError,
}: {
	handler: F;
	onError?: ErrorHandler<F>;
}): F => {
	if (!onError) {
		// eslint-disable-next-line no-param-reassign
		onError = defaultErrorHandler as never;
	}

	if (isAsyncFunction(handler)) {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		const wrappedFunctionAsync = async (...args: any[]) => {
			try {
				const result = await handler(...args);
				return result;
			} catch (error) {
				if (isAsyncFunction(onError)) {
					const result = await onError(error);
					return result;
				}

				return onError(error);
			}
		};

		return wrappedFunctionAsync as never;
	}

	if (isAsyncFunction(onError)) {
		throw new Error(
			'Cannot have an async error handler if the main function not async',
		);
	}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const wrappedFunctionSync = (...args: any[]) => {
		try {
			const result = handler(...args);

			if (isPromise(result)) {
				return result.catch(onError as never);
			}

			return result;
		} catch (error) {
			return onError(error);
		}
	};

	return wrappedFunctionSync as never;
};
