import type { i18n as I18nInstance } from 'i18next';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { resolveMutationFailureIntent } from '@org/shared-ts/lib/mutation-feedback/policy';
import type { MutationFeedbackIntent } from '@org/shared-ts/lib/mutation-feedback/types';

const COMMON_NAMESPACE = 'common';
const RESPONSE_MESSAGE_NAMESPACE = 'response-message';
const GENERIC_ERROR_KEY = 'an-error-occurred';
const GENERIC_ERROR_FALLBACK = 'An error occurred';

let browserI18n: I18nInstance | undefined;
let sonnerModulePromise: Promise<typeof import('sonner')> | null = null;

const isBrowser = (): boolean => typeof window !== 'undefined';

export const registerMutationToastI18n = (
	instance: I18nInstance | undefined,
): void => {
	if (!isBrowser()) {
		return;
	}

	browserI18n = instance;
};

const loadSonner = async (): Promise<typeof import('sonner') | undefined> => {
	if (!isBrowser()) {
		return undefined;
	}

	if (sonnerModulePromise === null) {
		sonnerModulePromise = import('sonner');
	}

	try {
		return await sonnerModulePromise;
	} catch (error) {
		sonnerModulePromise = null;
		logger.error('[Mutation Toast Error]', { error });
		return undefined;
	}
};

const translateIfPresent = (
	key: string,
	namespace: string,
): string | undefined => {
	const instance = browserI18n;
	if (!instance || !instance.exists(key, { ns: namespace })) {
		return undefined;
	}

	return instance.t(key, { ns: namespace });
};

const resolveMessage = (intent: MutationFeedbackIntent): string | undefined => {
	if (intent.kind === 'silent') {
		return undefined;
	}

	if (intent.kind === 'error') {
		if (intent.translationKey) {
			const responseMessage = translateIfPresent(
				intent.translationKey,
				RESPONSE_MESSAGE_NAMESPACE,
			);
			if (responseMessage !== undefined) {
				return responseMessage;
			}
		}

		return (
			intent.fallbackMessage ??
			translateIfPresent(GENERIC_ERROR_KEY, COMMON_NAMESPACE) ??
			GENERIC_ERROR_FALLBACK
		);
	}

	if (intent.translationKey) {
		const responseMessage = translateIfPresent(
			intent.translationKey,
			RESPONSE_MESSAGE_NAMESPACE,
		);
		if (responseMessage !== undefined) {
			return responseMessage;
		}

		const commonMessage = translateIfPresent(
			intent.translationKey,
			COMMON_NAMESPACE,
		);
		if (commonMessage !== undefined) {
			return commonMessage;
		}
	}

	return intent.fallbackMessage;
};

type ToastMethod = 'error' | 'info' | 'success' | 'warning';

const displayToast = async (
	method: ToastMethod,
	message: string,
): Promise<void> => {
	const sonner = await loadSonner();
	if (!sonner) {
		return;
	}

	try {
		sonner.toast[method](message);
	} catch (error) {
		logger.error('[Mutation Toast Error]', { error });
	}
};

export const displayMutationFeedback = async (
	intent: MutationFeedbackIntent,
): Promise<void> => {
	if (intent.kind === 'silent' || !isBrowser()) {
		return;
	}

	const message = resolveMessage(intent);
	if (!message) {
		return;
	}

	await displayToast(intent.kind, message);
};

export const displayLocalMutationFailure = async (
	error: unknown,
	fallbackMessage?: string,
): Promise<void> => {
	const failure = toApiFailure(error);
	const intent = resolveMutationFailureIntent(failure, {});

	if (intent.kind !== 'error') {
		await displayMutationFeedback(intent);
		return;
	}

	await displayMutationFeedback(
		intent.fallbackMessage === undefined && fallbackMessage !== undefined
			? { ...intent, fallbackMessage }
			: intent,
	);
};

export const toastLocalMutationResult = {
	success(message: string): void {
		void displayToast('success', message);
	},
	error(message: string): void {
		void displayToast('error', message);
	},
	warning(message: string): void {
		void displayToast('warning', message);
	},
	info(message: string): void {
		void displayToast('info', message);
	},
};
