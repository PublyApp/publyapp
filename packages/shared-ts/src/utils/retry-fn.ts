import { delay as delayFn } from './any.utils.ts';

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
		// The initial call above always runs, even when attempts=0 ("never
		// retry"). On failure we retry while attempts > 1, decrementing each
		// round, so the total number of calls is max(1, attempts).
		// This contract is pinned by retry-fn.test.ts for attempts 0, 1, 2, 3, 4,
		// and 5 — the call count for each is exact, not bounded.
		if (attempts <= 1) {
			throw error;
		}
		await delayFn(delay);
		return retry({ fn, args, attempts: attempts - 1, delay: delay * 2 });
	}
};
