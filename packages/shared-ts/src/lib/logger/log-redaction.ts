import type { LogEntry, LogMeta, LogValue } from './logger.types';

// Aligned on apps/api/Infrastructure/Jobs/JobErrorSanitizer.cs and
// apps/api/Lib/Logging/SanitizingLogEventSink.cs: e-mails and long token-shaped
// blobs in text, control characters collapsed, bounded depth and length. Sensitive
// keys are masked by name too, which the C# sink does through its destructuring.
const SENSITIVE_KEY =
	/password|passwd|passphrase|secret|token|authorization|cookie|api[-_]?key|credential|email|phone|iban|card(number)?|ssn/i;
// Correlation data: masked by name nowhere and kept token-shaped on purpose.
const SAFE_KEYS = new Set([
	'emailhash',
	'requestid',
	'tokentype',
	'tokencount',
]);
const TOKEN_PATTERN = /[A-Za-z0-9_\-+=]{24,}/g; // no '/': paths stay readable

const TEXT_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
	[/[\x00-\x1F]+/g, ' '],
	[/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@'],
	[/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted-jwt]'],
	[/\bBearer\s+\S+/gi, 'Bearer [REDACTED]'],
	[/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[redacted-email]'],
	[/\+\d[\d\s().-]{7,}\d|\b0\d([\s.-]?\d{2}){4}\b/g, '[redacted-phone]'],
];

// Same bound and sentinel as SanitizingLogEventSink._MaxPropertyDepth and
// _DepthExceededSentinel in the API sink.
const MAX_DEPTH = 20;
const MAX_ITEMS = 100;
const MAX_LENGTH = 2048;
const DEPTH_EXCEEDED = '[redacted-depth-exceeded]';
const TRUNCATED = '[Truncated]';

export const redactText = (text: string, keepTokens = false): string => {
	let result = text;
	for (const [pattern, replacement] of TEXT_PATTERNS) {
		result = result.replace(pattern, replacement);
	}
	if (!keepTokens) {
		result = result.replace(TOKEN_PATTERN, '[redacted-token]');
	}
	if (result.length <= MAX_LENGTH) {
		return result;
	}
	return `${result.slice(0, MAX_LENGTH)}${TRUNCATED}`;
};

const isSensitiveKey = (key: string) =>
	SENSITIVE_KEY.test(key) && !SAFE_KEYS.has(key.toLowerCase());

type Seen = ReadonlySet<object>;
type LogObject = { [key: string]: LogValue };

const isList = (
	value: LogObject | readonly LogValue[],
): value is readonly LogValue[] => Array.isArray(value);

const redactError = (error: Error, seen: Seen, depth: number): LogValue => {
	const { code } = error as { code?: string };
	return {
		name: error.name,
		message: redactText(error.message),
		code: typeof code === 'string' ? redactText(code) : code,
		stack: error.stack && redactText(error.stack),
		cause: error.cause && redactValue(error.cause as LogValue, seen, depth + 1),
	};
};

// Mirrors SanitizingLogEventSink._SanitizeDictionaryKey: render the key through
// the text sanitizer, then suffix collisions so no property is silently lost.
const sanitizeKey = (key: string, used: Set<string>): string => {
	const redacted = redactText(key);
	let candidate = redacted;
	// ponytail: restart the suffix scan; MAX_ITEMS is 100, a map buys nothing.
	for (let suffix = 2; used.has(candidate); suffix++) {
		candidate = `${redacted} #${suffix}`;
	}
	used.add(candidate);
	return candidate;
};

const redactEntries = (
	object: LogObject,
	seen: Seen,
	depth: number,
): LogValue => {
	const usedKeys = new Set<string>();
	return Object.fromEntries(
		Object.entries(object)
			.slice(0, MAX_ITEMS)
			.map(([key, value]) => [
				sanitizeKey(key, usedKeys),
				isSensitiveKey(key)
					? '[REDACTED]'
					: redactValue(
							value,
							seen,
							depth + 1,
							SAFE_KEYS.has(key.toLowerCase()),
						),
			]),
	);
};

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

const redactValue = (
	value: LogValue,
	seen: Seen,
	depth: number,
	keepTokens = false,
): LogValue => {
	if (typeof value === 'string') {
		return redactText(value, keepTokens);
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
		return DEPTH_EXCEEDED;
	}
	return redactObject(value, seen, depth);
};

export const redactMeta = (meta: LogMeta): LogMeta =>
	redactEntries(meta, new Set(), -1) as LogMeta;

/** Redact exactly once, at the service boundary, before any adapter sees it. */
export const redactEntry = (entry: LogEntry): LogEntry => ({
	...entry,
	message: redactText(entry.message),
	meta: entry.meta && redactMeta(entry.meta),
});
