/**
 * Counts post text the way the providers do (issue #2169). The API counterpart is
 * `Publishing/Lib/TextCounter.cs`; both run `text-counter-fixtures.json`, so the two
 * must agree on every fixture string.
 */

export type TextCounts = { graphemes: number; bytes: number };

export type TextLimits = { maxTextGraphemes: number; maxTextBytes: number };

export type LimitUnit = 'graphemes' | 'bytes';

/** One destination's limits, as returned by `GET /publishing/publish-targets`. */
export type LimitedDestination = { label: string; limits: TextLimits };

export type LimitState = 'ok' | 'warning' | 'error';

export type TightestLimit = {
	state: LimitState;
	destination: string;
	unit: LimitUnit;
	actual: number;
	limit: number;
};

/** Warning starts at 90 percent of a limit; the error state is strictly above it. */
const WARNING_RATIO = 0.9;

/** The ONE explicit trailing-trim set; mirrors `_TrailingTrim` in
 * Publishing/Lib/TextCounter.cs (not `trimEnd()`, which differs from .NET). */
const TRAILING_TRIM =
	/[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$/;

/** CRLF/CR become LF and trailing whitespace is trimmed (counted AND published). */
export const normalizeText = (text: string): string =>
	text.replace(/\r\n?/g, '\n').replace(TRAILING_TRIM, '');

const segmenter =
	typeof Intl !== 'undefined' && 'Segmenter' in Intl
		? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
		: null;

const utf8 = new TextEncoder();

export const countText = (text: string): TextCounts => {
	const normalized = normalizeText(text);
	let graphemes = 0;
	if (segmenter) {
		for (const _segment of segmenter.segment(normalized)) {
			graphemes += 1;
		}
	} else {
		// Code points: the best available approximation without Intl.Segmenter.
		graphemes = Array.from(normalized).length;
	}
	return { graphemes, bytes: utf8.encode(normalized).length };
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
		const candidates: { unit: LimitUnit; actual: number; limit: number }[] = [
			{
				unit: 'graphemes',
				actual: counts.graphemes,
				limit: destination.limits.maxTextGraphemes,
			},
			{
				unit: 'bytes',
				actual: counts.bytes,
				limit: destination.limits.maxTextBytes,
			},
		];

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
