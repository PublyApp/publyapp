import type { ApiFailure } from '../api-failure/types';
import type {
	MutationFailureFeedback,
	MutationFeedbackIntent,
	MutationSuccessFeedback,
} from './types';

type SuccessResponseFields = {
	translationKey?: string;
	fallbackMessage?: string;
};

const extractSuccessResponseFields = (data: unknown): SuccessResponseFields => {
	if (data === null || typeof data !== 'object' || Array.isArray(data)) {
		return {};
	}

	const response = data as Record<string, unknown>;
	const fields: SuccessResponseFields = {};

	if (typeof response.translationKey === 'string') {
		fields.translationKey = response.translationKey;
	}

	if (typeof response.message === 'string') {
		fields.fallbackMessage = response.message;
	}

	return fields;
};

const getFailureTranslationKey = (failure: ApiFailure): string | undefined => {
	if (failure.kind === 'problem' || failure.kind === 'validation') {
		return failure.translationKey;
	}

	return undefined;
};

const getFailureFallbackMessage = (failure: ApiFailure): string | undefined => {
	switch (failure.kind) {
		case 'problem':
		case 'validation':
			return failure.detail ?? failure.title;
		case 'network':
		case 'unknown':
			return failure.message;
		case 'abort':
			return undefined;
	}
};

export const resolveMutationFailureIntent = (
	failure: ApiFailure,
	feedback: MutationFailureFeedback,
): MutationFeedbackIntent => {
	if (failure.kind === 'abort') {
		return { kind: 'silent', reason: 'abort' };
	}

	if (
		(failure.kind === 'problem' || failure.kind === 'validation') &&
		failure.status === 401
	) {
		return { kind: 'silent', reason: 'unauthorized' };
	}

	if (failure.kind === 'validation' && feedback.validationHandledByForm) {
		return { kind: 'silent', reason: 'handled-validation' };
	}

	if (feedback.skipGlobalErrorHandler) {
		return { kind: 'silent', reason: 'local-error-owner' };
	}

	const translationKey = getFailureTranslationKey(failure);
	const fallbackMessage = getFailureFallbackMessage(failure);
	return {
		kind: 'error',
		failure,
		...(translationKey === undefined ? {} : { translationKey }),
		...(fallbackMessage === undefined ? {} : { fallbackMessage }),
	};
};

export const resolveMutationSuccessIntent = (
	data: unknown,
	feedback: MutationSuccessFeedback,
): MutationFeedbackIntent => {
	if (feedback.successMessage !== undefined) {
		return { kind: 'success', translationKey: feedback.successMessage };
	}

	if (feedback.silentSuccess) {
		return { kind: 'silent', reason: 'configured-silent-success' };
	}

	return {
		kind: 'success',
		...extractSuccessResponseFields(data),
	};
};
