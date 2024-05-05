import _ from 'lodash';

import { tryCatchWrapper } from '@devist/shared/utils/tryCatchWrapper';

const errorJSONModel = {
	isErrorJSON: true,
	message: 'Unknown error' as string,
} as const;

type ErrorJSONBase = typeof errorJSONModel;

type ErrorJSON = ErrorJSONBase & { name?: string; stack?: string } & Record<string, unknown>;

type SafeLoaderFunction<F extends GenericFunction> = (
	...args: Parameters<F>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
) => ReturnType<F> extends PromiseLike<any> ? ReturnType<F> | Promise<ErrorJSON> : ReturnType<F> | ErrorJSON;

const jsonifyError = (error: Error): ErrorJSON => {
	const errorJson = _.cloneDeep(errorJSONModel) satisfies ErrorJSONBase;

	Object.getOwnPropertyNames(error).forEach((property) => {
		_.set(errorJson, property, (error as never)[property]);
	});

	return errorJson as never;
};

export const safelyRunInLoader = <F extends GenericFunction>(func: F): SafeLoaderFunction<F> => {
	const wrappedFunction = tryCatchWrapper(func, (_error) => {
		let error: Error = new Error('Unknown error');

		if (_.isString(_error)) {
			error = new Error(_error);
		}

		if (_error instanceof Error) {
			error = _error;
		}

		const json = jsonifyError(error);

		return json;
	});

	return wrappedFunction as never;
};

export const isErrorJSON = (value: unknown): value is ErrorJSON => {
	if (_.isObject(value)) {
		return _.get(value, 'isErrorJSON', false) as boolean;
	}

	return false;
};
