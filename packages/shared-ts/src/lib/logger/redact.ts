import type { LogMeta, LogValue } from './logger.contract';

// Aligned on apps/api/Lib/Logging/SanitizingLogEventSink.cs (+ JobErrorSanitizer):
// e-mails and token-shaped blobs in text, bounded depth. Plus key-based masking.
const SENSITIVE_KEY =
	/password|passwd|passphrase|secret|token|authorization|cookie|api[-_]?key|credential|email|phone|iban|card(number)?$/i;
const SAFE_KEYS = new Set(['emailhash', 'tokentype', 'tokencount']);

const TEXT_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
	[/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@'],
	[/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted-jwt]'],
	[/\bBearer\s+\S+/gi, 'Bearer [REDACTED]'],
	[/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[redacted-email]'],
	[/\+\d[\d\s().-]{7,}\d|\b0\d([\s.-]?\d{2}){4}\b/g, '[redacted-phone]'],
	[/[A-Za-z0-9_\-+=]{24,}/g, '[redacted-token]'], // no '/': paths stay readable
];

const MAX_DEPTH = 6;
const MAX_ITEMS = 100;
const TRUNCATED = '[Truncated]';

export const redactText = (text: string): string => {
	let result = text;
	for (const [pattern, replacement] of TEXT_PATTERNS) {
		result = result.replace(pattern, replacement);
	}
	return result;
};

const isSensitiveKey = (key: string) =>
	SENSITIVE_KEY.test(key) && !SAFE_KEYS.has(key.toLowerCase());

type Seen = ReadonlySet<object>;
type LogObject = { [key: string]: LogValue };

const isList = (
	value: LogObject | readonly LogValue[],
): value is readonly LogValue[] => Array.isArray(value);

const redactError = (error: Error, seen: Seen, depth: number): LogValue => ({
	name: error.name,
	message: redactText(error.message),
	code: (error as { code?: string }).code,
	stack: error.stack && redactText(error.stack),
	cause: error.cause && redactValue(error.cause as LogValue, seen, depth + 1),
});

const redactEntries = (
	object: LogObject,
	seen: Seen,
	depth: number,
): LogValue =>
	Object.fromEntries(
		Object.entries(object)
			.slice(0, MAX_ITEMS)
			.map(([key, value]) => [
				key,
				isSensitiveKey(key)
					? '[REDACTED]'
					: redactValue(value, seen, depth + 1),
			]),
	);

const redactArray = (
	items: readonly LogValue[],
	seen: Seen,
	depth: number,
): LogValue => {
	const kept = items
		.slice(0, MAX_ITEMS)
		.map((item) => redactValue(item, seen, depth + 1));
	return items.length > MAX_ITEMS ? [...kept, TRUNCATED] : kept;
};

const redactObject = (
	value: Error | readonly LogValue[] | LogObject,
	seen: Seen,
	depth: number,
): LogValue => {
	const path = new Set(seen).add(value); // ancestors only: shared refs are fine
	if (value instanceof Error) {
		return redactError(value, path, depth);
	}
	if (isList(value)) {
		return redactArray(value, path, depth);
	}
	return redactEntries(value, path, depth);
};

const redactValue = (value: LogValue, seen: Seen, depth: number): LogValue => {
	if (typeof value === 'string') {
		return redactText(value);
	}
	if (typeof value !== 'object' || value === null) {
		return value;
	}
	if (value instanceof Date) {
		return (value as Date).toISOString();
	}
	if (seen.has(value)) {
		return '[Circular]';
	}
	if (depth >= MAX_DEPTH) {
		return TRUNCATED;
	}
	return redactObject(value, seen, depth);
};

export const redactMeta = (meta: LogMeta): LogMeta =>
	redactEntries(meta, new Set(), -1) as LogMeta;
