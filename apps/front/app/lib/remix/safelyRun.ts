import _ from 'lodash';

import { tryCatchWrapper } from '@devist/shared/utils/tryCatchWrapper';

type SafeLoaderFunction<F extends GenericFunction> = (
	...args: Parameters<F>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
) => ReturnType<F> extends PromiseLike<any> ? ReturnType<F> | Promise<Error> : ReturnType<F> | Error;

export const safelyRunInLoader = <F extends GenericFunction>(func: F): SafeLoaderFunction<F> => {
	const wrappedFunction = tryCatchWrapper(func, (_error) => {
		let error = _error;

		if (_.isString(error)) {
			error = new Error(error);
		}

		if (!(error instanceof Error)) {
			error = new Error('Unknown error');
		}

		return error;
	});

	return wrappedFunction as never;
};
