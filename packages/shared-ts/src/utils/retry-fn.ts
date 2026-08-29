import { delay as delayFn } from './any.utils';

export const retry = async <F extends GenericFunction>({
	fn,
	args,
	attempts = 3,
	delay = 2000,
}: {
	fn: F;
	args?: Parameters<F>;
	attempts?: number;
	delay?: number;
}): Promise<ReturnType<F>> => {
	if (!Number.isInteger(attempts) || attempts < 0) {
		throw new RangeError(
			`retry: attempts must be a non-negative integer, received ${attempts}`,
		);
	}

	try {
		return await fn(...(args ?? []));
	} catch (error) {
		if (attempts <= 0) {
			throw error;
		}
		await delayFn(delay);
		return retry({ fn, args, attempts: attempts - 1, delay: delay * 2 });
	}
};
