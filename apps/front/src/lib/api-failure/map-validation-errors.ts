import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';

import type { ValidationFailure } from './types';

/**
 * Options for mapping validation errors to form fields.
 */
export type MapValidationErrorsOptions<TForm extends FieldValues> = {
	/**
	 * Maps server field names to form field names.
	 * Use when server uses different naming conventions (e.g., PascalCase vs camelCase).
	 *
	 * @example
	 * { 'Email': 'email', 'FirstName': 'firstName' }
	 */
	fieldMapping?: Record<string, FieldPath<TForm>>;

	/**
	 * If true, converts PascalCase server field names to camelCase automatically.
	 * @default true
	 */
	autoConvertCase?: boolean;

	/**
	 * How to handle non-field errors (empty string "", "_", "general", or nested paths).
	 * - 'root': Set as root form error (form.setError('root', ...))
	 * - 'ignore': Silently ignore these errors
	 * - 'collect': Return in unmappedErrors for custom handling
	 * @default 'collect'
	 */
	nonFieldErrorStrategy?: 'root' | 'ignore' | 'collect';
};

/**
 * Result of mapping validation errors.
 */
export type MapValidationErrorsResult = {
	/** Number of errors successfully mapped to form fields */
	mappedCount: number;
	/** Errors that couldn't be mapped to any form field */
	unmappedErrors: Array<{ field: string; messages: string[] }>;
};

/**
 * Converts PascalCase to camelCase.
 */
const toCamelCase = (str: string): string => {
	if (str.length === 0) return str;

	// If the whole string is uppercase (e.g., "ID"), just lowercase it.
	if (/^[A-Z0-9_]+$/.test(str)) {
		return str.toLowerCase();
	}

	// Handle leading acronyms: "XMLParser" -> "xmlParser"
	const leadingAcronymMatch = str.match(/^[A-Z]+(?=[A-Z][a-z])/);
	if (leadingAcronymMatch) {
		const prefix = leadingAcronymMatch[0].toLowerCase();
		return prefix + str.slice(leadingAcronymMatch[0].length);
	}

	// Default: lowercase the first character: "UserId" -> "userId"
	return str.charAt(0).toLowerCase() + str.slice(1);
};

/**
 * Checks if a field name is a "non-field" error (general form error, not tied to a specific field).
 * Common patterns: "", "_", "general", "$", or dot-notation paths the form doesn't have.
 */
const isNonFieldError = (fieldName: string): boolean => {
	const nonFieldPatterns = ['', '_', 'general', '$', 'root'];
	return nonFieldPatterns.includes(fieldName.toLowerCase());
};

/**
 * Maps server validation errors to React Hook Form field errors.
 *
 * This function:
 * - Sets form field errors using setError()
 * - Handles field name mapping (server vs form naming conventions)
 * - Handles nested field names (e.g., "User.Email" -> "user.email" in RHF)
 * - Handles non-field errors ("", "_", "general") based on strategy
 * - Returns unmapped errors for optional toast display
 *
 * NOTE: RHF's setError doesn't throw for unknown fields - it just won't show.
 * If a field error doesn't appear, ensure the field name matches your form schema.
 * Use fieldMapping for server->form name translation.
 *
 * @param failure - ValidationFailure from toApiFailure()
 * @param setError - React Hook Form's setError function
 * @param options - Mapping options
 * @returns Result with mapped count and unmapped errors
 *
 * @example
 * const { mutate } = useCreateUser({
 *   onError: (error) => {
 *     const failure = toApiFailure(error);
 *     if (failure.kind === 'validation') {
 *       const result = mapValidationErrors(failure, form.setError, {
 *         fieldMapping: { 'Email': 'email' },
 *         nonFieldErrorStrategy: 'root', // Set general errors as root form error
 *       });
 *       if (result.unmappedErrors.length > 0) {
 *         // Optionally toast unmapped errors
 *       }
 *     }
 *   }
 * });
 */
export const mapValidationErrors = <TForm extends FieldValues>(
	failure: ValidationFailure,
	setError: UseFormSetError<TForm>,
	options: MapValidationErrorsOptions<TForm> = {},
): MapValidationErrorsResult => {
	const {
		fieldMapping = {},
		autoConvertCase = true,
		nonFieldErrorStrategy = 'collect',
	} = options;

	const result: MapValidationErrorsResult = {
		mappedCount: 0,
		unmappedErrors: [],
	};

	for (const [serverField, messages] of Object.entries(failure.fieldErrors)) {
		if (!messages || messages.length === 0) continue;

		// Handle non-field errors (general form errors)
		if (isNonFieldError(serverField)) {
			switch (nonFieldErrorStrategy) {
				case 'root':
					// Set as root form error
					setError('root' as FieldPath<TForm>, {
						type: 'server',
						message: messages.join(', '),
					});
					result.mappedCount++;
					break;
				case 'ignore':
					// Silently ignore
					break;
				case 'collect':
				default:
					result.unmappedErrors.push({ field: serverField, messages });
					break;
			}
			continue;
		}

		// Determine the form field name
		let formField: string;

		// 1. Check explicit mapping first
		if (serverField in fieldMapping) {
			formField = fieldMapping[serverField];
		}
		// 2. Handle nested paths (e.g., "User.Email" -> "user.email")
		else if (serverField.includes('.')) {
			formField = autoConvertCase
				? serverField.split('.').map(toCamelCase).join('.')
				: serverField;
		}
		// 3. Try auto case conversion
		else if (autoConvertCase) {
			formField = toCamelCase(serverField);
		}
		// 4. Use server field name as-is
		else {
			formField = serverField;
		}

		// Set the error on the form field
		// Note: RHF's setError doesn't throw for unknown fields - it just won't display
		setError(formField as FieldPath<TForm>, {
			type: 'server',
			message: messages[0], // Show first error message
		});
		result.mappedCount++;
	}

	return result;
};

/**
 * Formats unmapped errors into a single string for toast display.
 */
export const formatUnmappedErrors = (
	unmappedErrors: Array<{ field: string; messages: string[] }>,
): string => {
	return unmappedErrors
		.map(({ field, messages }) => `${field}: ${messages.join(', ')}`)
		.join('\n');
};
