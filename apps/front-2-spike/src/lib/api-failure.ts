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
	if (
		error != null &&
		typeof error === 'object' &&
		'responseStatusCode' in error
	) {
		const responseStatusCode = Number(
			(error as { responseStatusCode?: unknown }).responseStatusCode,
		);
		const body = (error as { body?: unknown })?.body;
		const statusFromBody = Number(
			(body as { status?: unknown }).status as number,
		);
		const bodyTranslationKey = extractTranslationKeyFromBody(body);
		const nestedErrorTranslationKey = extractTranslationKeyFromBody(
			(error as { error?: unknown })?.error,
		);
		const directTranslationKey =
			typeof (error as { translationKey?: unknown }).translationKey === 'string'
				? ((error as { translationKey?: unknown }).translationKey as string)
				: undefined;
		const translationKey =
			bodyTranslationKey ??
			extractTranslationKeyFromBody(error as Record<string, unknown>) ??
			directTranslationKey ??
			nestedErrorTranslationKey;
		const fieldErrors = extractFieldErrorsFromBody(body);
		const status = Number.isNaN(responseStatusCode)
			? Number.isNaN(statusFromBody)
				? Number((error as { status?: number }).status ?? 500)
				: statusFromBody
			: responseStatusCode;

		if (status === 422 && fieldErrors && Object.keys(fieldErrors).length > 0) {
			return {
				kind: 'validation',
				status,
				translationKey,
				detail: (error as { detail?: unknown }).detail as string | undefined,
				title: (error as { title?: unknown }).title as string | undefined,
				fieldErrors,
				raw: error,
			};
		}

		return {
			kind: 'problem',
			status,
			translationKey,
			detail: (error as { detail?: unknown }).detail as string | undefined,
			title: (error as { title?: unknown }).title as string | undefined,
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
