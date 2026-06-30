export type ProblemFailure = {
	kind: 'problem';
	status: number;
	translationKey: string | undefined;
	detail: string | undefined;
	title: string | undefined;
	raw: unknown;
};

export type ValidationFailure = {
	kind: 'validation';
	status: number;
	translationKey: string | undefined;
	detail: string | undefined;
	title: string | undefined;
	fieldErrors: Record<string, string[]>;
	raw: unknown;
};

export type NetworkFailure = {
	kind: 'network';
	message: string;
	raw: unknown;
};

export type AbortFailure = {
	kind: 'abort';
	raw: unknown;
};

export type UnknownFailure = {
	kind: 'unknown';
	message: string;
	raw: unknown;
};

export type ApiFailure =
	| ProblemFailure
	| ValidationFailure
	| NetworkFailure
	| AbortFailure
	| UnknownFailure;

export const isValidationFailure = (
	failure: ApiFailure,
): failure is ValidationFailure => {
	return failure.kind === 'validation';
};

export const isProblemFailure = (
	failure: ApiFailure,
): failure is ProblemFailure => {
	return failure.kind === 'problem';
};

export const isNetworkFailure = (
	failure: ApiFailure,
): failure is NetworkFailure => {
	return failure.kind === 'network';
};

export const isAbortFailure = (
	failure: ApiFailure,
): failure is AbortFailure => {
	return failure.kind === 'abort';
};

export const isUnknownFailure = (
	failure: ApiFailure,
): failure is UnknownFailure => {
	return failure.kind === 'unknown';
};
