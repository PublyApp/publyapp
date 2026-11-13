import { useTranslation } from 'react-i18next';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import { useResponseMessageTranslator } from './use-response-message-translator';

/**
 * The text to show when an image upload fails: the API's own (translated)
 * message, or a translated generic one when the request never got an answer
 * (a refused oversize body can reset the connection, which the browser reports
 * as the raw "Failed to fetch"; #2421).
 */
export const useImageUploadFailureMessage = (
	fallbackKey: 'an-error-occurred' | 'logo-upload-failed' = 'an-error-occurred',
) => {
	const { t } = useTranslation('common');
	const translate = useResponseMessageTranslator();

	return (error: unknown): string => {
		const failure = toApiFailure(error);
		if (failure.kind === 'network') {
			return t('image-upload-failed');
		}
		return getFailureMessage(failure, {
			fallback: t(fallbackKey),
			translate,
		});
	};
};
