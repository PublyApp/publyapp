export const SESSION_VALIDATION_TIMEOUT_MS = 20_000;

export const withSessionValidationTimeout = <T>(
	validation: Promise<T>,
): Promise<T> =>
	new Promise<T>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			reject(new Error('Session validation timed out'));
		}, SESSION_VALIDATION_TIMEOUT_MS);

		void validation.then(
			(value) => {
				clearTimeout(timeoutId);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timeoutId);
				reject(error);
			},
		);
	});
