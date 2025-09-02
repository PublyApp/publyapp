import { tryCatchWrapper } from '@org/shared/utils/try-catch';
import _ from 'lodash';

type SafeRunFunction<F extends GenericFunction> = (
	...args: Parameters<F>
	// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
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
					error = new Error(JSON.stringify(err));
				}
				_.entries(err).forEach(([key, value]) => {
					_.set(error, key, value);
				});
			} else {
				error = new Error(String(err));
			}

			return { status: 'error', error };
		},
	});

	return wrappedFunction as never;
};
