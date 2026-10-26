import { useTranslation } from 'react-i18next';

const RESPONSE_MESSAGE_NAMESPACE = 'response-message';

/**
 * Response keys whose French translation says as much as the API's English
 * `detail`, so showing it instead loses nothing. Every other key keeps the
 * `detail` (the owner's "transparent failure causes" rule): the generic status
 * keys (`bad-request`, `not-found`, `unprocessable-entity`, ...) translate to a
 * bare status name, and keys like `publish-content-too-long` have a detail that
 * carries the limit and the destination.
 */
const AS_INFORMATIVE_AS_DETAIL: ReadonlySet<string> = new Set([
	'publication-rendition-locked',
	'publication-rendition-needs-review',
	'publication-rendition-superseded',
	'publication-rendition-conflict',
	'post-segments-locked',
]);

const RENDITION_INVALID_PROBLEM = 'publish-rendition-invalid';

const asText = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

const asPositiveInteger = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isInteger(value) && value > 0
		? value
		: undefined;

/**
 * The `translate` option of `getFailureMessage`: a localized message for a
 * backend `translationKey`, or `undefined` to keep the API's own `detail`.
 *
 * - English UI: always `undefined`; the `detail` is already English and more
 *   specific than the bundle's generic entry.
 * - A key whose translation is as informative as the detail resolves through
 *   the always-loaded `response-message` namespace.
 * - `publish-rendition-invalid` is built from the problem's structured members
 *   (`reason`, `destination`, `segmentNumber`), so the message still names the
 *   destination and the segment; without them the `detail` stays.
 */
export const useResponseMessageTranslator = () => {
	const { t, i18n } = useTranslation([RESPONSE_MESSAGE_NAMESPACE, 'posts']);
	const isEnglish = (i18n?.resolvedLanguage ?? i18n?.language ?? '').startsWith(
		'en',
	);

	const translateRenditionInvalid = (
		extensions: Record<string, unknown>,
	): string | undefined => {
		const destination = asText(extensions.destination);
		const index = asPositiveInteger(extensions.segmentNumber);
		if (destination === undefined || index === undefined) {
			return undefined;
		}

		switch (extensions.reason) {
			case 'SegmentTextBlank':
				return t('posts:override-blank', { destination, index });
			case 'SegmentTextTooLong':
				return t('posts:override-over-limit', { destination, index });
			case 'SegmentOutOfRange':
				return t('posts:override-segment-missing', { destination, index });
			default:
				return undefined;
		}
	};

	return (
		translationKey: string,
		extensions: Record<string, unknown>,
	): string | undefined => {
		if (isEnglish) {
			return undefined;
		}

		if (translationKey === RENDITION_INVALID_PROBLEM) {
			return translateRenditionInvalid(extensions);
		}

		if (!AS_INFORMATIVE_AS_DETAIL.has(translationKey)) {
			return undefined;
		}

		// A missing key renders as itself; naming it as the default value is how
		// an absent entry is told apart from a real one.
		const message = t(translationKey, {
			ns: RESPONSE_MESSAGE_NAMESPACE,
			defaultValue: translationKey,
		});
		// No parameters are passed, so a message that still has placeholders is
		// not usable as is.
		if (message === translationKey || message.includes('{{')) {
			return undefined;
		}
		return message;
	};
};
