export const sleep = (timeout: number) => {
	return new Promise((resolve) => {
		// eslint-disable-next-line no-promise-executor-return
		return setTimeout(resolve, timeout);
	});
};

export const isAsyncFunction = (func: GenericFunction) => {
	return func.constructor.name === 'AsyncFunction';
};
