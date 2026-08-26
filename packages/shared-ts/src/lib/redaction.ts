import { SESSION_TOKEN_HEADER_KEY } from './constants';

const REDACTED_SESSION_TOKEN = '[REDACTED]';

const SESSION_HEADER_NAMES = new Set([
	SESSION_TOKEN_HEADER_KEY.toLowerCase(),
	'authorization',
	'proxy-authorization',
	'cookie',
	'set-cookie',
]);

type HeaderInput = HeadersInit | Record<string, string> | [string, string][];

const shouldRedactHeader = (name: string): boolean =>
	SESSION_HEADER_NAMES.has(name.toLowerCase());

export const redactHeaders = (headers: HeaderInput | undefined) => {
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
