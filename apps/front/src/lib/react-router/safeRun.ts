import _ from 'lodash';

import { tryCatchWrapper } from '@org/shared-ts/utils/try-catch';

type SafeRunFunction<F extends GenericFunction> = (
	...args: Parameters<F>
	// oxlint-disable-next-line typescript/no-explicit-any -- safe to use any here
) => ReturnType<F> extends PromiseLike<any>
	?
			| Promise<{
					status: 'success';
					data: Awaited<ReturnType<F>>;
			  }>
			| Promise<{
					status: 'error';
					error: Error;
			  }>
	:
			| {
					status: 'success';
					data: ReturnType<F>;
			  }
			| {
					status: 'error';
					error: Error;
			  };

/**
 * Properties safe to copy from Kiota API errors onto the Error object.
 * Excludes response headers and other sensitive internal details.
 */
const SAFE_ERROR_PROPERTIES = new Set([
	'translationKey',
	'detail',
	'title',
	'status',
	'responseStatusCode',
	'type',
	'instance',
	'errors',
	'key',
]);

/**
 * Extract a user-friendly message from an unknown error object.
 * Avoids JSON.stringify which leaks internal details.
 */
const extractErrorMessage = (err: Record<string, unknown>): string => {
	if (typeof err.detail === 'string' && err.detail.length > 0) {
		return err.detail;
	}
	if (typeof err.title === 'string' && err.title.length > 0) {
		return err.title;
	}
	return 'An unexpected error occurred';
};

export const safeRun = <F extends GenericFunction>(
	func: F,
): SafeRunFunction<F> => {
	const wrappedFunction = tryCatchWrapper({
		handler: async (...args: Parameters<F>) => {
			const result = await func(...args);
			return { status: 'success', data: result };
		},
		onError: (err) => {
			let error: Error = new Error('Unknown error');

			if (err instanceof Error) {
				error = err;
			} else if (_.isObject(err)) {
				if (_.has(err, 'messageEscaped')) {
					// for Kiota client errors
					error = new Error(err.messageEscaped);
				} else if (_.has(err, 'message')) {
					error = new Error(err.message);
				} else {
					error = new Error(
						extractErrorMessage(err as Record<string, unknown>),
					);
				}
				// Only copy safe properties to avoid leaking
				// headers, traceId, and other internal details
				_.entries(err).forEach(([key, value]) => {
					if (SAFE_ERROR_PROPERTIES.has(key)) {
						_.set(error, key, value);
					}
				});
			} else {
				error = new Error(String(err));
			}

			return { status: 'error', error };
		},
	});

	return wrappedFunction as never;
};
