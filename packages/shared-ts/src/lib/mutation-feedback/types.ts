import type { ApiFailure } from '../api-failure/types';

export type MutationSuccessFeedback =
	| {
			successMessage: string;
			showSuccessToast?: never;
			silentSuccess?: never;
	  }
	| {
			showSuccessToast: true;
			successMessage?: never;
			silentSuccess?: never;
	  }
	| {
			silentSuccess: true;
			successMessage?: never;
			showSuccessToast?: never;
	  };

export type MutationFailureFeedback = {
	validationHandledByForm?: boolean;
	skipGlobalErrorHandler?: boolean;
	skipAuthedErrorBackstop?: boolean;
};

export type MutationFeedbackMeta = MutationSuccessFeedback &
	MutationFailureFeedback;

export type MutationFeedbackIntent =
	| {
			kind: 'success';
			translationKey?: string;
			fallbackMessage?: string;
	  }
	| {
			kind: 'error';
			failure: ApiFailure;
			translationKey?: string;
			fallbackMessage?: string;
	  }
	| {
			kind: 'silent';
			reason:
				| 'abort'
				| 'unauthorized'
				| 'handled-validation'
				| 'local-error-owner'
				| 'configured-silent-success';
	  };
