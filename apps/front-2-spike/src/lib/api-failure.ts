import {
	TENANT_HINTS_COOKIE_KEY,
	TENANT_HINTS_COOKIE_KEY_LEGACY,
} from '@org/shared-ts/lib/constants';

type ProblemFailure = {
	kind: 'problem';
	status: number;
	translationKey?: string | undefined;
	detail?: string | undefined;
	title?: string | undefined;
	raw: unknown;
};

type ValidationFailure = {
	kind: 'validation';
	status: number;
	translationKey?: string | undefined;
	detail?: string | undefined;
	title?: string | undefined;
	fieldErrors: Record<string, string[]>;
	raw: unknown;
};

type NetworkFailure = {
	kind: 'network';
	message: string;
	raw: unknown;
};

type UnknownFailure = {
	kind: 'unknown';
	message: string;
	raw: unknown;
};

type AbortFailure = {
	kind: 'abort';
	raw: unknown;
};

export type ApiFailure =
	| ProblemFailure
	| ValidationFailure
	| NetworkFailure
	| UnknownFailure
	| AbortFailure;

export const toApiFailure = (error: unknown): ApiFailure => {
	// Kiota-style object failures (most common in this spike).
	if (isApiProblemObject(error)) {
		const body = error.body;
		const responseStatusCode = getNumberField(error, 'responseStatusCode');
		const statusFromBody = getNumberField(body, 'status');
		const statusFromProblem = getNumberField(error, 'status');
		const bodyTranslationKey = extractTranslationKeyFromBody(body);
		const nestedErrorTranslationKey = extractTranslationKeyFromBody(
			error.error,
		);
		const directTranslationKey =
			typeof error.translationKey === 'string'
				? error.translationKey
				: undefined;
		const translationKey =
			bodyTranslationKey ??
			extractTranslationKeyFromBody(error) ??
			directTranslationKey ??
			nestedErrorTranslationKey;
		const fieldErrors =
			extractFieldErrorsFromBody(body) ?? extractFieldErrorsFromBody(error);
		const status =
			responseStatusCode ?? statusFromBody ?? statusFromProblem ?? 500;

		if (status === 422 && fieldErrors && Object.keys(fieldErrors).length > 0) {
			return {
				kind: 'validation',
				status,
				translationKey,
				detail: getStringField(error, 'detail'),
				title: getStringField(error, 'title'),
				fieldErrors,
				raw: error,
			};
		}

		return {
			kind: 'problem',
			status,
			translationKey,
			detail: getStringField(error, 'detail'),
			title: getStringField(error, 'title'),
			raw: error,
		};
	}

	if (error instanceof Error && error.name === 'TypeError') {
		return {
			kind: 'network',
			message: error.message || 'Network failure',
			raw: error,
		};
	}

	if (error instanceof DOMException && error.name === 'AbortError') {
		return {
			kind: 'abort',
			raw: error,
		};
	}

	if (typeof Response !== 'undefined' && error instanceof Response) {
		return {
			kind: 'problem',
			status: error.status,
			detail: error.statusText || `HTTP ${error.status}`,
			raw: error,
		};
	}

	if (error instanceof Error) {
		return {
			kind: 'unknown',
			message: error.message || 'Unknown error',
			raw: error,
		};
	}

	return {
		kind: 'unknown',
		message: typeof error === 'string' ? error : 'Unknown error',
		raw: error,
	};
};

const getNumberField = (source: unknown, key: string): number | undefined => {
	if (!source || typeof source !== 'object') {
		return undefined;
	}

	const value = (source as Record<string, unknown>)[key];

	return typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= 100 &&
		value <= 599
		? value
		: undefined;
};

const getStringField = (
	source: Record<string, unknown>,
	key: string,
): string | undefined => {
	const value = source[key];

	return typeof value === 'string' ? value : undefined;
};

const isApiProblemObject = (
	error: unknown,
): error is Record<string, unknown> => {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const errorRecord = error as Record<string, unknown>;
	const hasResponseStatusCode =
		getNumberField(errorRecord, 'responseStatusCode') !== undefined;
	const hasBodyStatus =
		getNumberField(errorRecord.body, 'status') !== undefined;
	const hasProblemStatus = getNumberField(errorRecord, 'status') !== undefined;

	if (hasResponseStatusCode || hasBodyStatus) {
		return true;
	}

	return (
		hasProblemStatus &&
		('type' in errorRecord ||
			'title' in errorRecord ||
			'detail' in errorRecord ||
			'translationKey' in errorRecord)
	);
};

export const getFailureMessage = (
	failure: ApiFailure,
	options?: {
		fallback?: string;
	},
): string => {
	switch (failure.kind) {
		case 'problem':
			return (
				failure.title ??
				failure.detail ??
				failure.translationKey ??
				options?.fallback ??
				'Request failed'
			);
		case 'validation':
			return (
				failure.title ??
				failure.detail ??
				failure.translationKey ??
				options?.fallback ??
				'Validation failed'
			);
		case 'network':
			return failure.message || options?.fallback || 'Network failed';
		case 'abort':
			return '';
		case 'unknown':
			return failure.message || options?.fallback || 'Unknown request error';
	}
};

export const clearTenantSuspensionCookie = () => {
	if (typeof document === 'undefined') {
		return;
	}

	const expired = new Date(0).toUTCString();
	const base = `; path=/; expires=${expired}; max-age=0`;
	document.cookie = `${TENANT_HINTS_COOKIE_KEY}=;${base}`;
	document.cookie = `${TENANT_HINTS_COOKIE_KEY_LEGACY}=;${base}`;
};

const extractTranslationKeyFromBody = (body: unknown): string | undefined => {
	if (!body) {
		return undefined;
	}

	if (typeof body === 'object' && body !== null) {
		const candidate = (body as Record<string, unknown>).translationKey;
		return typeof candidate === 'string' && candidate.length > 0
			? candidate
			: undefined;
	}

	return undefined;
};

const extractFieldErrorsFromBody = (
	body: unknown,
): Record<string, string[]> | undefined => {
	if (!body || typeof body !== 'object' || body === null) {
		return undefined;
	}

	const candidate = (body as Record<string, unknown>).errors;
	if (!candidate || typeof candidate !== 'object') {
		return undefined;
	}

	const candidates = Object.entries(candidate as Record<string, unknown>);
	const parsed = candidates.flatMap(([field, rawMessages]) => {
		if (!Array.isArray(rawMessages)) {
			return [];
		}

		const messages = rawMessages
			.map((item) => (typeof item === 'string' ? item : String(item ?? '')))
			.filter((item) => item.length > 0);

		return messages.length > 0 ? [[field, messages]] : [];
	});

	return parsed.length > 0 ? Object.fromEntries(parsed) : undefined;
};
