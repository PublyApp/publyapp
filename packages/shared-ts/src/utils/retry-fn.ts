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
	try {
		return await fn(...(args ?? []));
	} catch (error) {
		if (attempts === 0) {
			throw error;
		}
		await delayFn(delay);
		return retry({ fn, args, attempts: attempts - 1, delay: delay * 2 });
	}
};
