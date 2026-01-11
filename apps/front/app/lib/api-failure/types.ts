/**
 * Discriminated union representing all possible API failure types.
 *
 * This approach:
 * - Works across SSR/client boundaries (plain objects serialize correctly)
 * - Enables exhaustive switch statements with TypeScript
 * - Avoids instanceof/prototype chain issues
 */

/**
 * Validation error from the API (HTTP 422).
 * Contains field-level errors that should be mapped to form fields.
 */
export type ValidationFailure = {
	kind: 'validation';
	status: number;
	translationKey: string | undefined;
	detail: string | undefined;
	title: string | undefined;
	fieldErrors: Record<string, string[]>;
	raw: unknown;
};

/**
 * General API error (HTTP 400, 401, 403, 404, 500, etc.).
 * Should be displayed as a toast notification.
 */
export type ProblemFailure = {
	kind: 'problem';
	status: number;
	translationKey: string | undefined;
	detail: string | undefined;
	title: string | undefined;
	raw: unknown;
};

/**
 * Network-level failure (offline, DNS, CORS, timeout).
 * Should be displayed as a toast notification.
 */
export type NetworkFailure = {
	kind: 'network';
	message: string;
	raw: unknown;
};

/**
 * Request was aborted/cancelled (navigation, component unmount, timeout).
 * Should NEVER be displayed to user - this is expected behavior.
 */
export type AbortFailure = {
	kind: 'abort';
	raw: unknown;
};

/**
 * Unknown/unexpected error.
 * Should be logged and displayed as a generic toast.
 */
export type UnknownFailure = {
	kind: 'unknown';
	message: string;
	raw: unknown;
};

/**
 * Union of all failure types.
 */
export type ApiFailure =
	| ValidationFailure
	| ProblemFailure
	| NetworkFailure
	| AbortFailure
	| UnknownFailure;

/**
 * Type guard for ValidationFailure.
 */
export const isValidationFailure = (
	failure: ApiFailure,
): failure is ValidationFailure => {
	return failure.kind === 'validation';
};

/**
 * Type guard for ProblemFailure.
 */
export const isProblemFailure = (
	failure: ApiFailure,
): failure is ProblemFailure => {
	return failure.kind === 'problem';
};

/**
 * Type guard for NetworkFailure.
 */
export const isNetworkFailure = (
	failure: ApiFailure,
): failure is NetworkFailure => {
	return failure.kind === 'network';
};

/**
 * Type guard for AbortFailure.
 */
export const isAbortFailure = (
	failure: ApiFailure,
): failure is AbortFailure => {
	return failure.kind === 'abort';
};

/**
 * Type guard for UnknownFailure.
 */
export const isUnknownFailure = (
	failure: ApiFailure,
): failure is UnknownFailure => {
	return failure.kind === 'unknown';
};
