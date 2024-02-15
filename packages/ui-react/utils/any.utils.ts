export const sleep = (timeout: number) => {
	return new Promise((resolve) => {
		// eslint-disable-next-line no-promise-executor-return
		return setTimeout(resolve, timeout);
	});
};
