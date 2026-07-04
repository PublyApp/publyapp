import { z } from 'zod';

/**
 * Zod schema for RFC 7807 ProblemDetails with our custom translationKey.
 *
 * Using Zod instead of simple 'in' checks because:
 * - Validates the actual shape, not just property existence
 * - Prevents false positives from random objects with 'detail' property
 * - Provides type inference automatically
 * - Already in the stack (used for form validation with i18n)
 */

/**
 * Base ProblemDetails schema matching Kiota's generated AppProblemDetails.
 *
 * Uses .passthrough() to preserve any extra Kiota fields (responseHeaders, etc.)
 * that we don't explicitly define but might need later.
 *
 * responseStatusCode is optional because SSR/error-boundary paths can receive
 * plain RFC 7807 bodies without Kiota transport metadata.
 */
export const AppProblemDetailsSchema = z
	.object({
		// RFC 7807 standard fields
		type: z.string().nullish(),
		title: z.string().nullish(),
		status: z.number().nullish(),
		detail: z.string().nullish(),
		instance: z.string().nullish(),

		// Our custom extension for i18n
		translationKey: z.string().nullish(),

		// Kiota's ApiError fields (added during error handling)
		responseStatusCode: z.number().nullish(),
		responseHeaders: z.record(z.array(z.string())).optional(),
	})
	.passthrough(); // Preserve any extra fields from Kiota

/**
 * ValidationProblemDetails schema - extends AppProblemDetails with errors dictionary.
 */
export const ValidationProblemDetailsSchema = AppProblemDetailsSchema.extend({
	errors: z.record(z.array(z.string())).nullish(),
}).passthrough();

/**
 * Inferred types from schemas.
 */
export type AppProblemDetailsShape = z.infer<typeof AppProblemDetailsSchema>;
export type ValidationProblemDetailsShape = z.infer<
	typeof ValidationProblemDetailsSchema
>;

/**
 * Type guard: checks if error matches AppProblemDetails shape.
 */
export const isAppProblemDetailsShape = (
	error: unknown,
): error is AppProblemDetailsShape => {
	const result = AppProblemDetailsSchema.safeParse(error);
	return result.success && hasProblemDetailsMarker(result.data);
};

/**
 * Type guard: checks if error matches ValidationProblemDetails shape.
 * Must have non-null errors property with at least one entry.
 */
export const isValidationProblemDetailsShape = (
	error: unknown,
): error is ValidationProblemDetailsShape => {
	const result = ValidationProblemDetailsSchema.safeParse(error);
	if (!result.success) return false;

	// Must have actual errors to be considered a validation error
	const errors = result.data.errors;
	return errors != null && Object.keys(errors).length > 0;
};

/**
 * Safe parse that returns the data if valid, undefined otherwise.
 */
export const parseAppProblemDetails = (
	error: unknown,
): AppProblemDetailsShape | undefined => {
	const result = AppProblemDetailsSchema.safeParse(error);
	if (!result.success) {
		return undefined;
	}
	if (!hasProblemDetailsMarker(result.data)) {
		return undefined;
	}
	return result.data;
};

export const parseValidationProblemDetails = (
	error: unknown,
): ValidationProblemDetailsShape | undefined => {
	const result = ValidationProblemDetailsSchema.safeParse(error);
	if (!result.success) return undefined;
	if (!result.data.errors || Object.keys(result.data.errors).length === 0)
		return undefined;
	return result.data;
};

const hasProblemDetailsMarker = (data: AppProblemDetailsShape): boolean => {
	return (
		data.type != null ||
		data.instance != null ||
		data.translationKey != null ||
		data.responseStatusCode != null
	);
};
