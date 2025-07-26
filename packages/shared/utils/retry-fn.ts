import { delay as delayFn } from './any.utils';

export const retry = async <F extends GenericFunction>(
	fn: F,
	attempts = 3,
	delay = 2000,
): Promise<ReturnType<F>> => {
	try {
		return await fn();
	} catch (error) {
		if (attempts === 0) throw error;
		await delayFn(delay);
		return retry(fn, attempts - 1, delay * 2);
	}
};
