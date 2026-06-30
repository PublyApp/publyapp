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
			.filter((item): item is string => typeof item === 'string')
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

const hasMeaningfulProblemShape = (problem: ProblemLike): boolean =>
	problem.status !== undefined ||
	problem.responseStatusCode !== undefined ||
	problem.title !== undefined ||
	problem.detail !== undefined ||
	problem.translationKey !== undefined ||
	(problem.errors !== undefined && Object.keys(problem.errors).length > 0);

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

type ParsedProblemLike = {
	source: ProblemLike;
	body: ProblemLike | undefined;
	root: ProblemLike | undefined;
	nested: ProblemLike | undefined;
};

const parseProblem = (error: unknown): ParsedProblemLike | undefined => {
	const errorRecord = asRecord(error);
	if (!errorRecord) {
		return undefined;
	}

	const bodyProblem = asRecord(errorRecord.body);
	const nestedProblem = asRecord(errorRecord.error);

	const root = readProblemShape(errorRecord);
	const body = bodyProblem ? readProblemShape(bodyProblem) : undefined;
	const nested = nestedProblem ? readProblemShape(nestedProblem) : undefined;
	const candidates = [body, nested, root];
	const source = candidates.find(
		(candidate): candidate is ProblemLike =>
			candidate !== undefined && hasMeaningfulProblemShape(candidate),
	);

	if (!source) {
		return undefined;
	}

	return {
		source,
		body,
		root,
		nested,
	};
};

const toProblemFailure = (error: unknown): ProblemFailure | undefined => {
	const parsedProblem = parseProblem(error);
	if (!parsedProblem) {
		return undefined;
	}

	const { source, root } = parsedProblem;
	const status = pickResponseStatus(
		source.status,
		source.responseStatusCode,
		root?.responseStatusCode,
	);

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
	const parsedProblem = parseProblem(error);
	if (!parsedProblem) {
		return undefined;
	}

	const { body, nested, root } = parsedProblem;
	const source = [body, nested, root].find(
		(problem): problem is ProblemLike =>
			problem !== undefined &&
			problem.errors !== undefined &&
			Object.keys(problem.errors).length > 0,
	);
	if (!source) {
		return undefined;
	}

	const status = pickResponseStatus(
		source.status,
		source.responseStatusCode,
		parsedProblem.root?.responseStatusCode,
	);

	return {
		kind: 'validation',
		status,
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
		const message = error.message;
		const isNetwork =
			/(?:\bfetch\b|\bnetwork\b|failed to fetch|networkerror)/i.test(message);
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
		const statusCode = toNumber((error as { responseStatusCode: number }).responseStatusCode);
		return {
			kind: 'problem',
			status: statusCode ?? 500,
			translationKey: undefined,
			detail:
				statusCode === undefined
					? `HTTP Error 500`
					: error instanceof Error
						? error.message
						: `HTTP Error ${statusCode}`,
			title:
				statusCode === undefined
					? 'HTTP Error 500'
					: `HTTP Error ${statusCode}`,
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
				failure.detail ??
				failure.title ??
				failure.translationKey ??
				options?.fallback ??
				'Validation failed'
			);
		case 'problem':
			return (
				failure.detail ??
				failure.title ??
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
