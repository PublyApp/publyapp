/**
 * One Publish / Schedule / Save "attempt" of the create drawer (#2179).
 *
 * An attempt is a generation: it stays current until something supersedes it
 * (a new attempt, Cancel/close, unmount). Every step checks `isCurrent` after
 * each await and before the request goes out, and `run` stops WAITING for a
 * request as soon as the attempt is superseded or a bounded time has passed.
 * Stopping the wait cannot recall a request that already left, but nothing
 * further is sent and nothing is navigated on its behalf.
 */
export const ATTEMPT_TIMEOUT_MS = 45_000;

export class AttemptCancelledError extends Error {}
export class AttemptTimedOutError extends Error {}

export type Attempt = {
	isCurrent: () => boolean;
	/** Resolves with `work`, or rejects with `AttemptCancelledError` once the
	 * attempt is superseded, or `AttemptTimedOutError` after the time limit. */
	run: <T>(work: Promise<T>) => Promise<T>;
};

export const createAttemptRegistry = (timeoutMs = ATTEMPT_TIMEOUT_MS) => {
	let generation = 0;
	const cancelers = new Set<() => void>();

	const invalidate = () => {
		generation += 1;
		for (const cancel of [...cancelers]) {
			cancel();
		}
	};

	/** Starts an attempt; any earlier one is superseded. */
	const begin = (): Attempt => {
		invalidate();
		const mine = generation;
		const isCurrent = () => generation === mine;
		const run = <T>(work: Promise<T>): Promise<T> =>
			new Promise<T>((resolve, reject) => {
				if (!isCurrent()) {
					reject(new AttemptCancelledError());
					return;
				}
				const cancel = () => {
					cleanup();
					reject(new AttemptCancelledError());
				};
				const timer = setTimeout(() => {
					cleanup();
					reject(new AttemptTimedOutError());
				}, timeoutMs);
				const cleanup = () => {
					clearTimeout(timer);
					cancelers.delete(cancel);
				};
				cancelers.add(cancel);
				work.then(
					(value) => {
						cleanup();
						resolve(value);
					},
					(error: unknown) => {
						cleanup();
						reject(error);
					},
				);
			});
		return { isCurrent, run };
	};

	return { begin, invalidate };
};
