/** A follow-up segment as the composer holds it: the id is the stable React
 * key, so reordering never swaps DOM state between segments. */
export type SegmentDraft = { id: string; text: string };

export const newSegmentDraft = (
	text = '',
	id: string = crypto.randomUUID(),
): SegmentDraft => ({ id, text });

/** Shared empty list: a stable default for watched form values. */
export const NO_SEGMENTS: SegmentDraft[] = [];
