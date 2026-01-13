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
 * IMPORTANT: Requires responseStatusCode (Kiota's discriminator) to prevent
 * false positives from random objects. This field is always present on Kiota errors.
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
		// responseStatusCode is REQUIRED - it's the discriminator that identifies Kiota errors
		responseStatusCode: z.number(),
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
	return AppProblemDetailsSchema.safeParse(error).success;
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
