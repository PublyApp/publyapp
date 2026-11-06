import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import type { JsonObject } from '@org/shared-ts/types/json.types';

export type ServerFailurePayload = {
	responseStatusCode: number;
	status: number;
	title: string;
	detail: string;
	errors?: Record<string, string[]>;
	translationKey?: string;
	/** The API problem's `traceId` extension, when the response carried one. */
	traceId?: string;
};

const readTraceId = (
	extensions: JsonObject | undefined,
): string | undefined => {
	const traceId = extensions?.traceId;
	if (typeof traceId !== 'string' || !traceId.trim()) {
		return undefined;
	}
	return traceId.trim();
};

const toServerFailurePayload = (error: unknown, fallbackMessage: string) => {
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
			traceId: readTraceId(failure.extensions),
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
			traceId: readTraceId(failure.extensions),
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
	traceId?: string;

	constructor(payload: ServerFailurePayload) {
		super(payload.detail);
		this.name = 'ServerFailure';
		this.responseStatusCode = payload.responseStatusCode;
		this.status = payload.status;
		this.title = payload.title;
		this.detail = payload.detail;
		this.errors = payload.errors;
		this.translationKey = payload.translationKey;
		this.traceId = payload.traceId;
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
