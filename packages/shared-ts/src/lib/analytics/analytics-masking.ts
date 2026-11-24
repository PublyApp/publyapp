import type { JsonValue } from '../../types/json.types';
import type { AnalyticsEvent, AnalyticsProperties } from './analytics.types';

const SENSITIVE_KEY =
	/password|passwd|passphrase|secret|token|authorization|cookie|api[-_]?key|credential|email|phone|iban|ssn/i;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const REDACTED = '[REDACTED]';

const maskText = (value: string): string =>
	value.replace(EMAIL_PATTERN, '[redacted-email]');

const isList = (value: JsonValue): value is readonly JsonValue[] =>
	Array.isArray(value);

const maskValue = (value: JsonValue): JsonValue => {
	if (typeof value === 'string') {
		return maskText(value);
	}
	if (isList(value)) {
		return value.map(maskValue);
	}
	if (typeof value !== 'object' || value === null) {
		return value;
	}
	return maskProperties(value);
};

const maskProperties = (
	properties: AnalyticsProperties,
): AnalyticsProperties => {
	const masked: AnalyticsProperties = {};
	for (const [key, value] of Object.entries(properties)) {
		masked[key] = SENSITIVE_KEY.test(key) ? REDACTED : maskValue(value);
	}
	return masked;
};

type MaskedError = Error | string | number | boolean | null;

const maskError = (error: unknown): MaskedError => {
	if (error instanceof Error) {
		const masked = new Error(maskText(error.message));
		masked.name = error.name;
		if (error.stack) {
			masked.stack = maskText(error.stack);
		}
		return masked;
	}
	if (typeof error === 'string') {
		return maskText(error);
	}
	if (
		error === null ||
		typeof error === 'number' ||
		typeof error === 'boolean'
	) {
		return error;
	}
	return '[redacted-error]';
};

/** Redact exactly once, at the service boundary, before any adapter sees it. */
export const maskAnalyticsEvent = (event: AnalyticsEvent): AnalyticsEvent => {
	switch (event.type) {
		case 'capture':
			return {
				...event,
				distinctId: maskText(event.distinctId),
				properties: event.properties && maskProperties(event.properties),
			};
		case 'identify':
			return {
				...event,
				distinctId: maskText(event.distinctId),
				properties: event.properties && maskProperties(event.properties),
				propertiesSetOnce:
					event.propertiesSetOnce && maskProperties(event.propertiesSetOnce),
			};
		case 'exception':
			return {
				...event,
				distinctId: event.distinctId && maskText(event.distinctId),
				error: maskError(event.error),
				additionalProperties:
					event.additionalProperties &&
					maskProperties(event.additionalProperties),
			};
	}
};
