import type {
	AbortFailure,
	ApiFailure,
	NetworkFailure,
	ProblemFailure,
	UnknownFailure,
	ValidationFailure,
} from './types';

type RecordShape = Record<string, unknown>;

const asRecord = (value: unknown): RecordShape | undefined => {
	if (!value || typeof value !== 'object') {
		return undefined;
	}

	return value as RecordShape;
};

const toNumber = (value: unknown): number | undefined => {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		return undefined;
	}

	return Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;
};

const toString = (value: unknown): string | undefined => {
	return typeof value === 'string' ? value : undefined;
};

const toRecordOfStringArrays = (
	value: unknown,
): Record<string, string[]> | undefined => {
	if (!value || typeof value !== 'object') {
		return undefined;
	}

	const rows = Object.entries(value as RecordShape);
	if (rows.length === 0) {
		return undefined;
	}

	const parsed: Record<string, string[]> = {};
	for (const [field, candidates] of rows) {
		if (!Array.isArray(candidates)) {
			continue;
		}

		const messages = candidates
			.map((item) => (typeof item === 'string' ? item : String(item ?? '')))
			.filter(Boolean);
		if (messages.length > 0) {
			parsed[field] = messages;
		}
	}

	return Object.keys(parsed).length > 0 ? parsed : undefined;
};

type ProblemLike = {
	translationKey: string | undefined;
	detail: string | undefined;
	title: string | undefined;
	status: number | undefined;
	responseStatusCode: number | undefined;
	errors: Record<string, string[]> | undefined;
};

const readProblemShape = (value: unknown): ProblemLike | undefined => {
	const candidate = asRecord(value);
	if (!candidate) {
		return undefined;
	}

	return {
		translationKey: toString(candidate.translationKey),
		detail: toString(candidate.detail),
		title: toString(candidate.title),
		status: toNumber(candidate.status),
		responseStatusCode: toNumber(candidate.responseStatusCode),
		errors: toRecordOfStringArrays(candidate.errors),
	};
};

const pickResponseStatus = (...values: Array<number | undefined>): number => {
	for (const value of values) {
		if (value !== undefined) {
			return value;
		}
	}

	return 500;
};

const isValidationProblem = (problem: ProblemLike): boolean =>
	problem.status === 422 &&
	problem.errors !== undefined &&
	Object.keys(problem.errors).length > 0;

const parseProblem = (error: unknown): ProblemLike | undefined => {
	const errorRecord = asRecord(error);
	if (!errorRecord) {
		return undefined;
	}

	const bodyProblem = asRecord(errorRecord.body);
	const nestedProblem = asRecord(errorRecord.error);

	const top = readProblemShape(errorRecord);
	const body = bodyProblem ? readProblemShape(bodyProblem) : undefined;
	const nested = nestedProblem ? readProblemShape(nestedProblem) : undefined;

	return body ?? top ?? nested;
};

const toProblemFailure = (error: unknown): ProblemFailure | undefined => {
	const topRecord = asRecord(error);
	const bodyRecord = topRecord ? asRecord(topRecord.body) : undefined;
	const rootProblem = readProblemShape(topRecord);
	const bodyProblem = bodyRecord ? readProblemShape(bodyRecord) : undefined;
	const nestedProblem = readProblemShape(bodyRecord ?? topRecord?.error);

	if (!topRecord && !bodyRecord) {
		return undefined;
	}

	const source = bodyProblem ?? rootProblem ?? nestedProblem;
	if (!source) {
		return undefined;
	}

	const status = source.status ?? source.responseStatusCode ?? 500;

	return {
		kind: 'problem',
		status,
		translationKey: source.translationKey,
		detail: source.detail,
		title: source.title,
		raw: error,
	};
};

const toValidationFailure = (error: unknown): ValidationFailure | undefined => {
	const source = parseProblem(error);
	if (!source || !isValidationProblem(source)) {
		return undefined;
	}

	return {
		kind: 'validation',
		status: pickResponseStatus(source.status, source.responseStatusCode),
		translationKey: source.translationKey,
		detail: source.detail,
		title: source.title,
		fieldErrors: source.errors ?? {},
		raw: error,
	};
};

export const toApiFailure = (error: unknown): ApiFailure => {
	const validationFailure = toValidationFailure(error);
	if (validationFailure) {
		return validationFailure;
	}

	const problemFailure = toProblemFailure(error);
	if (problemFailure) {
		return problemFailure;
	}

	if (
		(typeof DOMException !== 'undefined' &&
			error instanceof DOMException &&
			error.name === 'AbortError') ||
		(error instanceof Error && error.name === 'AbortError')
	) {
		return {
			kind: 'abort',
			raw: error,
		} satisfies AbortFailure;
	}

	if (error instanceof TypeError) {
		const message = error.message.toLowerCase();
		const isNetwork =
			message.includes('fetch') ||
			message.includes('network') ||
			message.includes('failed to fetch') ||
			message.includes('networkerror');
		if (isNetwork) {
			return {
				kind: 'network',
				message: error.message || 'Network error - please check your connection',
				raw: error,
			} satisfies NetworkFailure;
		}
	}

	if (typeof Response !== 'undefined' && error instanceof Response) {
		return {
			kind: 'problem',
			status: error.status,
			translationKey: undefined,
			detail: error.statusText || `HTTP ${error.status}`,
			title: error.statusText || `HTTP ${error.status}`,
			raw: error,
		};
	}

	if (
		error != null &&
		typeof error === 'object' &&
		'responseStatusCode' in error &&
		typeof (error as Record<string, unknown>).responseStatusCode === 'number'
	) {
		const statusCode = (error as { responseStatusCode: number })
			.responseStatusCode;
		return {
			kind: 'problem',
			status: statusCode,
			translationKey: undefined,
			detail: error instanceof Error ? error.message : `HTTP Error ${statusCode}`,
			title: `HTTP Error ${statusCode}`,
			raw: error,
		};
	}

	if (error instanceof Error) {
		return {
			kind: 'unknown',
			message: error.message || 'An unexpected error occurred',
			raw: error,
		} satisfies UnknownFailure;
	}

	return {
		kind: 'unknown',
		message: typeof error === 'string' ? error : 'An unexpected error occurred',
		raw: error,
	};
};

type GetFailureMessageOptions = {
	fallback?: string;
};

export const getFailureMessage = (
	failure: ApiFailure,
	options?: GetFailureMessageOptions,
): string => {
	switch (failure.kind) {
		case 'validation':
			return (
				failure.title ??
				failure.detail ??
				failure.translationKey ??
				options?.fallback ??
				'Validation failed'
			);
		case 'problem':
			return (
				failure.title ??
				failure.detail ??
				failure.translationKey ??
				options?.fallback ??
				'An error occurred'
			);
		case 'network':
			return (
				failure.message ||
				options?.fallback ||
				'Network error - please check your connection'
			);
		case 'abort':
			return '';
		case 'unknown':
			return (
				failure.message ||
				options?.fallback ||
				'Something went wrong'
			);
	}
};
