import { SESSION_TOKEN_HEADER_KEY } from './constants';

const REDACTED_SESSION_TOKEN = '[REDACTED]';

type HeaderShape = HeadersInit | Record<string, string> | [string, string][];

const normalizeHeaderName = (name: string): string => name.toLowerCase();

const shouldRedactHeader = (name: string): boolean =>
	normalizeHeaderName(name) === normalizeHeaderName(SESSION_TOKEN_HEADER_KEY) ||
	normalizeHeaderName(name) === 'authorization';

export const redactHeaders = (
	headers: HeaderShape | undefined,
): Record<string, string> => {
	const output: Record<string, string> = {};

	const normalized = new Headers();
	if (headers instanceof Headers) {
		headers.forEach((value, key) => {
			normalized.set(key, value);
		});
	} else if (Array.isArray(headers)) {
		for (const [name, value] of headers) {
			normalized.set(name, value);
		}
	} else if (typeof headers === 'object' && headers !== null) {
		for (const [name, value] of Object.entries(headers)) {
			normalized.set(name, value);
		}
	} else {
		return output;
	}

	normalized.forEach((value, key) => {
		output[key] = shouldRedactHeader(key) ? REDACTED_SESSION_TOKEN : value;
	});

	return output;
};
