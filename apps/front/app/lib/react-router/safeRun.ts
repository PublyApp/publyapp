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

			if (!error) {
				// do nothing
			}

			if (err instanceof Error) {
				error = err;
			} else {
				error = new Error(String(err));
			}

			return { status: 'error', error };
		},
	});

	return wrappedFunction as never;
};
