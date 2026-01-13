// Types
export type {
	ApiFailure,
	ValidationFailure,
	ProblemFailure,
	NetworkFailure,
	AbortFailure,
	UnknownFailure,
} from './types';

export {
	isValidationFailure,
	isProblemFailure,
	isNetworkFailure,
	isAbortFailure,
	isUnknownFailure,
} from './types';

// Main conversion function
export { toApiFailure, getFailureMessage } from './to-api-failure';

// Form field mapping
export {
	mapValidationErrors,
	formatUnmappedErrors,
	type MapValidationErrorsOptions,
	type MapValidationErrorsResult,
} from './map-validation-errors';

// React Query helpers
export { withFormValidation } from './with-form-validation';

// Schemas (for advanced use cases)
export {
	AppProblemDetailsSchema,
	ValidationProblemDetailsSchema,
	isAppProblemDetailsShape,
	isValidationProblemDetailsShape,
} from './schemas';
