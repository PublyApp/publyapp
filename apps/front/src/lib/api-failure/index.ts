// Types

// Form field mapping
export {
	formatUnmappedErrors,
	type MapValidationErrorsOptions,
	type MapValidationErrorsResult,
	mapValidationErrors,
} from './map-validation-errors';
// Schemas (for advanced use cases)
export {
	AppProblemDetailsSchema,
	isAppProblemDetailsShape,
	isValidationProblemDetailsShape,
	ValidationProblemDetailsSchema,
} from './schemas';
// Main conversion function
export { getFailureMessage, toApiFailure } from './to-api-failure';
export type {
	AbortFailure,
	ApiFailure,
	NetworkFailure,
	ProblemFailure,
	UnknownFailure,
	ValidationFailure,
} from './types';
export {
	isAbortFailure,
	isNetworkFailure,
	isProblemFailure,
	isUnknownFailure,
	isValidationFailure,
} from './types';
// React Query helpers
export { withFormValidation } from './with-form-validation';
