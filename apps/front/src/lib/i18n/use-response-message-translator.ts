import { useTranslation } from 'react-i18next';

const RESPONSE_MESSAGE_NAMESPACE = 'response-message';

/**
 * The `translate` option of `getFailureMessage`: resolves a backend
 * `translationKey` in the active locale (the always-loaded `response-message`
 * namespace), or `undefined` when the locale has no entry for the key, so the
 * message falls back to the API's own English `detail`. Call sites keep the
 * `getFailureMessage(toApiFailure(error), { fallback, translate })` shape and
 * never look keys up themselves.
 */
export const useResponseMessageTranslator = () => {
	const { t } = useTranslation([RESPONSE_MESSAGE_NAMESPACE]);

	return (translationKey: string): string | undefined => {
		// A missing key renders as itself; naming it as the default value is how
		// an absent entry is told apart from a real one.
		const message = t(translationKey, {
			ns: RESPONSE_MESSAGE_NAMESPACE,
			defaultValue: translationKey,
		});
		return message === translationKey ? undefined : message;
	};
};
