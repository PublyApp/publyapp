import type { UseMutationOptions } from '@tanstack/react-query';
import type { FieldValues, UseFormSetError } from 'react-hook-form';

import {
	type MapValidationErrorsOptions,
	mapValidationErrors,
} from './map-validation-errors';
import { toApiFailure } from './to-api-failure';

/**
 * Wraps mutation options to automatically handle form validation errors.
 *
 * This helper:
 * 1. Sets meta.validationHandledByForm: true (prevents global toast for validation)
 * 2. Maps validation errors to form fields in onError
 * 3. Calls your onError AFTER mapping (so you can access failure and do additional handling)
 *
 * **onError execution order:**
 * 1. Convert error to ApiFailure
 * 2. If validation: map to form fields
 * 3. Call your onError (if provided) - can access error, do additional handling
 * 4. Global handler runs (but skips validation toast due to meta flag)
 *
 * @example
 * const form = useForm<MyFormData>();
 *
 * const { mutate } = useCreateStaffUser(
 *   withFormValidation(form.setError, {
 *     meta: { showSuccessToast: true },
 *     onSuccess: () => navigate('/staff-members'),
 *     onError: (error) => {
 *       // This runs AFTER field errors are mapped
 *       // You can do additional handling here if needed
 *       const failure = toApiFailure(error);
 *       if (failure.kind === 'validation' && failure.fieldErrors['_']) {
 *         // Handle general validation errors specially
 *       }
 *     },
 *   })
 * );
 */
export const withFormValidation = <
	TData = unknown,
	TError = Error,
	TVariables = void,
	TContext = unknown,
	TForm extends FieldValues = FieldValues,
>(
	setError: UseFormSetError<TForm>,
	options: UseMutationOptions<TData, TError, TVariables, TContext> & {
		fieldMapping?: MapValidationErrorsOptions<TForm>['fieldMapping'];
		nonFieldErrorStrategy?: MapValidationErrorsOptions<TForm>['nonFieldErrorStrategy'];
	} = {},
): UseMutationOptions<TData, TError, TVariables, TContext> => {
	const { onError, fieldMapping, nonFieldErrorStrategy, meta, ...rest } =
		options;

	return {
		...rest,
		meta: {
			...meta,
			validationHandledByForm: true, // Prevent global toast for validation errors
		},
		onError: (error, variables, context) => {
			// Step 1: Handle validation errors by mapping to form fields
			const failure = toApiFailure(error);
			if (failure.kind === 'validation') {
				const result = mapValidationErrors(failure, setError, {
					fieldMapping,
					nonFieldErrorStrategy,
				});

				// Log unmapped errors in dev for debugging
				if (result.unmappedErrors.length > 0 && import.meta.env.DEV) {
					console.warn(
						'[withFormValidation] Unmapped validation errors:',
						result.unmappedErrors,
					);
				}
			}

			// Step 2: Call original onError if provided
			// This runs AFTER field mapping, so you can do additional handling
			onError?.(error, variables, context);
		},
	};
};
