/**
 * Counts post text the way the providers do (issue #2169). The API counterpart is
 * `Publishing/Lib/TextCounter.cs`; both run `text-counter-fixtures.json`, so the two
 * must agree on every fixture string.
 */

/** Counts by counting-rule unit. The server names the units a destination
 * enforces; a unit this browser cannot count is skipped (the server decides).
 * A URL-weighted unit (Mastodon's `characters`) is counted per destination from
 * `<unit>-rest` (the text without its URLs) and `urls` (see `unitCount`). */
export type TextCounts = Record<string, number>;

/** One enforced limit: `urlWeight` is what each URL counts as, for a
 * URL-weighted unit (Mastodon's `characters_reserved_per_url`). */
export type TextLimit = {
	unit: string;
	max: number;
	urlWeight?: number | null;
};

/** One destination's effective capability, as returned by
 * `GET /publishing/publish-targets` (issue #2173): no number lives in the front. */
export type DestinationLimits = {
	textLimits: TextLimit[];
	maxImages: number;
	maxImageBytes: number;
	acceptedImageContentTypes: string[];
};

/** One destination's limits, as returned by `GET /publishing/publish-targets`. */
export type LimitedDestination = { label: string; limits: DestinationLimits };

type LimitState = 'ok' | 'warning' | 'error';

export type TightestLimit = {
	state: LimitState;
	destination: string;
	unit: string;
	actual: number;
	limit: number;
};

/** Warning starts at 90 percent of a limit; the error state is strictly above it. */
const WARNING_RATIO = 0.9;

/** The ONE explicit trailing-trim set; mirrors `_TrailingTrim` in
 * Publishing/Lib/TextCounter.cs (not `trimEnd()`, which differs from .NET). */
const TRAILING_TRIM = new Set(
	'\t\n\v\f\r \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff',
);

/** CRLF/CR become LF and trailing whitespace is trimmed (counted AND published).
 * A backwards scan, not a `[...]+$` regex: the regex retries at every space and
 * goes quadratic on long whitespace runs (~134 ms per keystroke at 20,000). */
const normalizeText = (text: string): string => {
	const lf = text.replace(/\r\n?/g, '\n');
	let end = lf.length;
	while (end > 0 && TRAILING_TRIM.has(lf[end - 1] ?? '')) {
		end--;
	}
	return lf.slice(0, end);
};

/** Mirrors `MastodonCountingRule` in Publishing/Providers/Capabilities: a URL is
 * `http(s)://` plus a run of ASCII RFC 3986 URL characters that ends on a
 * non-punctuation character (any whitespace or non-ASCII character ends it); a remote
 * mention `@user@host` counts as `@user`. ASCII-only classes keep the .NET and JS
 * regex engines identical; both run `text-counter-fixtures.json`. */
const URL_PATTERN =
	/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*[A-Za-z0-9\-_~/#@$&*+=%([]/g;
const MENTION_PATTERN =
	/(?<![A-Za-z0-9_/=])@([A-Za-z0-9_]+)@[A-Za-z0-9.-]*[A-Za-z0-9]/g;

const segmenter =
	typeof Intl !== 'undefined' && 'Segmenter' in Intl
		? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
		: null;

const utf8 = new TextEncoder();

export const countText = (text: string) => {
	const normalized = normalizeText(text);
	const withoutMentionHosts = normalized.replace(MENTION_PATTERN, '@$1');
	let urls = 0;
	const rest = withoutMentionHosts.replace(URL_PATTERN, () => {
		urls += 1;
		return '';
	});
	let graphemes = 0;
	if (segmenter) {
		for (const _segment of segmenter.segment(normalized)) {
			graphemes += 1;
		}
	} else {
		// Code points: the best available approximation without Intl.Segmenter.
		graphemes = Array.from(normalized).length;
	}
	return {
		graphemes,
		bytes: utf8.encode(normalized).length,
		'characters-rest': Array.from(rest).length,
		urls,
	};
};

/** The count of one limit's unit, or undefined when this browser cannot count it. */
export const unitCount = (
	counts: TextCounts,
	{ unit, urlWeight }: TextLimit,
): number | undefined => {
	if (urlWeight === undefined || urlWeight === null) {
		return counts[unit];
	}
	const rest = counts[`${unit}-rest`];
	const urls = counts['urls'];
	if (rest === undefined || urls === undefined) {
		return undefined;
	}
	return rest + urls * urlWeight;
};

const toState = (actual: number, limit: number): LimitState => {
	if (actual > limit) {
		return 'error';
	}
	return actual >= limit * WARNING_RATIO ? 'warning' : 'ok';
};

const severity = { ok: 0, warning: 1, error: 2 } satisfies Record<
	LimitState,
	number
>;

/**
 * The tightest limit across the selected destinations (highest used ratio over
 * both units), or null when nothing is selected.
 */
export const tightestLimit = (
	counts: TextCounts,
	destinations: readonly LimitedDestination[],
): TightestLimit | null => {
	let tightest: (TightestLimit & { ratio: number }) | null = null;

	for (const destination of destinations) {
		const candidates = destination.limits.textLimits.flatMap((textLimit) => {
			const actual = unitCount(counts, textLimit);
			if (actual === undefined) {
				return [];
			}
			return [{ unit: textLimit.unit, actual, limit: textLimit.max }];
		});

		for (const candidate of candidates) {
			const ratio = candidate.actual / candidate.limit;
			const state = toState(candidate.actual, candidate.limit);
			const isTighter =
				tightest === null ||
				severity[state] > severity[tightest.state] ||
				(severity[state] === severity[tightest.state] &&
					ratio > tightest.ratio);
			if (isTighter) {
				tightest = {
					...candidate,
					state,
					destination: destination.label,
					ratio,
				};
			}
		}
	}

	if (tightest === null) {
		return null;
	}
	const { ratio: _ratio, ...result } = tightest;
	return result;
};
