export const SESSION_VALIDATION_TIMEOUT_MS = 20_000;

type SessionValidation<T> = (signal: AbortSignal) => Promise<T>;

/**
 * `signal.reason` is `any` in the DOM lib; the rejection reason slot accepts
 * `unknown`, so the honest type here is the non-any supertype. Callers only
 * forward it to `controller.abort(reason)` / `reject(reason)`, both of which
 * accept `unknown`.
 */
type AbortReason = string | Error;

const getAbortReason = (signal: AbortSignal): AbortReason =>
	signal.reason ??
	new DOMException('Session validation cancelled', 'AbortError');

export const withSessionValidationTimeout = <T>(
	validation: SessionValidation<T>,
	callerSignal?: AbortSignal,
): Promise<T> =>
	new Promise<T>((resolve, reject) => {
		const controller = new AbortController();
		let isSettled = false;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		const settle = (callback: () => void) => {
			if (isSettled) {
				return;
			}

			isSettled = true;
			if (timeoutId !== undefined) {
				clearTimeout(timeoutId);
			}
			callerSignal?.removeEventListener('abort', abortFromCaller);
			callback();
		};
		const abortFromCaller = () => {
			const reason = callerSignal
				? getAbortReason(callerSignal)
				: new DOMException('Session validation cancelled', 'AbortError');
			controller.abort(reason);
			settle(() => reject(reason));
		};

		if (callerSignal?.aborted) {
			abortFromCaller();
			return;
		}
		callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

		timeoutId = setTimeout(() => {
			const error = new Error('Session validation timed out');
			controller.abort(error);
			settle(() => reject(error));
		}, SESSION_VALIDATION_TIMEOUT_MS);

		let validationPromise: Promise<T>;
		try {
			validationPromise = validation(controller.signal);
		} catch (error: unknown) {
			settle(() => reject(error));
			return;
		}

		void validationPromise.then(
			(value) => {
				settle(() => resolve(value));
			},
			(error: unknown) => {
				settle(() => reject(error));
			},
		);
	});
