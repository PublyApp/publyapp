import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

export type ServerFailurePayload = {
	responseStatusCode: number;
	status: number;
	title: string;
	detail: string;
	errors?: Record<string, string[]>;
	translationKey?: string;
};

const toServerFailurePayload = (
	error: unknown,
	fallbackMessage: string,
): ServerFailurePayload => {
	const failure = toApiFailure(error);

	if (failure.kind === 'validation') {
		return {
			responseStatusCode: failure.status,
			status: failure.status,
			// Internal ServerFailure metadata, never rendered raw — the displayed
			// copy comes from t() keyed off .status/.translationKey (__root.tsx).
			// i18n-guard-ignore: no-hardcoded-ui-literal — see comment above.
			title: failure.title ?? 'Validation failed',
			// i18n-guard-ignore: no-hardcoded-ui-literal — see title above.
			detail: failure.detail ?? 'One or more input fields are invalid.',
			errors: failure.fieldErrors,
			translationKey: failure.translationKey,
		};
	}

	if (failure.kind === 'problem') {
		return {
			responseStatusCode: failure.status,
			status: failure.status,
			// i18n-guard-ignore: no-hardcoded-ui-literal — see title above.
			title: failure.title ?? 'Request failed',
			// i18n-guard-ignore: no-hardcoded-ui-literal — see title above.
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

/**
 * A real `Error` subclass carrying the same fields the plain-object failures
 * this module used to throw did — `toApiFailure`'s duck-typed
 * `readProblemDetails` reads any object with these fields regardless of
 * whether it's an `Error`, so this is a drop-in replacement that additionally
 * gets a stack trace and `instanceof Error` support.
 */
export class ServerFailure extends Error {
	responseStatusCode: number;
	status: number;
	title: string;
	detail: string;
	errors?: Record<string, string[]>;
	translationKey?: string;

	constructor(payload: ServerFailurePayload) {
		super(payload.detail);
		this.name = 'ServerFailure';
		this.responseStatusCode = payload.responseStatusCode;
		this.status = payload.status;
		this.title = payload.title;
		this.detail = payload.detail;
		this.errors = payload.errors;
		this.translationKey = payload.translationKey;
	}
}

export const throwServerFailure = (
	error: unknown,
	fallbackMessage: string,
): never => {
	throw new ServerFailure(toServerFailurePayload(error, fallbackMessage));
};

export const throwServerFailurePayload = (
	payload: ServerFailurePayload,
): never => {
	throw new ServerFailure(payload);
};
