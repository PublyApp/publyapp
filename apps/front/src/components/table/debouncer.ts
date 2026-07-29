export type Debouncer = {
	schedule: (run: () => void) => void;
	cancel: () => void;
};

/**
 * Minimal trailing-edge debouncer. Each `schedule` call cancels any pending
 * run and starts a new timer; `cancel` drops a pending run without firing it.
 */
export const createDebouncer = (delayMs: number): Debouncer => {
	let timer: ReturnType<typeof setTimeout> | undefined;

	const cancel = (): void => {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
	};

	const schedule = (run: () => void): void => {
		cancel();
		timer = setTimeout(() => {
			timer = undefined;
			run();
		}, delayMs);
	};

	return { schedule, cancel };
};
