import type { i18n as I18nInstance, Namespace } from 'i18next';

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
	namespace: Namespace,
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

export type ToastMethod = 'default' | 'error' | 'info' | 'success' | 'warning';

const displayToast = async (
	method: ToastMethod,
	message: string,
	description?: string,
): Promise<void> => {
	const sonner = await loadSonner();
	if (!sonner) {
		return;
	}

	try {
		if (method === 'default') {
			if (description === undefined) {
				sonner.toast(message);
			} else {
				sonner.toast(message, { description });
			}
		} else if (description === undefined) {
			sonner.toast[method](message);
		} else {
			sonner.toast[method](message, { description });
		}
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

/**
 * Local, message-only toasts for inline mutation feedback. The optional
 * `description` parameter and the `default` variant are the toast-contrast
 * fixture's way of raising a described neutral toast through the real
 * product API (routes/field-validation.tsx) — that fixture is their only
 * consumer today; every product call site passes a single message string.
 *
 * `satisfies Record<ToastMethod, …>` pins this object to the `ToastMethod`
 * union: the toast-contrast guard's type-level equality check ties this
 * adapter's keys to the measured variant classes
 * (e2e/toast-contrast.spec.ts), so growing a method here without measuring
 * a toast for it fails the guard, and the `loading` method is deliberately
 * absent — `loading` toasts are not raisable, which is the reason the
 * guard excludes that class.
 */
export const toastLocalMutationResult = {
	default(message: string, description?: string): void {
		void displayToast('default', message, description);
	},
	success(message: string, description?: string): void {
		void displayToast('success', message, description);
	},
	error(message: string, description?: string): void {
		void displayToast('error', message, description);
	},
	warning(message: string, description?: string): void {
		void displayToast('warning', message, description);
	},
	info(message: string, description?: string): void {
		void displayToast('info', message, description);
	},
} satisfies Record<
	ToastMethod,
	(message: string, description?: string) => void
>;
