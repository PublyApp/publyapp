import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

export type ServerFailurePayload = {
	responseStatusCode: number;
	status: number;
	title: string;
	detail: string;
	errors?: Record<string, string[]>;
	translationKey?: string;
};

export const toServerFailurePayload = (
	error: unknown,
	fallbackMessage: string,
): ServerFailurePayload => {
	const failure = toApiFailure(error);

	if (failure.kind === 'validation') {
		return {
			responseStatusCode: failure.status,
			status: failure.status,
			title: failure.title ?? 'Validation failed',
			detail: failure.detail ?? 'One or more input fields are invalid.',
			errors: failure.fieldErrors,
			translationKey: failure.translationKey,
		};
	}

	if (failure.kind === 'problem') {
		return {
			responseStatusCode: failure.status,
			status: failure.status,
			title: failure.title ?? 'Request failed',
			detail: failure.detail ?? 'Request failed',
			translationKey: failure.translationKey,
		};
	}

	if (failure.kind === 'unknown' && failure.message) {
		return {
			responseStatusCode: 500,
			status: 500,
			title: 'Request failed',
			detail: failure.message,
		};
	}

	return {
		responseStatusCode: 500,
		status: 500,
		title: 'Request failed',
		detail: fallbackMessage,
	};
};

export const throwServerFailure = (
	error: unknown,
	fallbackMessage: string,
): never => {
	throw toServerFailurePayload(error, fallbackMessage);
};
